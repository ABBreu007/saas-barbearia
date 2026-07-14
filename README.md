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

Métricas do Painel (faturamento, clientes atendidos, faltas, serviços mais vendidos, faturamento por barbeiro) **não têm tabela própria** — são calculadas sob demanda via agregação SQL em cima de `appointments` (ver `/api/metrics`).

---

## 4. Rotas de API

Todas as rotas privadas exigem sessão Supabase — via **cookie** (fluxo do frontend) ou **`Authorization: Bearer <token>`** (útil para testes e para um futuro app mobile) — resolvida por `requireStaff()`, que já escopa toda query pelo `barbershopId` do usuário logado. Nunca confiam em um `barbershopId` vindo do corpo da requisição.

### Autenticação / Cadastro
| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/auth/signup` | POST | ❌ público | Cria usuário no Supabase Auth (**não confirmado** — precisa clicar no link do e-mail, ver seção 8) + `Barbershop` + `Staff` (OWNER) + `Subscription` (FREE/TRIALING) `{email, password, barbershopName, ownerName}`. Se a criação da barbearia falhar depois do usuário Auth já existir, o usuário é removido (compensação manual, já que Auth e Postgres não compartilham uma transação). |
| `/auth/confirm` | GET (página) | ❌ público | Destino do link de confirmação de e-mail. Client-side (ver seção 8 — o motivo é técnico, não estético). |

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

### Painel / Métricas
| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/metrics?period=dia\|semana\|mes` | GET | ✅ | Faturamento, clientes atendidos, faltas (+ variação vs período anterior), serviços mais vendidos, faturamento por barbeiro (+ nº de atendimentos), avaliação média (+ tendência), destaques automáticos (`highlights`) e flag `hasData` — tudo calculado on-the-fly em `lib/data/metrics.ts` |

### Conta — Horários e folgas
| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/business-hours` | GET | ✅ | Retorna os 7 dias |
| `/api/business-hours` | PUT | ✅ | Substitui os 7 dias de uma vez `{days: [{weekday, isOpen, openMinutes, closeMinutes}]}`, com validação de min. 30min entre abre/fecha |
| `/api/time-off` | GET / POST / DELETE | ✅ | CRUD de folgas |

### Avaliações
| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/reviews` | GET | ✅ | Lista avaliações (uso interno) |
| `/api/reviews` | POST | ❌ público | Cliente final avalia `{barbershopSlug, clientName, rating, comment?}` |

### Página pública (cliente final)
| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/public/[slug]?date=&staffId=` | GET | ❌ público | Dados da barbearia (incluindo lista de `staff`), serviços ativos, avaliações, horário de funcionamento e (se `date` informado) horários disponíveis — se `staffId` também for informado, a disponibilidade é calculada só pra aquele barbeiro, não pra barbearia inteira |
| `/api/public/[slug]/book` | POST | ❌ público | Cliente cria agendamento `{serviceId, startTime, clientName, clientPhone, staffId?}` — valida conflito de horário (escopado por `staffId` quando informado, igual ao cálculo de disponibilidade) e recalcula preço/duração a partir do serviço real no banco |
| `/api/public/[slug]/appointments?phone=` | GET | ❌ público | Cliente busca os próprios agendamentos futuros (não cancelados) pelo telefone usado no agendamento |
| `/api/public/[slug]/appointments/[id]/cancel` | POST | ❌ público* | Cliente cancela um agendamento `{phone}` — exige que o telefone bata com o do cliente dono do agendamento. *Sem login de cliente nesta MVP: o telefone funciona como credencial informal (mesmo nível de confiança de um link de cancelamento por e-mail sem conta). Ver nota de segurança na seção 5.* |

### Assinatura e upload
| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/subscriptions/webhook` | POST | assinatura HMAC | Recebe eventos do Mercado Pago, valida `x-signature`, atualiza status da assinatura |
| `/api/upload/sign` | POST | ✅ | Gera signed upload URL do Supabase Storage para banner/avatar `{kind: "banner"\|"avatar", fileExt}` |

---

## 5. Segurança implementada

