-- Simulated Support-Unit P&L (Finance / HR / Management). Their actual expenses
-- come from the Finance / Human Resource / Management class columns of the
-- monthly "P&L per Class" import; revenue is simulated as a % of company revenue.
create table if not exists public.monthly_support_pnl (
  month_id uuid not null references public.pnl_months(id) on delete cascade,
  unit text not null,                 -- FINANCE, HR, MANCOM
  gross_sales numeric not null default 0,
  cogs numeric not null default 0,
  admin_expense numeric not null default 0,
  discounting_expense numeric not null default 0,   -- Finance Expense line
  operations_expense numeric not null default 0,
  repairs_expense numeric not null default 0,
  salaries_expense numeric not null default 0,
  other_income numeric not null default 0,
  primary key (month_id, unit)
);
alter table public.monthly_support_pnl enable row level security;
create policy "monthly_support_pnl_read" on public.monthly_support_pnl
  for select using (public.current_role() in ('finance', 'gm'));
create policy "monthly_support_pnl_write" on public.monthly_support_pnl
  for all using (public.current_role() = 'finance') with check (public.current_role() = 'finance');

-- Manual config per support unit: the % of revenue charged, and any BUs excluded.
create table if not exists public.support_unit_config (
  unit text primary key,              -- FINANCE, HR, MANCOM
  pct_of_revenue numeric not null default 0,
  exclude_bus text[] not null default '{}'
);
alter table public.support_unit_config enable row level security;
create policy "support_unit_config_read" on public.support_unit_config for select to authenticated using (true);
create policy "support_unit_config_write" on public.support_unit_config for all using (public.current_role() = 'finance') with check (public.current_role() = 'finance');

insert into public.support_unit_config (unit, pct_of_revenue, exclude_bus) values
  ('FINANCE', 0.01, '{}'),
  ('HR', 0.005, '{}'),
  ('MANCOM', 0.02, '{BU11}')
  on conflict (unit) do nothing;
