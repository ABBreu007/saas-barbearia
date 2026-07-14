-- Row Level Security — isolamento multi-tenant no Postgres (Supabase).
-- Rodar DEPOIS de `prisma migrate dev`/`deploy` (o Prisma cria/altera
-- tabelas, mas não gerencia RLS). Nomes de coluna em camelCase entre aspas
-- duplas pois é assim que o Prisma os gera (ver prisma/migrations/*/migration.sql).
--
-- NOTA IMPORTANTE sobre este design:
-- As API routes do Next.js (app/api/**) conectam ao Postgres via Prisma
-- usando a connection string de DATABASE_URL, que no Supabase autentica
-- como um role com privilégio de owner sobre o schema — esse role NÃO é
-- afetado por RLS (RLS só se aplica a roles não-owner, tipicamente `anon`
-- e `authenticated`). Ou seja: o isolamento "de verdade" das API routes é
-- feito em código, filtrando toda query por `staff.barbershopId`
-- (ver lib/auth.ts + WHERE barbershopId em cada rota).
--
-- O que a RLS abaixo protege é uma camada DIFERENTE: qualquer acesso feito
-- diretamente do browser com supabase-js usando a chave anônima/de sessão
-- (bypassando as API routes) — por exemplo, se no futuro alguma tela passar
-- a consultar o Supabase diretamente, ou via Realtime. Sem RLS, uma anon key
-- vazada ou mal utilizada exporia TODAS as barbearias; com RLS, cada usuário
-- autenticado só enxerga as linhas da própria barbearia, e o role `anon`
-- não enxerga nada (dados públicos da página de agendamento são servidos
-- exclusivamente pela rota /api/public/[slug], que escolhe manualmente
-- quais colunas expor).

alter table "barbershops"    enable row level security;
alter table "staff"          enable row level security;
alter table "services"       enable row level security;
alter table "clients"        enable row level security;
alter table "appointments"   enable row level security;
alter table "business_hours" enable row level security;
alter table "time_off"       enable row level security;
alter table "reviews"        enable row level security;
alter table "subscriptions"  enable row level security;

-- Função auxiliar: barbershopId do staff autenticado (via JWT do Supabase Auth).
create or replace function current_barbershop_id()
returns text
language sql
security definer
stable
as $$
  select "barbershopId" from "staff" where "authUserId" = auth.uid()::text limit 1;
$$;

-- staff: cada barbeiro só vê colegas da própria barbearia.
create policy "staff_isolation" on "staff"
  for all
  using ("barbershopId" = current_barbershop_id())
  with check ("barbershopId" = current_barbershop_id());

-- barbershops: só a própria barbearia (leitura/edição autenticada).
create policy "barbershops_isolation" on "barbershops"
  for all
  using ("id" = current_barbershop_id())
  with check ("id" = current_barbershop_id());

-- Tabelas filhas: mesmo padrão — isolar por barbershopId.
create policy "services_isolation" on "services"
  for all
  using ("barbershopId" = current_barbershop_id())
  with check ("barbershopId" = current_barbershop_id());

create policy "clients_isolation" on "clients"
  for all
  using ("barbershopId" = current_barbershop_id())
  with check ("barbershopId" = current_barbershop_id());

create policy "appointments_isolation" on "appointments"
  for all
  using ("barbershopId" = current_barbershop_id())
  with check ("barbershopId" = current_barbershop_id());

create policy "business_hours_isolation" on "business_hours"
  for all
  using ("barbershopId" = current_barbershop_id())
  with check ("barbershopId" = current_barbershop_id());

create policy "time_off_isolation" on "time_off"
  for all
  using ("barbershopId" = current_barbershop_id())
  with check ("barbershopId" = current_barbershop_id());

create policy "reviews_isolation" on "reviews"
  for all
  using ("barbershopId" = current_barbershop_id())
  with check ("barbershopId" = current_barbershop_id());

create policy "subscriptions_isolation" on "subscriptions"
  for all
  using ("barbershopId" = current_barbershop_id())
  with check ("barbershopId" = current_barbershop_id());

-- Nenhuma policy para o role `anon` é criada de propósito: dados públicos
-- (página de agendamento) passam pela rota /api/public/[slug], não por
-- acesso direto do browser ao Postgres.
