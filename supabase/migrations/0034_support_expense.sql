-- Per-account expense detail for the support units (Finance / HR / Management),
-- pulled from the class columns of the P&L-per-Class import for their Expenses tab.
create table if not exists public.monthly_support_expense (
  month_id uuid not null references public.pnl_months(id) on delete cascade,
  unit text not null,
  section text not null,
  account text not null,
  amount numeric not null default 0,
  primary key (month_id, unit, section, account)
);
alter table public.monthly_support_expense enable row level security;
create policy "mse_read" on public.monthly_support_expense for select using (public.current_role() in ('finance', 'gm'));
create policy "mse_write" on public.monthly_support_expense for all using (public.current_role() = 'finance') with check (public.current_role() = 'finance');
