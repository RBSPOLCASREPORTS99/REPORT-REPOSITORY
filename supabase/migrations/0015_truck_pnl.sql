-- Simulated P&L per Truck for BU10 - TRUCKING.
--
-- monthly_truck_inputs: per-truck raw P&L lines pulled from the QuickBooks
--   "P&L by Class" per-truck columns ("BU10 - <plate> <code>") at P&L-import
--   time, using the same line extraction as the per-BU compute.
-- monthly_truck_income: per-truck trucking INCOME imported from the TRUCKING
--   DASHBOARD "Sales per Truck" sheet (the authoritative trip-based income used
--   as the P&L top line, in place of the QB income).
--
-- Finance-only, like the other raw monthly_* inputs.
create table if not exists public.monthly_truck_inputs (
  month_id uuid not null references public.pnl_months(id) on delete cascade,
  truck_code text not null,
  gross_sales numeric not null default 0,
  cogs numeric not null default 0,
  admin_expense numeric not null default 0,
  discounting_expense numeric not null default 0,
  operations_expense numeric not null default 0,
  repairs_expense numeric not null default 0,
  salaries_expense numeric not null default 0,
  other_income numeric not null default 0,
  primary key (month_id, truck_code)
);

create table if not exists public.monthly_truck_income (
  month_id uuid not null references public.pnl_months(id) on delete cascade,
  truck_code text not null,
  plate text,
  income numeric not null default 0,
  primary key (month_id, truck_code)
);

alter table public.monthly_truck_inputs enable row level security;
alter table public.monthly_truck_income enable row level security;

create policy "monthly_truck_inputs_finance" on public.monthly_truck_inputs
  for all using (public.current_role() = 'finance');
create policy "monthly_truck_income_finance" on public.monthly_truck_income
  for all using (public.current_role() = 'finance');
