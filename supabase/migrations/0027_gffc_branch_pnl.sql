-- GFFC per-branch P&L: each branch's base P&L lines per month, parsed from the
-- "P&L per CLASS <month>" sheets (branches as class columns). Additive across
-- months; the per-branch viewer sums a period and derives Gross Income / Total
-- Expense / Net Income, plus a Total-of-all-branches column.
create table if not exists public.gffc_branch_pnl (
  year integer not null,
  month integer not null,
  branch text not null,
  line_key text not null,
  amount numeric not null default 0,
  primary key (year, month, branch, line_key)
);
alter table public.gffc_branch_pnl enable row level security;
drop policy if exists "gffc_branch_pnl_finance" on public.gffc_branch_pnl;
create policy "gffc_branch_pnl_finance" on public.gffc_branch_pnl
  for all using (public.current_role() = 'finance') with check (public.current_role() = 'finance');
