-- Retained Earnings Allocation — a yearly planning report. POLCAS's overall Net
-- Income is split across funds (each a % of Net Income), and each fund is drawn
-- down by editable line items. The whole report (funds, %, line items, amounts,
-- an optional Net Income override) is stored as one JSON document per year.
-- Prefixed br_ to avoid any collision in the shared public schema.
create table if not exists public.br_retained_earnings (
  year int primary key,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.br_retained_earnings enable row level security;
-- Finance edits; GM may view (it's a management-level report).
drop policy if exists "br_retained_earnings_finance" on public.br_retained_earnings;
create policy "br_retained_earnings_finance" on public.br_retained_earnings
  for all using (public.current_role() = 'finance') with check (public.current_role() = 'finance');
drop policy if exists "br_retained_earnings_gm" on public.br_retained_earnings;
create policy "br_retained_earnings_gm" on public.br_retained_earnings
  for select using (public.current_role() = 'gm');
