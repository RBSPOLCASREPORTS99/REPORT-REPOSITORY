-- Raw per-truck trucking income from the TRUCKING DASHBOARD's "Sales per Truck"
-- sheet, keyed by calendar month and INDEPENDENT of whether that month's P&L
-- (pnl_months) has been imported yet. The dashboard is a whole-history upload;
-- this keeps every month it covers so deriveRanges (run on every P&L import) and
-- the dashboard import both materialize it into monthly_truck_income for the
-- months whose P&L exists. That way the Simulated P&L per Truck shows Trucking
-- Income regardless of the order the dashboard and the P&L were imported.
-- Income is in FULL PESOS (÷1000 when materialized to monthly_truck_income).
-- Prefixed br_ to avoid any collision in the shared public schema.
create table if not exists public.br_truck_income (
  year int not null,
  month int not null,
  truck_code text not null,
  plate text,
  income numeric not null default 0,   -- full pesos
  primary key (year, month, truck_code)
);
create index if not exists br_truck_income_ym_idx on public.br_truck_income (year, month);

alter table public.br_truck_income enable row level security;
-- Finance-only, like the other raw monthly_* trucking inputs.
drop policy if exists "br_truck_income_finance" on public.br_truck_income;
create policy "br_truck_income_finance" on public.br_truck_income
  for all using (public.current_role() = 'finance') with check (public.current_role() = 'finance');
