-- GFFC Phase 2: Expense Report (from QB Exp Details transactions, aggregated per
-- account per month) and Sales by Qty (from the Sales by QTY sheet). Both are
-- additive; ranges are summed on read. Finance-only.
create table if not exists public.gffc_monthly_expense (
  year int not null,
  month int not null check (month between 1 and 12),
  account text not null,
  section text not null default 'Operations',
  controllable boolean not null default true,
  amount numeric not null default 0,
  primary key (year, month, account)
);

create table if not exists public.gffc_monthly_sales (
  year int not null,
  month int not null check (month between 1 and 12),
  category text not null default '',
  item text not null,
  uom text not null default '',
  qty numeric not null default 0,
  primary key (year, month, item)
);

alter table public.gffc_monthly_expense enable row level security;
alter table public.gffc_monthly_sales enable row level security;
create policy "gffc_monthly_expense_finance" on public.gffc_monthly_expense
  for all using (public.current_role() = 'finance');
create policy "gffc_monthly_sales_finance" on public.gffc_monthly_sales
  for all using (public.current_role() = 'finance');
