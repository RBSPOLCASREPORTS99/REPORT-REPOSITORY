-- Trucking allocation history + manual per-truck salaries.
--
-- monthly_bu_alloc: the full "Sales per BU" (trucking allocation) history from
--   the TRUCKING DASHBOARD, kept independent of pnl_months (keyed by calendar
--   year/month) so it applies to per-month P&L files imported later. Only the
--   ratio across BUs matters for the allocation.
create table if not exists public.monthly_bu_alloc (
  year int not null,
  month int not null check (month between 1 and 12),
  bu_code text not null,
  amount numeric not null default 0,
  primary key (year, month, bu_code)
);

-- monthly_truck_salary: manual per-truck Salaries and Wages for a month.
-- QuickBooks posts BU10 salaries summarized for the whole department, so Finance
-- enters the per-truck split here; it overrides the QB salaries in the per-truck P&L.
create table if not exists public.monthly_truck_salary (
  month_id uuid not null references public.pnl_months(id) on delete cascade,
  truck_code text not null,
  amount numeric not null default 0,
  primary key (month_id, truck_code)
);

alter table public.monthly_bu_alloc enable row level security;
alter table public.monthly_truck_salary enable row level security;

create policy "monthly_bu_alloc_finance" on public.monthly_bu_alloc
  for all using (public.current_role() = 'finance');
create policy "monthly_truck_salary_finance" on public.monthly_truck_salary
  for all using (public.current_role() = 'finance');
