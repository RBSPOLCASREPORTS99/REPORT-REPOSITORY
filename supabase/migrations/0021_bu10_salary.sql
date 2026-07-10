-- QuickBooks "Total BU10 - TRUCK" -> Total Salaries and Wages per month (₱ '000).
-- QB posts BU10 driver salaries at the class level (not per truck), so this
-- authoritative total is reconciled against Finance's manual per-truck split on
-- the Salaries screen: the variance is prorated across trucks by Gross Income.
create table if not exists public.monthly_bu10_salary (
  month_id uuid primary key references public.pnl_months(id) on delete cascade,
  amount numeric not null default 0
);

alter table public.monthly_bu10_salary enable row level security;

drop policy if exists "finance rw monthly_bu10_salary" on public.monthly_bu10_salary;
create policy "finance rw monthly_bu10_salary" on public.monthly_bu10_salary
  for all using (public.current_role() = 'finance') with check (public.current_role() = 'finance');