- **Isolamento multi-tenant em código**: toda rota privada usa `requireStaff()` e filtra por `barbershopId` — nunca aceita esse campo vindo do cliente.
- **RLS no Postgres**: ativado nas 9 tabelas via `prisma/rls.sql`, com policies que restringem cada `staff` autenticado à própria barbearia. Serve como camada extra de defesa caso algo no futuro acesse o Supabase diretamente do browser (hoje tudo passa pelas API routes, que conectam como owner do schema e por isso não são afetadas pela RLS — a RLS protege contra uso indevido da chave anônima, não substitui os `WHERE barbershopId = ...` das rotas).
- **Validação de entrada** com Zod em toda rota que recebe body.
- **Webhook do Mercado Pago** valida a assinatura HMAC (`x-signature`) antes de processar qualquer evento — implementado, mas ainda não testável até as credenciais serem configuradas.
- **Uploads** passam por signed URL gerada no backend (nunca sobe direto com uma chave pública fixa) e são escopados por `barbershopId` no path do arquivo.
- **Segredos**: `SUPABASE_SERVICE_ROLE_KEY` e `MERCADOPAGO_ACCESS_TOKEN` só são usados em código server-side (`lib/supabase/admin.ts`, `lib/mercadopago.ts`), nunca expostos ao client.
- **Cancelamento de agendamento pelo cliente final (limitação conhecida, aceita para o MVP)**: como não há login de cliente, `/api/public/[slug]/appointments` e `.../[id]/cancel` usam o **telefone informado** como credencial — quem souber o telefone usado num agendamento consegue ver e cancelar os agendamentos futuros dele nessa barbearia. É o mesmo modelo de confiança de um link de cancelamento sem conta (comum em sistemas de reserva sem login). Não expõe dados de outras barbearias nem dados além de serviço/horário/preço. Se isso virar um problema real, a evolução natural é um código enviado por SMS/WhatsApp antes de listar os agendamentos.

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
- ✅ 9 tabelas migradas (`prisma migrate deploy` aplicado)
- ✅ RLS ativado + 9 policies aplicadas (`prisma db execute --file prisma/rls.sql`)
- ✅ Bucket `barbershop-media` do Storage criado (público, até 5MB, jpeg/png/webp) e validado com upload real via `/api/upload/sign`
- ✅ Supabase Auth (e-mail/senha) confirmado funcionando ponta a ponta: signup → login → chamada autenticada, testado com um usuário real

---

## 8. Frontend — status

Rotas implementadas (Next.js App Router, `app/(public)` = sem auth, `app/(app)` = protegido por `requireStaff()` no layout):

| Rota | Status |
|---|---|
| `/login` | ✅ Funcional contra o Supabase Auth real; mostra mensagem específica se o e-mail ainda não foi confirmado |
| `/signup` | ✅ Cadastro com confirmação de senha (campo repetido) + confirmação de e-mail real (ver nota abaixo) — depois de cadastrar, mostra tela "Confirme seu e-mail" em vez de logar automaticamente |
| `/auth/confirm` | ✅ Destino do link do e-mail de confirmação; estabelece a sessão e manda pro Início |
| `/onboarding` | ✅ Assistente de 4 passos no primeiro acesso (modo+endereço, horários com padrão pré-preenchido, primeiro serviço, foto de perfil+trial) — fora do grupo `(app)`, sem sidebar. `AppLayout` redireciona pra cá enquanto `Barbershop.onboardedAt` for nulo. |
| `/` (Início) | ✅ Dados reais (faturamento hoje, agendados, faltas, próximos); avatar da barbearia (foto real, quando existe) |
| `/agenda` | ✅ Dia (timeline 08–20h) / Semana (lista mobile, grade desktop) / Mês (calendário), + criação de agendamento (cliente novo ou existente, por telefone). Clicar num agendamento (visão Dia) abre um modal com **Confirmar / Cancelar / Marcar falta / Concluir**, que o barbeiro usa para mudar o status. Aceita `?staffId=` pra filtrar por barbeiro (usado pelo drill-down do Painel), com banner "Mostrando agenda de X · Limpar filtro". |
| `/servicos` | ✅ Lista + criar + editar (nome, duração e preço com stepper ±R$5) + remover (desativa se já tiver agendamento); tabela no desktop; estado vazio quando não há nenhum serviço ainda |
| `/painel` | ✅ Dia/Semana/Mês. Card de faturamento (realizado x esperado + delta com cor semântica, faltas do período embutidas, meta mensal com barra de progresso no período Mês), destaques automáticos ("Faturamento X% acima do período anterior", "Faltas subiram...", etc.), 2 KPIs (Clientes atendidos, Avaliação média com tendência), Serviços mais vendidos (clicável → modal com detalhe), Faturamento por barbeiro (+ nº de atendimentos, clicável → Agenda filtrada por aquele barbeiro), comparativo com mês anterior + taxa de crescimento, estado vazio no primeiro mês sem dados. **Sem o gráfico de linha do protótipo** — decisão: não estava na lista de métricas explicitamente pedidas pelo cliente, só como visualização; pode ser adicionado depois. |
| `/conta` | ✅ Perfil (avatar real+nome+e-mail), modo Dono/Autônomo, card de assinatura (tier PRO com preço de piloto/cheio conforme `pilotPriceUntil`, ou "X dias restantes" durante o trial), menu, logout |
| `/conta/perfil` | ✅ Upload real de banner/avatar (Supabase Storage) + nome/descrição |
| `/conta/dados` | ✅ Endereço, Instagram, WhatsApp — dados que a rota `/api/barbershop` já aceitava, mas sem tela própria até agora |
| `/conta/horarios` | ✅ 7 dias com toggle + editor inline (stepper ±30min, validação abre/fecha) + folgas |
| `/clientes` | ✅ Tabela no desktop / lista de cards no mobile (cliente+avatar, telefone, visitas, última visita, total gasto), ordenada por última visita. Fora do roadmap original de 5 telas, construída depois. |
| Página pública `/[slug]` | ✅ Capa/banner, avatar+nome+rating+endereço, redes sociais, seleção de serviço, **seleção de profissional** (só em barbearias modo Dono com mais de 1 barbeiro; recalcula horários disponíveis pro barbeiro escolhido), horários disponíveis **de hoje** (sem navegação de data — decisão de escopo, ver abaixo), confirmação de agendamento com botão de cancelar na hora, busca "Já tem um agendamento?" por telefone (lista + cancela agendamentos futuros), lista de avaliações + formulário de avaliação. Rota pública real, testada sem login. |

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

