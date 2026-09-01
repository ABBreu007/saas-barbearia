# SaaS Barbearia — Backend

SaaS de gestão para barbearias (backend + frontend), construído em Next.js (TypeScript) sobre Postgres/Supabase. As 5 telas do roadmap original (Agenda, Serviços, Painel, Conta, Página pública) mais a tela de Clientes estão implementadas e testadas — ver seção 8. Este documento descreve o que existe **hoje** no código — para as decisões de arquitetura, custos e precificação, ver o plano original em `C:\Users\joao.abreu\.claude\plans\cheeky-moseying-charm.md`. Para o design original das telas, ver `../design_handoff_saas_barbearia/README.md`.

---

## 1. Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), TypeScript |
| Banco de dados | PostgreSQL via Supabase |
| ORM | Prisma 6 |
| Auth | Supabase Auth (JWT via cookies) |
| Storage de imagens | Supabase Storage (bucket `barbershop-media`, ainda **não criado**) |
| Pagamentos | Mercado Pago — PreApproval API (assinatura recorrente) — **integração adiada**, credenciais ainda não configuradas |
| Validação | Zod |
| Estilo | CSS puro com design tokens em `app/globals.css` |
| Hospedagem alvo | Vercel |

---

## 2. Estrutura de pastas

```
saas-app/
  app/
    api/                    ← todas as rotas de backend (ver seção 4)
    globals.css              ← design tokens (cores, tipografia, espaçamento) do handoff
    layout.tsx / page.tsx    ← ainda o placeholder padrão do create-next-app
  lib/
    prisma.ts                 ← client Prisma singleton
    auth.ts                   ← requireStaff() — resolve staff autenticado a partir do JWT
    mercadopago.ts             ← client PreApproval do Mercado Pago
    supabase/
      client.ts                ← client Supabase para o browser (chave anon)
      server.ts                 ← client Supabase para Server Components/Route Handlers
      admin.ts                  ← client Supabase com service role (bypassa RLS — só server-side)
  prisma/
    schema.prisma              ← modelo de dados completo
    rls.sql                    ← policies de Row Level Security (aplicado ao banco)
    migrations/                ← histórico de migrations já aplicadas
  proxy.ts                    ← middleware do Next.js 16 (renomeado de middleware.ts) — refresh de sessão Supabase
  .env / .env.example          ← variáveis de ambiente (ver seção 6)
```

---

## 3. Modelo de dados

Multi-tenant: toda tabela de negócio tem `barbershopId`. Tabelas (nomes reais no Postgres, snake_case só no nome da tabela — colunas ficam em **camelCase entre aspas**, ex.: `"barbershopId"`, porque é assim que o Prisma gera por padrão):

- **barbershops** — dados da barbearia (nome, slug público, banner/avatar, modo dono/autônomo, redes sociais)
- **staff** — barbeiros/donos; `authUserId` liga 1:1 com o usuário do Supabase Auth
- **services** — serviços oferecidos (nome, duração, preço em centavos, ativo)
- **clients** — clientes finais de cada barbearia (nome, telefone, e-mail); único por `(barbershopId, phone)`
- **appointments** — agendamentos (cliente, serviço, barbeiro opcional, horário, status, preço no momento do agendamento)
- **business_hours** — horário de funcionamento por dia da semana (0–6), em minutos desde meia-noite
- **time_off** — dias de folga/ausência
- **reviews** — avaliações do cliente final (nome, nota 1–5, comentário)
- **subscriptions** — plano (FREE/PRO), status e vínculo com a assinatura no Mercado Pago
- **products** — produtos físicos vendidos na comanda (nome, preço, estoque opcional, ativo)
- **orders** / **order_items** — comanda de um atendimento (serviço + produtos vendidos); nasce ao clicar "Concluir" num agendamento ou como venda avulsa; `totalCents` é snapshot, não recalculado
- **commissions** — uma linha por `order_item`, com taxa (`rateBps`) e valor travados no momento da venda
- **cash_registers** / **cash_movements** — caixa diário (1 registro por barbearia por data, igual `time_off`); movimentos de venda são criados automaticamente ao fechar uma comanda com caixa aberto, movimentos manuais (despesa/sangria/ajuste) são lançados à parte
- **staff_time_blocks** — bloqueio de horário pontual (início/fim livres), opcionalmente restrito a um profissional — complementa `business_hours` (semanal) e `time_off` (dia inteiro)
- **barbershop_settings** — configurações da barbearia (1:1, igual `subscriptions`): comissão padrão de serviço/produto e campos de sinal antecipado (`depositRequired`/`depositType`/`depositValue`/`cancellationHoursForFullRefund` — já existem no schema mas ainda sem efeito no agendamento, aguardando a integração de pagamento)

Métricas do Painel (faturamento, clientes atendidos, faltas, serviços mais vendidos, faturamento por barbeiro) **não têm tabela própria** — são calculadas sob demanda via agregação SQL em cima de `appointments` (ver `/api/metrics`). Isso continua valendo mesmo com `orders` existindo: o Painel ainda soma `Appointment.priceCents`, não `Order.totalCents` — repontar isso é trabalho da próxima fase (sinal/split de pagamento), quando "agendado" e "pago de verdade" passam a poder divergir.

---

## 4. Rotas de API

Todas as rotas privadas exigem sessão Supabase — via **cookie** (fluxo do frontend) ou **`Authorization: Bearer <token>`** (útil para testes e para um futuro app mobile) — resolvida por `requireStaff()`, que já escopa toda query pelo `barbershopId` do usuário logado. Nunca confiam em um `barbershopId` vindo do corpo da requisição.

### Autenticação / Cadastro

**Autocadastro público está DESATIVADO** (`SELF_SIGNUP_ENABLED = false` em `lib/config.ts`) — decisão do dono do produto pra evitar a fragilidade de confirmação por e-mail nesta fase inicial. `/signup` mostra uma mensagem de "cadastro sob consulta" e `POST /api/auth/signup` responde `403 signup_closed` sempre que a flag estiver desligada. Novas barbearias são criadas manualmente com `node scripts/criar-barbearia.mjs` (prompt interativo no terminal — nome, dono, telefone, e-mail; gera senha forte sozinho e cria o usuário já com e-mail confirmado via `admin.createUser({email_confirm: true})`, sem mandar e-mail nenhum). Pra reabrir o autocadastro no futuro, é só virar a flag pra `true`.

| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/auth/signup` | POST | ❌ público (mas fechado, ver acima) | Cria usuário no Supabase Auth (**não confirmado** — precisa clicar no link do e-mail, ver seção 8) + `Barbershop` + `Staff` (OWNER) + `Subscription` (FREE/TRIALING) `{email, password, barbershopName, ownerName, phone}`. Se a criação da barbearia falhar depois do usuário Auth já existir, o usuário é removido (compensação manual, já que Auth e Postgres não compartilham uma transação). |
| `/auth/confirm` | GET (página) | ❌ público | Destino do link de confirmação de e-mail. Client-side (ver seção 8 — o motivo é técnico, não estético). |
| `/esqueci-senha` | GET (página) | ❌ público | Formulário de e-mail; chama `supabase.auth.resetPasswordForEmail()` direto do client. |
| `/redefinir-senha` | GET (página) | ❌ público | Destino do link de redefinição de senha — mesmo mecanismo client-side de `/auth/confirm` (token no fragmento da URL), seguido de formulário de nova senha (`supabase.auth.updateUser({password})`). |

Login **não** tem rota própria — é feito direto pelo Supabase Auth (`supabase.auth.signInWithPassword()` no client, ou `POST {SUPABASE_URL}/auth/v1/token?grant_type=password` para testes), sem passar pelo Next.js.

### Serviços
| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/services` | GET | ✅ | Lista serviços da barbearia |
| `/api/services` | POST | ✅ | Cria serviço `{name, durationMin, priceCents}` |
| `/api/services/[id]` | PATCH | ✅ | Edita (preço, nome, duração, ativo) — a UI de Serviços agora expõe nome e duração na edição, antes só preço |
| `/api/services/[id]` | DELETE | ✅ | Remove |

