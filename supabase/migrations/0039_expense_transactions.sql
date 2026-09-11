-- Transaction-level expense detail behind each per-BU expense account. The
-- monthly per-account totals live in monthly_expense / expense_lines; this table
-- keeps the individual QuickBooks lines (Date, Ref, Name, Memo, Amount) that make
-- up each total, so the Expenses tab can drill from an account into its
-- transactions. Amounts are FULL PESOS (debit − credit), like expense_lines.
-- Prefixed br_ to avoid any collision in the shared public schema.
create table if not exists public.br_expense_tx (
  id bigint generated always as identity primary key,
  year int not null,
  month int not null,
  txn_date date,
  bu_code text not null,
  account text not null,
  ref text not null default '',
  name text not null default '',
  memo text not null default '',
  amount numeric not null default 0,   -- full pesos (debit − credit)
  import_batch_id uuid references public.import_batches(id) on delete set null
);
create index if not exists br_expense_tx_lookup_idx on public.br_expense_tx (bu_code, account, txn_date);
create index if not exists br_expense_tx_ym_idx on public.br_expense_tx (year, month);

alter table public.br_expense_tx enable row level security;

-- Same visibility model as expense_lines: Finance sees all; GM and the assigned
-- BU head see only published months (matched by the month's report_range).
drop policy if exists "br_expense_tx_finance" on public.br_expense_tx;
create policy "br_expense_tx_finance" on public.br_expense_tx
  for all using (public.current_role() = 'finance') with check (public.current_role() = 'finance');

drop policy if exists "br_expense_tx_gm" on public.br_expense_tx;
create policy "br_expense_tx_gm" on public.br_expense_tx for select using (
  public.current_role() = 'gm'
  and exists (
    select 1 from public.report_ranges r
    where r.kind = 'month' and r.is_published
      and extract(year from r.period_start)::int = br_expense_tx.year
      and extract(month from r.period_start)::int = br_expense_tx.month
  )
);

drop policy if exists "br_expense_tx_bu_head" on public.br_expense_tx;
create policy "br_expense_tx_bu_head" on public.br_expense_tx for select using (
  public.current_role() = 'bu_head'
  and exists (
    select 1 from public.report_ranges r
    where r.kind = 'month' and r.is_published
      and extract(year from r.period_start)::int = br_expense_tx.year
      and extract(month from r.period_start)::int = br_expense_tx.month
  )
  and exists (
    select 1 from public.business_units bu
    where bu.code = br_expense_tx.bu_code
      and (public.current_assigned_bu() = br_expense_tx.bu_code or public.current_assigned_bu() = bu.parent_code)
  )
);