**Bug real encontrado e corrigido: badge de plano da sidebar sempre dizia "PLANO PRO"** (`nav.tsx`), independente da assinatura real — nunca tinha sido conectado ao dado de verdade, só texto fixo desde que a tela foi criada. Notado comparando visualmente a sidebar com o card de assinatura da própria tela Conta (que mostra o plano correto) e reparando que os dois discordavam. Corrigido: `AppLayout` agora busca a `Subscription` e passa `planLabel` pra `Nav`, que usa o valor real.

**Lembrete de horário — versão manual via WhatsApp** (`appointment-action-modal.tsx`): decisão de produto explícita — o item original pedia lembrete "automático", mas o projeto não tem (e não devia ter ainda) nenhum provedor de mensageria configurado (nem SMS, nem WhatsApp Business API; o próprio e-mail transacional depende de resolver o SMTP primeiro, item 9). Em vez de esperar por essa infraestrutura, o modal de ação da Agenda ganhou um botão "Lembrar via WhatsApp" que monta um link `wa.me/<telefone>?text=<mensagem pronta>` com nome do cliente, serviço, data e hora — o barbeiro clica, o WhatsApp abre com a mensagem já escrita, ele só confere e manda. Zero custo, zero provedor novo, funciona hoje. Só aparece quando o cliente tem telefone cadastrado e o agendamento está Pendente ou Confirmado.

## 9. O que falta (gaps conhecidos)

As 5 telas do roadmap original (Agenda, Serviços, Painel, Conta, Página pública) estão **completas e testadas**. O que falta é tudo que estava fora desse escopo desde o início:

1. **Mercado Pago** — código do webhook pronto, mas sem credenciais reais configuradas; falta também a rota que *cria* a assinatura (`preApproval.create`) do lado do barbeiro, e um jeito do barbeiro fazer upgrade de FREE pra PRO pela UI. Os campos de preço (`pilotPriceUntil`, `trialEndsAt`) já existem e são mostrados em `/conta` — só falta o checkout de verdade.
2. **Rate limiting** — mencionado como TODO nos comentários das rotas públicas (`/api/reviews`, `/api/public/[slug]/book`, `/api/public/[slug]/appointments*`), ainda não implementado. Importante antes de expor a página pública de verdade (hoje qualquer um pode martelar essas rotas).
3. **Deploy na Vercel** — repositório ainda não conectado, variáveis de ambiente ainda não configuradas lá.
4. **Agenda (visão Dia/Semana) usa uma janela fixa de 08:00–20:00** para a timeline, em vez do horário de funcionamento real configurado pela barbearia. Revisar agora que a tela de Horários existe.
5. **Página pública só mostra horários de "hoje"**, sem navegação para escolher outro dia — decisão de escopo pra fechar o roadmap, não uma limitação técnica (a API `/api/public/[slug]?date=` já aceita qualquer data).
6. **Sem app mobile nativo** — é um web app responsivo; `requireStaff()` já aceita Bearer token pensando nisso, mas não há cliente mobile.
7. **Sem testes automatizados** (unit/integration) — toda a validação até aqui foi manual via Playwright + build, não há suite de testes no repositório.
8. **Cancelamento do cliente final por telefone é uma credencial fraca** (ver seção 5) — aceitável pro MVP, mas revisar se o produto crescer.
9. **SMTP customizado para o Supabase Auth** — sem isso, o e-mail de confirmação de cadastro esbarra no rate limit do serviço padrão do Supabase e barbearias reais não conseguem se cadastrar. Bloqueador de lançamento, ver seção 8.
10. **Tela "Formas de pagamento"** (Conta) — depende do checkout do Mercado Pago (item 1) existir primeiro; adiado a pedido do cliente pra depois do piloto.
11. **Tela "Notificações"** (Conta) — ainda sem especificação de produto (que tipo de notificação, canal); adiado a pedido do cliente.
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