### Agenda
| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/appointments?from=&to=` | GET | ✅ | Lista agendamentos no período (Dia/Semana/Mês) |
| `/api/appointments` | POST | ✅ | Cria agendamento `{clientId, serviceId, staffId?, startTime}` |
| `/api/appointments/[id]` | PATCH | ✅ | Atualiza status (`CONFIRMED`, `CANCELLED`, `NO_SHOW`, `COMPLETED`) — usada pelo modal de ação da Agenda (clicar num agendamento) |
| `/api/appointments/[id]` | DELETE | ✅ | Remove |

### Painel / Métricas / Comissões
| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/metrics?period=dia\|semana\|mes` | GET | ✅ (OWNER) | Faturamento, clientes atendidos, faltas (+ variação vs período anterior), serviços mais vendidos, faturamento por barbeiro (+ nº de atendimentos), avaliação média (+ tendência), destaques automáticos (`highlights`) e flag `hasData` — tudo calculado on-the-fly em `lib/data/metrics.ts`. Financeiro é só do dono — `BARBER` recebe 403 |
| `/api/commissions?period=dia\|semana\|mes&staffId=` | GET | ✅ | Comissões do período (`lib/data/commissions.ts`). `staffId` só tem efeito pro OWNER (vê a equipe toda sem o parâmetro, ou filtra por um profissional); um `BARBER` sempre vê só a própria comissão, mesmo passando o `staffId` de outra pessoa |

### Conta — Horários e folgas
| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/business-hours` | GET | ✅ | Retorna os 7 dias |
| `/api/business-hours` | PUT | ✅ | Substitui os 7 dias de uma vez `{days: [{weekday, isOpen, openMinutes, closeMinutes, breakStartMinutes?, breakDurationMin?}]}`, com validação de min. 30min entre abre/fecha e da pausa caber dentro do expediente |
| `/api/time-off` | GET / POST / DELETE | ✅ | CRUD de folgas (dia inteiro) |
| `/api/time-blocks` | GET / POST / DELETE | ✅ | CRUD de bloqueios pontuais `{staffId?, startTime, endTime, reason?}` — intervalo livre, opcionalmente por profissional |

### Produtos, comandas, caixa e comissões
| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/products` | GET / POST | ✅ | CRUD de produtos, mesmo padrão de `/api/services` |
| `/api/products/[id]` | PATCH / DELETE | ✅ | Edita/remove (desativa em vez de apagar se já foi vendido) |
| `/api/orders` | POST | ✅ | Cria uma comanda `{appointmentId? \| (clientId & staffId), items: [{kind: "SERVICE"\|"PRODUCT", refId, quantity}], close?}` numa transação: cria `Order`+`OrderItem`(s)+`Commission`(s) (taxa vinda de `BarbershopSettings`), marca o `Appointment` `COMPLETED` se houver, e lança `CashMovement` automaticamente se houver caixa aberto hoje. Um `BARBER` só pode lançar comanda em nome dele mesmo — `staffId` diferente do próprio é rejeitado (403), mesmo que o cliente informe outro id na requisição |
| `/api/orders` | GET | ✅ | Lista comandas (opcionalmente `?clientId=`) |
| `/api/cash-register` | GET | ✅ (OWNER) | Caixa de hoje (com movimentos) + histórico dos últimos 31 registros |
| `/api/cash-register` | POST | ✅ (OWNER) | Abre o caixa do dia `{openingBalanceCents}` — só 1 por barbearia por data |
| `/api/cash-register/[id]/close` | PATCH | ✅ (OWNER) | Fecha o caixa `{countedClosingBalanceCents}` — calcula `expectedClosingBalanceCents` somando os movimentos |
| `/api/cash-register/[id]/movements` | POST | ✅ (OWNER) | Lançamento manual `{type: "EXPENSE"\|"WITHDRAWAL"\|"ADJUSTMENT", amountCents, description?}` |
| `/api/settings` | GET / PATCH | ✅ (OWNER) | Configurações da barbearia — comissão padrão de serviço/produto e campos de sinal (ainda sem efeito no agendamento) |

### Avaliações
| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/reviews` | GET | ✅ | Lista avaliações (uso interno) |
| `/api/reviews` | POST | ❌ público | Cliente final avalia `{barbershopSlug, clientName, rating, comment?}` |

### Página pública (cliente final)
| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/public/[slug]?date=&staffId=` | GET | ❌ público | Dados da barbearia (incluindo lista de `staff`), serviços ativos, avaliações, horário de funcionamento e (se `date` informado) horários disponíveis — se `staffId` também for informado, a disponibilidade é calculada só pra aquele barbeiro, não pra barbearia inteira |
| `/api/public/[slug]/book` | POST | ❌ público | Cliente cria agendamento `{serviceId, startTime, clientName, clientPhone, staffId?, useClientPlan?}` — usa `validateAppointmentAvailability` (`lib/data/public-page.ts`), a mesma checagem completa da agenda interna: horário de funcionamento, pausa, folga, bloqueio pontual (`StaffTimeBlock`) e conflito de agendamento, escopados por `staffId` quando informado. Se `useClientPlan`, roda dentro de uma transação com `pg_advisory_xact_lock` sobre a matrícula, pra duas requisições simultâneas não conseguirem "gastar" o mesmo último crédito do plano |
| `/api/public/[slug]/appointments?phone=` | GET | ❌ público | Cliente busca os próprios agendamentos futuros (não cancelados) pelo telefone usado no agendamento |
| `/api/public/[slug]/appointments/[id]/cancel` | POST | ❌ público* | Cliente cancela um agendamento `{phone}` — exige que o telefone bata com o do cliente dono do agendamento. *Sem login de cliente nesta MVP: o telefone funciona como credencial informal (mesmo nível de confiança de um link de cancelamento por e-mail sem conta). Ver nota de segurança na seção 5.* |
| `/api/public/[slug]/data-request` | POST | ❌ público* | Direito de exclusão do titular (LGPD Art. 18) pro cliente final `{phone}` — anonimiza o `Client` (nome vira "Cliente removido", telefone/e-mail viram null) em vez de apagar de verdade, preservando o histórico de faturamento da barbearia. Mesmo modelo de credencial por telefone da rota de cancelamento. |

