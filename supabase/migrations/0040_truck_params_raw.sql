-- Raw monthly BU10 (Trucking) parameters from the TRUCKING DASHBOARD's
-- "Parameters Data" sheet, keyed by calendar month and INDEPENDENT of whether
-- that month's P&L (report_range) has been imported yet. The dashboard is a
-- whole-history upload, so this keeps every month it covers; deriveRanges (run on
-- every P&L import) and the dashboard import both materialize these into
-- bu_parameters for the months whose range exists. That way the BU10 Parameters
-- tab fills in regardless of the order the dashboard and the P&L were imported.
-- Prefixed br_ to avoid any collision in the shared public schema.
create table if not exists public.br_truck_params (
  year int not null,
  month int not null,
  param_key text not null,
  value numeric not null default 0,
  primary key (year, month, param_key)
);
create index if not exists br_truck_params_ym_idx on public.br_truck_params (year, month);

alter table public.br_truck_params enable row level security;
-- Finance-only, like the other raw monthly_* trucking inputs.
drop policy if exists "br_truck_params_finance" on public.br_truck_params;
create policy "br_truck_params_finance" on public.br_truck_params
  for all using (public.current_role() = 'finance') with check (public.current_role() = 'finance');
