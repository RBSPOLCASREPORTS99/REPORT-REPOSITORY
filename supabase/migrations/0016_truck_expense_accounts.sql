-- Per-truck expense detail BY ACCOUNT, pulled from the QuickBooks "P&L by Class"
-- per-truck columns at P&L-import time (leaf accounts under each section, whose
-- sum reproduces the section totals). Powers the account-level Simulated P&L per
-- Truck. Finance-only, like the other raw monthly_* inputs.
create table if not exists public.monthly_truck_expense (
  month_id uuid not null references public.pnl_months(id) on delete cascade,
  truck_code text not null,
  section text not null,
  account text not null,
  amount numeric not null default 0,
  primary key (month_id, truck_code, section, account)
);

alter table public.monthly_truck_expense enable row level security;
create policy "monthly_truck_expense_finance" on public.monthly_truck_expense
  for all using (public.current_role() = 'finance');