### Assinatura e upload
| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/subscriptions/webhook` | POST | assinatura HMAC | Recebe eventos do Mercado Pago, valida `x-signature`, atualiza status da assinatura |
| `/api/upload/sign` | POST | ✅ | Gera signed upload URL do Supabase Storage para banner/avatar `{kind: "banner"\|"avatar", fileExt}` |
| `/api/barbershop` | DELETE | ✅ (OWNER) | Exclusão de conta a pedido do titular (LGPD Art. 18) `{confirmName}` — exige repetir o nome exato da barbearia. Apaga a `Barbershop` (cascade cuida do resto no Postgres) e todos os usuários Supabase Auth vinculados (staff da barbearia). Só o OWNER pode chamar. |

---

## 5. Segurança implementada

- **Isolamento multi-tenant em código**: toda rota privada usa `requireStaff()` e filtra por `barbershopId` — nunca aceita esse campo vindo do cliente.
- **RLS no Postgres**: ativado nas 9 tabelas via `prisma/rls.sql`, com policies que restringem cada `staff` autenticado à própria barbearia. Serve como camada extra de defesa caso algo no futuro acesse o Supabase diretamente do browser (hoje tudo passa pelas API routes, que conectam como owner do schema e por isso não são afetadas pela RLS — a RLS protege contra uso indevido da chave anônima, não substitui os `WHERE barbershopId = ...` das rotas).
- **Validação de entrada** com Zod em toda rota que recebe body.
- **Webhook do Mercado Pago** valida a assinatura HMAC (`x-signature`) antes de processar qualquer evento — implementado, mas ainda não testável até as credenciais serem configuradas.
- **Uploads** passam por signed URL gerada no backend (nunca sobe direto com uma chave pública fixa) e são escopados por `barbershopId` no path do arquivo.
- **Segredos**: `SUPABASE_SERVICE_ROLE_KEY` e `MERCADOPAGO_ACCESS_TOKEN` só são usados em código server-side (`lib/supabase/admin.ts`, `lib/mercadopago.ts`), nunca expostos ao client.
- **Proteção contra corrida (race condition)**: criar/remarcar agendamento e usar crédito de plano rodam dentro de `prisma.$transaction` com `pg_advisory_xact_lock` (uma trava por barbearia+dia e, quando aplicável, por barbeiro+dia ou por matrícula) — evita que duas requisições simultâneas dupliquem um horário ou gastem o mesmo último crédito de plano antes de qualquer uma commitar. Reforçado por um índice único parcial em `client_plans` (`clientId` com `status IN (PENDING, ACTIVE)`), que barra duas matrículas abertas do mesmo cliente mesmo se a checagem em código falhar.
- **Comanda não pode ser atribuída a outro profissional**: `POST /api/orders` força `staffId = staff.id` pra quem não é `OWNER`, ignorando qualquer valor diferente vindo da requisição — evita que um `BARBER` credite uma venda (e a comissão associada) a um colega.
- **Cancelamento de agendamento pelo cliente final (limitação conhecida, aceita para o MVP)**: como não há login de cliente, `/api/public/[slug]/appointments` e `.../[id]/cancel` usam o **telefone informado** como credencial — quem souber o telefone usado num agendamento consegue ver e cancelar os agendamentos futuros dele nessa barbearia. É o mesmo modelo de confiança de um link de cancelamento sem conta (comum em sistemas de reserva sem login). Não expõe dados de outras barbearias nem dados além de serviço/horário/preço. Se isso virar um problema real, a evolução natural é um código enviado por SMS/WhatsApp antes de listar os agendamentos.
- **LGPD**: Política de Privacidade real em `/privacidade` (linkada no cadastro, na página pública e em Conta), direito de exclusão do cliente final via `/api/public/[slug]/data-request` (anonimiza, não apaga de verdade — preserva histórico de faturamento da barbearia) e direito de exclusão da conta inteira via `DELETE /api/barbershop` (zona de perigo em Conta, só OWNER, exige digitar o nome da barbearia). Itens que ainda faltam: Termos de Uso formais e documentação mais detalhada de transferência internacional de dados (Supabase é uma empresa americana, mesmo com o banco fisicamente no Brasil).

---

## 6. Variáveis de ambiente

Ver `.env.example` para a lista completa e onde obter cada uma. Resumo:

| Variável | Uso |
|---|---|
| `DATABASE_URL` | Conexão via pooler (porta 6543) — usada em runtime pelas API routes |
| `DIRECT_URL` | Conexão direta (porta 5432) — usada só por `prisma migrate` |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente Supabase (browser e server, respeitando RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Cliente admin (bypassa RLS, só em API routes) |
| `MERCADOPAGO_ACCESS_TOKEN` / `MERCADOPAGO_WEBHOOK_SECRET` | Integração de assinatura — **ainda com valor placeholder** |

---

## 7. Status atual do banco (Supabase já configurado)

- ✅ Projeto Supabase criado e conectado — região **`sa-east-1` (São Paulo)**, migrado de `us-west-2` (Oregon) por latência (ver nota na seção 8)
- ✅ 19 tabelas migradas (`prisma migrate deploy` aplicado)
- ✅ RLS ativado + 19 policies aplicadas (`prisma db execute --file prisma/rls.sql`) — número já ficou desatualizado antes, então ao adicionar tabela nova conferir contando os blocos `alter table` no arquivo em vez de confiar neste texto
- ✅ Bucket `barbershop-media` do Storage criado (público, até 5MB, jpeg/png/webp) e validado com upload real via `/api/upload/sign`
- ✅ Supabase Auth (e-mail/senha) confirmado funcionando ponta a ponta: signup → login → chamada autenticada, testado com um usuário real

---

## 8. Frontend — status

Rotas implementadas (Next.js App Router, `app/(public)` = sem auth, `app/(app)` = protegido por `requireStaff()` no layout):

| Rota | Status |
|---|---|
| `/login` | ✅ Funcional contra o Supabase Auth real; mostra mensagem específica se o e-mail ainda não foi confirmado; link "Esqueci minha senha" |
| `/signup` | ✅ Cadastro com confirmação de senha (campo repetido) + confirmação de e-mail real (ver nota abaixo) — depois de cadastrar, mostra tela "Confirme seu e-mail" em vez de logar automaticamente; link pra Política de Privacidade |
| `/auth/confirm` | ✅ Destino do link do e-mail de confirmação; estabelece a sessão e manda pro Início |
| `/esqueci-senha` → `/redefinir-senha` | ✅ Fluxo completo de recuperação de senha via Supabase Auth (`resetPasswordForEmail` + `updateUser`) |
| `/privacidade` | ✅ Política de Privacidade (LGPD) — linkada no cadastro, na página pública e em Conta |
| `/onboarding` | ✅ Assistente de 4 passos no primeiro acesso (modo+endereço, horários com padrão pré-preenchido, primeiro serviço, foto de perfil+trial) — fora do grupo `(app)`, sem sidebar. `AppLayout` redireciona pra cá enquanto `Barbershop.onboardedAt` for nulo. |
| `/` (Início) | ✅ Foco em "hoje/agora" (distinto do Painel — ver nota abaixo). Faturamento realizado hoje + meta diária (opcional, com barra de progresso e indicador de status ▲/●/▼), aviso de agendamentos aguardando confirmação, contagem de horários livres restantes hoje, próximo cliente em destaque visual, estado vazio com ação ("Copiar link" + "Novo agendamento") em vez de mensagem sem saída. Avatar da barbearia (foto real, quando existe). |
| `/agenda` | ✅ Dia (timeline 08–20h) / Semana (lista mobile, grade desktop) / Mês (calendário), + criação de agendamento (cliente novo ou existente, por telefone). O modal "+ Novo agendamento" mostra um seletor de barbeiro quando a barbearia tem mais de 1 (mesma regra do agendamento público); sem isso, todo agendamento criado manualmente ficava atribuído a quem estava logado, mesmo quando outro barbeiro da equipe é quem ia atender de verdade — distorcia faturamento/ocupação por barbeiro no Painel. Sem seletor visível (1 barbeiro só), assume automaticamente quem está logado. Clicar num agendamento (visão Dia) abre um modal com **Confirmar / Cancelar / Marcar falta / Concluir**, que o barbeiro usa para mudar o status. Aceita `?staffId=` pra filtrar por barbeiro (usado pelo drill-down do Painel), com banner "Mostrando agenda de X · Limpar filtro". |
| `/servicos` | ✅ Lista + criar + editar (nome, duração e preço com stepper ±R$5) + remover (desativa se já tiver agendamento); tabela no desktop; estado vazio quando não há nenhum serviço ainda |
| `/painel` | ✅ Foco em análise histórica (distinto do Início — ver nota abaixo). Dia/Semana/Mês. Card de faturamento realizado (preto, mesma convenção do Início) com indicador de status vs meta do período, "esperado" só aparece quando diferente do realizado, faltas embutidas, meta mensal com barra de progresso. Destaques automáticos, 2 KPIs (Clientes atendidos, Avaliação média — só com nota numérica a partir de 3 avaliações), seção **Retenção & eficiência** (ticket médio, taxa de ocupação, taxa de faltas %, retenção de clientes), Serviços mais vendidos (com faturamento por serviço, barra de proporção só a partir de 5 vendas no período), Faturamento por barbeiro, comparativo com mês anterior (mensagem contextual no primeiro mês, em vez de card vazio com "—"). **Sem o gráfico de linha do protótipo** — decisão: não estava na lista de métricas explicitamente pedidas pelo cliente, só como visualização; pode ser adicionado depois. |
| `/conta` | ✅ Perfil (avatar real+nome+e-mail), modo Dono/Autônomo, card de assinatura (tier PRO com preço de piloto/cheio conforme `pilotPriceUntil`, ou "X dias restantes" durante o trial), compartilhar link+QR code, menu (com "Equipe", só pro OWNER), logout, zona de perigo "Excluir minha conta" (só OWNER, exige digitar o nome da barbearia) |
| `/conta/equipe` | ✅ Só OWNER (BARBER é redirecionado pra `/conta`). Lista a equipe, adiciona barbeiro (nome+e-mail+telefone opcional — servidor gera senha forte e cria o usuário já confirmado no Supabase Auth via `admin.createUser`, sem depender de e-mail) e remove (bloqueado pra OWNER; agendamentos do removido ficam com `staffId: null`, histórico preservado). Adicionar o 1º barbeiro extra corrige sozinho `mode: AUTONOMO → DONO` se a barbearia ainda estava marcada como autônoma — sem isso, o seletor de barbeiro da página pública ficava escondido mesmo com equipe cadastrada (bug real encontrado nesta sessão: usuário trocou o modo em Conta sem perceber a relação com o picker sumir). Cada linha tem um avatar clicável — upload direto pro Supabase Storage (mesmo mecanismo signed-URL de banner/avatar da barbearia, ver `/api/upload/sign` com `kind: "staffAvatar"`), que passa a aparecer no "Escolha o profissional" da página pública em vez das iniciais. OWNER edita a foto de qualquer um da equipe; cada staff também pode editar a própria — `PATCH /api/staff/[id]` valida isso. |
| `/conta/perfil` | ✅ Upload real de banner/avatar (Supabase Storage) + nome/descrição |
| `/conta/dados` | ✅ Endereço, Instagram, WhatsApp — dados que a rota `/api/barbershop` já aceitava, mas sem tela própria até agora |
| `/conta/horarios` | ✅ 7 dias com toggle + editor inline (stepper ±30min, validação abre/fecha) + folgas |
| `/clientes` | ✅ Tabela no desktop / lista de cards no mobile (cliente+avatar, telefone, visitas, última visita, total gasto), ordenada por última visita. Fora do roadmap original de 5 telas, construída depois. |
| Página pública `/[slug]` | ✅ Capa/banner, avatar+nome+rating+endereço, redes sociais, seleção de serviço, **seleção de profissional** (só em barbearias modo Dono com mais de 1 barbeiro; recalcula horários disponíveis pro barbeiro escolhido), **seleção de dia** (próximos 14 dias, não só hoje — cada troca de dia/barbeiro recalcula os horários disponíveis), confirmação de agendamento com botão de cancelar na hora, busca "Já tem um agendamento?" por telefone (lista + cancela agendamentos futuros), solicitação de exclusão de dados (LGPD), lista de avaliações + formulário de avaliação. Rota pública real, testada sem login. |

Navegação responsiva (mesmo código, mobile = tab bar / desktop = sidebar) em `app/(app)/nav.tsx`.

**`lib/timezone.ts`** — toda a lógica de "hoje/semana/mês" e agrupamento de agendamentos por dia usa esse módulo, nunca `Date` cru nem `.toISOString().slice(0,10)`. Isso já causou (e corrigiu) dois bugs reais nesta sessão: cálculo de dia usando fuso do servidor em vez de São Paulo, e agrupamento de agendamentos por UTC em vez de fuso local — ambos só aparecem perto da meia-noite, então são fáceis de reintroduzir sem perceber. Qualquer novo código que precise de "que dia é hoje" ou "esse agendamento é de que dia" deve usar as funções desse arquivo.

**`app/globals.css`** ganhou um reset global de `<button>` (`border/background: none`, `cursor: pointer`) — sem isso, botões estilizados só por cor/fonte (links de texto tipo "Editar", "✕") mostravam o chrome nativo do navegador por baixo do CSS. Encontrado construindo a tela Serviços; qualquer botão novo já se beneficia automaticamente.

**`POST /api/barbershop`** (novo) — PATCH para nome/descrição/modo/banner/avatar/redes sociais, usado por `/conta` (modo) e `/conta/perfil`.

**Race condition real encontrada em `/conta/perfil`**: se o usuário troca banner E avatar quase ao mesmo tempo e clica "Salvar" antes dos dois uploads terminarem, o formulário podia salvar sem uma das imagens (o `fetch` de save lia o estado React no momento do clique, que ainda não tinha a URL da imagem cujo upload não terminou). Corrigido desabilitando o botão "Salvar alterações" enquanto qualquer upload está em andamento (`uploading !== null`). **Limitação residual documentada, não corrigida**: ainda existe uma janela de poucos milissegundos entre um upload terminar e o próximo começar onde o botão pode reabilitar cedo demais — só reproduzível disparando dois uploads via automação quase simultaneamente; um humano selecionando arquivos não consegue essa velocidade. Não vale a complexidade de corrigir para o MVP.

**Bug real em `computeAvailableSlots` (`lib/data/public-page.ts`)**: a query de agendamentos existentes filtrava só por `startTime` dentro do dia consultado. Um agendamento que começa 23:25 e termina 00:10 do dia seguinte tem `startTime` no dia anterior, mas ainda ocupa os primeiros minutos do dia seguinte — a query não via isso, então a lista de horários disponíveis mostrava um slot como livre que a rota de booking (que faz a checagem de conflito correta, sem recorte por dia) depois rejeitava com 409. Corrigido trocando o filtro para uma checagem de sobreposição de intervalo de verdade (`startTime < fimDoDia E endTime > inícioDoDia`). Terceira ocorrência da mesma família de bug de fuso/data nesta sessão (ver nota sobre `lib/timezone.ts` acima) — vale revisar qualquer código futuro que filtre agendamentos por dia.

**Bug real em `booking-client.tsx`**: reconstruía "hoje" no client com `new Date().toISOString().slice(0,10)` (data em UTC) em vez de usar a mesma data que o servidor usou para calcular `availableSlots`. Corrigido passando `bookingDate` como prop do Server Component pro Client Component, em vez de recalcular no browser.

**`POST /api/appointments`** (decisão de produto, não bug): quando o agendamento é criado manualmente (Agenda) sem escolher um `staffId` explícito, agora atribui automaticamente ao staff autenticado que está criando o agendamento — sem isso, "Faturamento por barbeiro" no Painel acumulava receita "sem dono". A rota pública (`/api/public/[slug]/book`) continua sem atribuir staff (o cliente final não escolhe barbeiro no fluxo atual), e esses casos aparecem no Painel como "Sem barbeiro definido" — real, só sem atribuição ainda.

**`POST /api/appointments`** foi estendido: agora aceita `clientId` (cliente existente) OU `{clientName, clientPhone}` (cria/atualiza cliente na hora, mesmo padrão de upsert por telefone da rota pública de booking). Também ganhou checagem de conflito de horário, que só a rota pública tinha antes.

**Formato de data/hora padronizado** (`lib/format.ts`): `formatTime` agora passa `hour12: false` explicitamente (antes dependia do locale `pt-BR` implicitamente escolher 24h, o que já mostrou inconsistência de ICU no Windows). Nova função `formatDateShort` monta `dd/MM/yyyy` a partir de `Intl.DateTimeFormat.formatToParts` (não de `toLocaleDateString` com locale), pra garantir a ordem dos campos independente de plataforma — usada nas datas de agendamento (Agenda, modal de ação, Clientes, avaliações, busca por telefone). A saudação da tela Início (`formatDateLong`, ex.: "domingo, 12 de jul.") foi mantida no formato original — o pedido de dd/MM/yyyy era sobre as datas de agendamento, não sobre esse elemento de copy/design.

**Otimização real de performance em `proxy.ts`**: o middleware rodava em **toda** requisição (inclusive a página pública `/[slug]`, `/login`, `/signup` e `/api/public/**`) e cada execução faz uma chamada de rede ao Supabase Auth (`supabase.auth.getUser()`) só para manter o cookie de sessão fresco — irrelevante pra rotas que não usam sessão de barbeiro. O matcher agora só cobre o grupo `(app)` e suas APIs privadas. Isso não elimina o round-trip ao Supabase que `requireStaff()` ainda faz por requisição autenticada (é a checagem de segurança de verdade, continua necessária), mas corta um round-trip inteiro do tráfego público, que é justamente o que mais cresce com a busca/cancelamento por telefone. Eliminar o round-trip restante exigiria trocar a verificação de sessão por validação local de JWT assimétrico (`getClaims()`), o que depende de uma configuração no projeto Supabase — fora do escopo desta rodada.

**Campos de data/hora do "Novo agendamento" (Agenda)**: trocados de `<input type="date">`/`<input type="time">` nativos para campos de texto com máscara própria (`DateField`/`TimeField` em `new-appointment-modal.tsx`). O motivo: inputs nativos desse tipo são renderizados pelo **navegador**, no formato do idioma/SO da máquina de quem está usando — podem aparecer como mm/dd/aaaa ou com AM/PM dependendo da configuração local, sem nenhuma forma de forçar dd/mm/aaaa e 24h via CSS/JS. Com campos de texto controlados, o formato exibido é sempre o mesmo em qualquer navegador/SO; o valor interno continua em ISO (`yyyy-mm-dd` / `HH:mm`), que é o que a API espera.

**Bug real: não dava pra excluir um serviço já usado em algum agendamento** (`DELETE /api/services/[id]`). Causa: `Appointment.service` no schema é `onDelete: Restrict` (proposital — histórico de agendamento não pode ficar órfão), então apagar de verdade um serviço com agendamentos batia na constraint do banco e falhava com erro 500 não tratado; a tela não mostrava nada, então parecia que o botão "✕" simplesmente não funcionava. Corrigido: a rota agora checa se o serviço tem algum agendamento — se não tem, apaga de verdade; se tem, **desativa** (`active: false`, campo que a página pública já respeitava, só não tinha como chegar nesse estado pela UI) em vez de apagar. A tela Serviços ganhou um badge "INATIVO" + botão "Reativar" pra esse caso, e uma mensagem explicando o que aconteceu.

**Investigação de lentidão real, e migração de região do banco**: medi os tempos de navegação entre abas com Playwright e isolei onde o tempo estava indo — não era o Turbopack recompilando (o tempo não caía numa segunda visita à mesma rota, já compilada) nem o round-trip ao Supabase Auth (`getUser()` ~220ms, normal). O gargalo real era o **Postgres via pooler do Supabase**: uma query simples (`prisma.staff.findUnique`) levava 1,3–2,8s. O projeto original tinha sido criado na região `us-west-2` (Oregon, EUA); rodando o dev server do Brasil, toda query pagava a latência de ida e volta pro outro lado do continente, e cada página faz várias queries em sequência (staff + dados específicos da tela).

Como o app é 100% focado no Brasil (usuários e clientes finais) e o banco só tinha dado de teste, **migramos o projeto Supabase inteiro para a região `sa-east-1` (São Paulo)** em vez de só torcer pra região da Vercel compensar — resolve o problema tanto em dev quanto em produção, e de quebra deixa o app mais rápido pros usuários reais (que estão no Brasil), não só pro servidor. Processo: novo projeto Supabase criado manualmente (não dá pra mudar a região de um projeto existente, nem criar um novo via API sem acesso ao dashboard), depois `prisma migrate deploy` + `prisma db execute --file prisma/rls.sql` + recriação do bucket `barbershop-media` + recriação do usuário/barbearia de teste — tudo do zero, já que só havia dado de teste, não valia a pena migrar dado real. Resultado medido: `prisma.staff.findUnique` caiu de 1,3–2,8s pra ~100ms (queda de ~15x); navegação entre abas (Playwright, fim-a-fim) caiu de 3–7s pra 300–900ms. **Ao fazer o deploy na Vercel, usar a região `gru1` (São Paulo)** para as funções serverless — é a região da Vercel fisicamente mais próxima do `sa-east-1` da AWS, e mantém a vantagem de latência também em produção.

**Modal de ação da Agenda** (`appointment-action-modal.tsx`): cada bloco da visão Dia agora é um botão que abre um modal com os dados do agendamento e ações de status. Só a visão Dia ganhou isso por ora — Semana e Mês continuam só-visualização (mesmo padrão do roadmap original, que não pedia edição nessas visões).

**Cancelamento pelo cliente final**: agendamentos criados pela página pública já nasciam `CONFIRMED` (sem etapa de aprovação do barbeiro), mas não existia nenhuma forma do cliente desmarcar — nem do barbeiro, pela UI (só existia a rota `PATCH /api/appointments/[id]`, sem botão nenhum chamando ela). Isso foi endereçado dos dois lados: barbeiro ganhou o modal de ação acima; cliente ganhou botão "Cancelar agendamento" logo após confirmar, mais uma busca "Já tem um agendamento? Ver ou cancelar" por telefone (novas rotas, ver seção 4). Ver nota de segurança sobre o modelo de credencial por telefone na seção 5.

**Confirmação de e-mail real no cadastro, e por que a página de confirmação é client-side (`app/auth/confirm/page.tsx`)**: `/api/auth/signup` usava `supabase.auth.admin.createUser({ email_confirm: true })` — isso cria o usuário já confirmado e **nunca manda e-mail nenhum** (é uma ação administrativa, não o fluxo de cadastro normal). Trocado para `supabase.auth.signUp()` (o mesmo client anônimo que o resto do app usa), que dispara o e-mail de confirmação de verdade e deixa o usuário como não-confirmado até clicar no link. Login antes de confirmar falha com `error.code === "email_not_confirmed"`, tratado com mensagem específica.

O destino do link (`emailRedirectTo`) precisou ser uma página **client-side**, não uma rota de servidor: o Supabase valida o token do lado dele e redireciona de volta com a sessão no **fragmento** da URL (`#access_token=...&refresh_token=...`), que por definição nunca chega ao servidor (fragmento não viaja em requisição HTTP nenhuma). A página lê o fragmento manualmente e chama `supabase.auth.setSession({access_token, refresh_token})` — não dá pra confiar no `detectSessionInUrl` automático do supabase-js porque o client deste app (`createBrowserClient` de `@supabase/ssr`) usa `flowType: "pkce"` por padrão, que espera um `?code=` na query string, não um fragmento; o parsing automático simplesmente não disparava pra esse link (bug real, confirmado testando: sessão nunca era criada, sem erro nenhum). Depois do `setSession()`, a navegação pra "/" precisou ser um reload de verdade (`window.location.href`), não `router.push()` — com navegação client-side do Next.js, a página de destino às vezes renderizava antes do cookie recém-gravado estar disponível pro Server Component, mandando de volta pro `/login`.

**Aviso importante sobre e-mail em produção**: o Supabase usa um serviço de e-mail próprio, compartilhado e **fortemente limitado em taxa** (poucos e-mails por hora) enquanto o projeto não tem um provedor de SMTP configurado — suficiente pra testar, mas **não serve pra usuários reais**. Antes de lançar de verdade, configurar um SMTP custom em *Project Settings → Authentication → SMTP Settings* no painel do Supabase (ex.: Resend, SendGrid, Postmark — todos têm plano grátis que cobre um SaaS pequeno). Sem isso, barbearias reais tentando se cadastrar vão esbarrar no rate limit e não receber o e-mail de confirmação.

**Bug real: avatar da barbearia só aparecia na página pública, nunca na visão do próprio barbeiro**: `nav.tsx` (sidebar), `page.tsx` (Início) e `conta/page.tsx` sempre renderizavam as iniciais (`initials(...)`) pro avatar, sem checar `barbershop.avatarUrl` — só a página pública (`[slug]/page.tsx`) e o próprio formulário de upload (`profile-form.tsx`) verificavam esse campo. Corrigido nos três lugares: mostra a imagem real quando existe, cai pras iniciais só quando não há foto.

**Tela "Dados da barbearia"** (`/conta/dados`): endereço, Instagram e WhatsApp — campos que `PATCH /api/barbershop` já aceitava (usados na página pública) mas sem nenhuma tela de edição; o menu da Conta tinha esse item desativado (`data-disabled`). Segue o mesmo padrão de `/conta/perfil` e `/conta/horarios` (sub-tela com botão voltar).

**Modelo de preço com fase de piloto** (`lib/plans.ts`): em vez de tiers por nº de barbeiros, o plano pago é único (`PRO`) mas com um preço promocional por prazo — `Subscription.pilotPriceUntil` é setado no cadastro (`now + PILOT_MONTHS`, hoje 3 meses) e `effectivePriceCents()` devolve R$40/mês enquanto essa data não passa, R$80/mês depois, sozinho, sem job nenhum (é só uma comparação de data no momento da leitura). `Subscription.trialEndsAt` (14 dias, sem cartão) alimenta o "X dias restantes" mostrado em `/conta` durante o trial. A cobrança de verdade via Mercado Pago continua pendente (item 1 da seção 9) — esses campos só definem o preço que *vai* ser cobrado quando o checkout existir.

**Onboarding guiado** (`app/onboarding/`): `Barbershop.onboardedAt` (nulo até o assistente ser concluído) é checado em `app/(app)/layout.tsx` — sem ele, qualquer rota do grupo `(app)` redireciona pra `/onboarding` antes de renderizar. O assistente é um wizard de 4 passos num único client component (`onboarding-client.tsx`), cada passo persistindo via as mesmas rotas que as telas de Conta já usavam (`PATCH /api/barbershop`, `PUT /api/business-hours`, `POST /api/services`) — não existe uma API própria de onboarding. O passo de horários reaproveita o componente `ScheduleForm` de `/conta/horarios` direto (mesmo código, sem duplicar), só que pré-preenchido com um padrão razoável (seg–sáb 9h–19h) salvo automaticamente ao entrar no passo, pra nunca deixar a barbearia sem nenhum horário configurado mesmo se o usuário só clicar "Continuar" sem mexer em nada. Barbearias que já existiam antes dessa migration foram marcadas como `onboardedAt = createdAt` num backfill único (não passam pelo assistente retroativamente).

**Seleção de barbeiro na página pública** (`booking-client.tsx`, `lib/data/public-page.ts`): só aparece em barbearias modo Dono com mais de 1 barbeiro (autônomo não tem o que escolher). Ao trocar de barbeiro, a lista de horários disponíveis é recalculada num round-trip pra `/api/public/[slug]?date=&staffId=` — a disponibilidade de cada barbeiro é independente (dois barbeiros podem atender no mesmo horário). `computeAvailableSlots` e a rota de booking usam exatamente a mesma regra de escopo (com `staffId` filtra só os agendamentos daquele barbeiro; sem, considera a barbearia inteira) — importante manter as duas em sincronia, senão a lista mostra um horário "livre" que a confirmação rejeita.

**Painel — destaques automáticos, meta e drill-down** (`lib/data/metrics.ts`, `app/(app)/painel/`): `highlights` é gerado a partir de comparações que a própria função já calculava (delta de faturamento, faltas vs período anterior, tendência de avaliação) — deliberadamente **não** tenta detectar "melhor mês desde X" (exigiria varrer um histórico arbitrário de meses; ficou de fora por escopo). Meta mensal (`Barbershop.monthlyGoalCents`, editável direto no card do Painel) só aparece no período "Mês". Clicar num serviço abre um modal com o detalhe (dado que já veio na mesma consulta, sem round-trip extra); clicar num barbeiro navega pra `/agenda?view=semana&staffId=...`, reaproveitando o filtro de agenda descrito acima.

**Backlog documentado, não implementado nesta rodada** (fora do escopo combinado — ver itens 10-12 da seção 9 abaixo): telas "Formas de pagamento" e "Notificações" (dependem da integração de cobrança e ficaram deliberadamente pra depois, a pedido do cliente) e lembrete de horário totalmente automático (SMS/WhatsApp Business API) — a versão manual via WhatsApp já está implementada, ver nota mais abaixo.

**Compartilhar link + QR code** (`/conta`, `share-link.tsx`): a origem (`http`/`https` + host) é lida do header `host` via `next/headers` em vez de uma env var — funciona igual em `localhost` e no domínio real sem configurar nada extra. O QR é gerado **server-side** (`qrcode`, `QRCode.toDataURL`) direto na Server Component, então chega pro browser já pronto como `data:` URL, sem round-trip nem dependência de serviço externo de terceiros. O botão "Copiar link" é um client component minúsculo isolado só por causa da Clipboard API (`navigator.clipboard`), que não existe no servidor.

**Revisão Início/Painel + métricas novas** (a partir de feedback estruturado do cliente, com correções de UX/lógica e sugestões de métricas por tela):

- **Separação de propósito**: Início = operação de hoje/agora ("o que eu preciso fazer/saber agora"); Painel = análise histórica ("como meu negócio está indo ao longo do tempo"). Antes as duas telas mostravam faturamento em destaque competindo pela mesma informação — agora o card do Início é só o dia corrente vs uma **meta diária** própria (`Barbershop.dailyGoalCents`, novo campo, mesmo padrão de `monthlyGoalCents`), nunca a meta mensal do Painel.
- **`app/(app)/goal-editor.tsx`**: o editor de meta virou um componente compartilhado entre Início e Painel (antes só existia dentro de `painel/`) — recebe `field` (`dailyGoalCents`/`monthlyGoalCents`), `label` e o objeto `styles` do CSS Module de quem está usando, porque CSS Modules são isolados por arquivo e as duas telas têm as mesmas classes (`.goalEdit`, `.goalTrack` etc.) definidas cada uma no próprio módulo.
- **Barra de progresso do Início só aparece com meta definida** — antes mostrava "0% · Esperado hoje R$0" sempre que não havia agendamento, dando a entender que existia uma meta calculada quando na verdade era 0/0. "Esperado hoje" continua existindo, mas como linha informativa separada (soma do que já está agendado, não uma meta), e só aparece quando é maior que o realizado.
- **Estado vazio do Início com ação**: sem agendamento pendente hoje, em vez de uma frase sem saída, mostra "Copiar link de agendamento" (reaproveita `ShareLinkButton` de Conta) + "Novo agendamento". Conta ainda com `total de agendamentos = 0 em toda a história` pra saber se é conta nova (copy ligeiramente diferente, "Vamos começar!").
- **`lib/metric-status.ts`** (novo): função única `getMetricStatus({valor, meta, amostraAtual, amostraMinima})` que devolve `verde`/`amarelo`/`vermelho`/`neutro` (≥100% da meta = verde, ≥70% = amarelo, resto vermelho; sem meta ou amostra insuficiente = sempre neutro, nunca colore dado não confiável). Usada nos cards de faturamento do Início (vs meta diária) e Painel (vs meta mensal no período "mês", meta diária no período "dia"; "semana" fica neutro de propósito — não existe meta semanal). Símbolo (▲/●/▼) sempre acompanha a cor, não depende só dela (acessibilidade/daltonismo). Tokens CSS correspondentes em `globals.css`: `--status-verde/amarelo/vermelho/neutro`.
- **Amostra mínima antes de "confiar" visualmente num dado**: avaliação média só mostra nota + estrelas com 3+ avaliações (antes disso, texto neutro "N avaliação(ões), poucas pra calcular média"); "Serviços mais vendidos" só mostra barra de proporção com 5+ vendas no período somadas (antes disso, lista simples sem %, que seria enganosa com amostra baixa — ex.: 1 venda = barra de 100%).
- **Card de comparativo com mês anterior**: sem mês anterior pra comparar (primeiro mês de uso), o card de maior destaque visual da tela não fica mais com "—" no meio — vira uma mensagem contextual explicando por quê.
- **Consistência de cor**: card de faturamento é **preto em ambas as telas** agora (antes era azul no Painel, preto no Início, sem motivo funcional) — convenção adotada: preto = dado real/realizado, azul = meta/projeção/comparativo (o card "Taxa de crescimento da loja" do Painel continua azul, é comparativo de verdade).
- **Novas métricas no Painel** (`lib/data/metrics.ts`): **ticket médio** (faturamento ÷ atendimentos concluídos), **taxa de ocupação** (minutos ocupados por agendamento ÷ minutos de expediente configurado em Horários — retorna `null`, não 0%, se a barbearia não tiver nenhum horário configurado), **taxa de faltas em %** (não só o número absoluto de antes), **taxa de retenção** (dos clientes atendidos no período, quantos já tinham vindo antes do início dele) + contagem de novos vs. recorrentes. "Faturamento por serviço" também passou a aparecer direto na lista "Serviços mais vendidos" (antes só no modal de detalhe).
- **Escopo deliberadamente fora desta rodada**: aniversariantes do dia (não existe campo de data de nascimento em `Client` — exigiria mudança de schema e do formulário de agendamento público, mais invasivo do que o resto da lista), alerta de estoque baixo (não existe módulo de produto/estoque no sistema), horário de pico (dias/horas com mais agendamento — métrica de visualização mais pesada, fica pra próxima rodada).

**Agendamento em dias futuros na página pública** (`booking-client.tsx`): antes o cliente só via horários de hoje — o backend (`computeAvailableSlots`, rota `/api/public/[slug]?date=`) já aceitava qualquer data desde a sessão anterior, só faltava a UI. Agora tem um seletor horizontal dos próximos 14 dias; trocar de dia (ou de profissional) recalcula os horários disponíveis com um novo request, mesmo padrão já usado pela seleção de barbeiro.

**Auditoria de código pós-entrega (revisão completa, a pedido do cliente) — 3 bugs reais encontrados e corrigidos antes de qualquer barbearia real ser afetada:**

1. **Timezone em `occupancyPctInRange` (`lib/data/metrics.ts`)**: a função somava os minutos de expediente dia a dia usando um cursor que era "normalizado" com `cursor.setUTCHours(0,0,0,0)`. O problema: `start` já é o instante UTC correspondente à meia-noite *no Brasil* (ex.: 03:00 UTC = 00:00 em Brasília), então zerar as horas em UTC empurrava o cursor pra meia-noite UTC — que em Brasília ainda é a noite do dia *anterior*. Resultado: o cálculo de taxa de ocupação contava o dia da semana errado, um a menos do que deveria, em todo o período. Corrigido removendo a normalização — o cursor agora avança em incrementos exatos de 24h a partir do instante já correto, mesmo padrão seguro já usado em `lib/timezone.ts` (que usa `setUTCDate`/`setUTCMonth`, que preservam a hora, nunca `setUTCHours(0,0,0,0)`).
2. **Taxa de ocupação não considerava múltiplos barbeiros**: a fórmula original era `minutos ocupados ÷ minutos de expediente da loja`, mas numa barbearia com vários barbeiros atendendo em paralelo (o caso normal em modo Dono), isso passava de 100% sempre que mais de um atendia no mesmo horário. Corrigido multiplicando os minutos disponíveis pelo número de barbeiros da barbearia (`prisma.staff.count`) — a capacidade real é "expediente × nº de cadeiras", não só o expediente da loja.
3. **`app/onboarding/onboarding-client.tsx`: `handleFinish` não checava se o `PATCH` deu certo** — se a requisição falhasse (rede instável, por exemplo), o código redirecionava pra "/" do mesmo jeito; como `onboardedAt` continuava nulo, o `AppLayout` mandava de volta pro onboarding, reiniciando do passo 1 sem nenhuma mensagem de erro — parecia que o progresso tinha simplesmente sumido. Corrigido: só redireciona em caso de sucesso, senão mostra "Não foi possível concluir agora. Tente novamente."

Também documentado (não é bug, mas vale deixar claro pra quem ler o código depois): o alerta "N agendamentos aguardando confirmação" do Início (`lib/data/dashboard.ts`) filtra por status `PENDING`, mas **hoje nenhum fluxo de criação de agendamento gera esse status** — tanto a criação manual quanto a página pública já nascem `CONFIRMED` direto, decisão de produto pra não exigir aprovação extra do barbeiro. O alerta é código correto e pronto pro caso disso mudar no futuro, só nunca vai aparecer com o comportamento atual — isso é esperado, não uma falha.

**Nota operacional descoberta durante os testes desta auditoria**: depois de configurar a Site URL do Supabase pra `https://nexobarber.vercel.app` (necessário pro e-mail de "esqueci minha senha" funcionar em produção), os links de magic link/recovery gerados pelo Supabase passaram a redirecionar pra produção mesmo quando testados contra o `localhost`. Não afeta login normal por e-mail/senha (usado em todos os testes automatizados desta sessão), só o fluxo específico de link por e-mail testado localmente. Se precisar testar confirmação de e-mail ou redefinição de senha contra o `localhost` no futuro, pode ser necessário adicionar `http://localhost:3000/auth/confirm` e `http://localhost:3000/redefinir-senha` de volta na lista de Redirect URLs do Supabase (mantendo as de produção também).

**Bug real encontrado e corrigido: badge de plano da sidebar sempre dizia "PLANO PRO"** (`nav.tsx`), independente da assinatura real — nunca tinha sido conectado ao dado de verdade, só texto fixo desde que a tela foi criada. Notado comparando visualmente a sidebar com o card de assinatura da própria tela Conta (que mostra o plano correto) e reparando que os dois discordavam. Corrigido: `AppLayout` agora busca a `Subscription` e passa `planLabel` pra `Nav`, que usa o valor real.

**Lembrete de horário — versão manual via WhatsApp** (`appointment-action-modal.tsx`): decisão de produto explícita — o item original pedia lembrete "automático", mas o projeto não tem (e não devia ter ainda) nenhum provedor de mensageria configurado (nem SMS, nem WhatsApp Business API; o próprio e-mail transacional depende de resolver o SMTP primeiro, item 9). Em vez de esperar por essa infraestrutura, o modal de ação da Agenda ganhou um botão "Lembrar via WhatsApp" que monta um link `wa.me/<telefone>?text=<mensagem pronta>` com nome do cliente, serviço, data e hora — o barbeiro clica, o WhatsApp abre com a mensagem já escrita, ele só confere e manda. Zero custo, zero provedor novo, funciona hoje. Só aparece quando o cliente tem telefone cadastrado e o agendamento está Pendente ou Confirmado.

**"Esqueci minha senha" + Política de Privacidade + exclusão de dados (LGPD)**: fluxo de recuperação de senha via `supabase.auth.resetPasswordForEmail()` + `updateUser({password})`; Política de Privacidade em `/privacidade`; exclusão de dados do cliente final via `/api/public/[slug]/data-request` (anonimiza, não apaga — preserva histórico de faturamento); exclusão de conta da barbearia via `DELETE /api/barbershop` (zona de perigo em Conta, só OWNER, exige digitar o nome da barbearia).

**Bug real: `/redefinir-senha` só sabia processar um formato de link de recuperação, e o formato real do Supabase era outro**. O teste automatizado usou `admin.generateLink({type:"recovery"})`, que produz um link com a sessão no **fragmento** da URL (`#access_token=...`) — a página foi construída (corretamente) pra processar isso, e o teste passou. Só que o fluxo real (usuário pedindo reset pela tela `/esqueci-senha`, que chama `supabase.auth.resetPasswordForEmail()` a partir do **browser client**) usa `flowType: "pkce"` (padrão do `createBrowserClient` do `@supabase/ssr`, usado em `lib/supabase/client.ts`) — que produz um link com o código na **query string** (`?code=...`), formato completamente diferente, que a página não sabia ler. Resultado real reportado pelo usuário: o link caiu numa página quebrada. Mesma categoria de erro do bug original de `auth/confirm` desta sessão (testar com `admin.generateLink()` mascara o comportamento real do fluxo iniciado pelo usuário, porque usa um mecanismo diferente) — a lição não tinha sido generalizada da primeira vez. Corrigido: `/redefinir-senha` agora tenta `exchangeCodeForSession(code)` primeiro (fluxo PKCE) e só cai pro parsing de fragmento se não houver `?code=` na URL, cobrindo os dois casos.

**Ação manual pendente no painel do Supabase**: o link também caiu no domínio raiz (`/`) em vez de `/redefinir-senha`, sinal de que a URL de redirect não está na lista de **Redirect URLs** permitidas do projeto (Authentication → URL Configuration) — sem isso, o Supabase ignora o `redirectTo` do código e usa a Site URL padrão. Precisa adicionar `http://localhost:3000/redefinir-senha` (e o equivalente de produção, depois do deploy) nessa lista — não é algo que dá pra resolver via código/migration, só pelo painel.

## 9. O que falta (gaps conhecidos)

As 5 telas do roadmap original (Agenda, Serviços, Painel, Conta, Página pública) estão **completas e testadas**. O que falta é tudo que estava fora desse escopo desde o início:

1. **Mercado Pago** — código do webhook pronto, mas sem credenciais reais configuradas; falta também a rota que *cria* a assinatura (`preApproval.create`) do lado do barbeiro, e um jeito do barbeiro fazer upgrade de FREE pra PRO pela UI. Os campos de preço (`pilotPriceUntil`, `trialEndsAt`) já existem e são mostrados em `/conta` — só falta o checkout de verdade.
2. **Rate limiting** — mencionado como TODO nos comentários das rotas públicas (`/api/reviews`, `/api/public/[slug]/book`, `/api/public/[slug]/appointments*`), ainda não implementado. Importante antes de expor a página pública de verdade (hoje qualquer um pode martelar essas rotas).
3. **Deploy na Vercel** — código já está no GitHub (`Nexo-dev-web/Saas-Barbearia`, privado) e `vercel.json` já fixa a região `gru1` (São Paulo); falta o usuário concluir a importação do projeto no dashboard da Vercel e colar as variáveis de ambiente lá (não automatizável sem a conta dele).
4. **Agenda (visão Dia/Semana) usa uma janela fixa de 08:00–20:00** para a timeline, em vez do horário de funcionamento real configurado pela barbearia. Revisar agora que a tela de Horários existe.
5. **Página pública só mostra horários de "hoje"**, sem navegação para escolher outro dia — decisão de escopo pra fechar o roadmap, não uma limitação técnica (a API `/api/public/[slug]?date=` já aceita qualquer data).
6. **Sem app mobile nativo** — é um web app responsivo; `requireStaff()` já aceita Bearer token pensando nisso, mas não há cliente mobile.
7. **Sem testes automatizados** (unit/integration) — toda a validação até aqui foi manual via Playwright + build, não há suite de testes no repositório.
8. **Cancelamento do cliente final por telefone é uma credencial fraca** (ver seção 5) — aceitável pro MVP, mas revisar se o produto crescer.
9. **SMTP customizado para o Supabase Auth** — sem isso, o e-mail de confirmação de cadastro esbarra no rate limit do serviço padrão do Supabase e barbearias reais não conseguem se cadastrar. Bloqueador de lançamento, ver seção 8.
10. **Tela "Formas de pagamento"** (Conta) — depende do checkout do Mercado Pago (item 1) existir primeiro; adiado a pedido do cliente pra depois do piloto.
11. **Tela "Notificações"** (Conta) — ainda sem especificação de produto (que tipo de notificação, canal); adiado a pedido do cliente.
12. **Redirect URLs do Supabase** — `http://localhost:3000/redefinir-senha` (e depois a URL de produção) precisam ser adicionadas manualmente em Authentication → URL Configuration no painel do Supabase; sem isso o link de "esqueci minha senha" cai na página errada. Ver nota técnica acima.
13. **Termos de Uso** formais e nota mais detalhada sobre transferência internacional de dados (Supabase é empresa americana, banco fisicamente no Brasil) — complementam a Política de Privacidade já existente.
12. **Lembrete de horário totalmente automático (Meta Cloud API / WhatsApp Business)** — decisão explícita do dono do produto: por ora fica só o disparo manual de um clique (ver nota abaixo). A automação via API oficial do WhatsApp (não a rota não-oficial tipo whatsapp-web.js/Baileys, descartada por risco real de banimento do número) fica reservada pra quando um cliente real validar que quer a feature — evita investir em conta Meta Business + templates aprovados antes de saber se alguém vai usar.

~~Botão "copiar link" + QR code da página pública~~ — ✅ implementado em `/conta` (seção "Compartilhar página de agendamento": QR gerado server-side com `qrcode`, botão "Copiar link" via Clipboard API).

~~Lembrete de horário~~ — ✅ versão manual implementada (ver nota abaixo); versão automática fica no item 12 acima.

---

## 10. Rodando localmente

```bash
npm install
npx prisma generate
npm run dev
```

Acesse `http://localhost:3000`. As rotas de API já podem ser testadas diretamente (ex.: `GET /api/public/barbearia-teste`) assim que houver dados reais no banco.
