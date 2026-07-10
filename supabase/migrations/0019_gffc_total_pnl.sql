-- GFFC - Chickboy Meating Place (a separate company). Phase 1: company Total
-- P&L, stored as additive monthly inputs (sales categories + COGS + the 5
-- expense groups). Ranges are summed on read; no allocations (simpler than the
-- POLCAS BUs). Finance-only for now.
create table if not exists public.gffc_monthly_pnl (
  year int not null,
  month int not null check (month between 1 and 12),
  line_key text not null,
  amount numeric not null default 0,
  primary key (year, month, line_key)
);

alter table public.gffc_monthly_pnl enable row level security;
create policy "gffc_monthly_pnl_finance" on public.gffc_monthly_pnl
  for all using (public.current_role() = 'finance');
