-- Per-account expense "reasons" — a note Finance attaches to an expense account
-- for a given period (usually a month), explaining why it moved. The history of
-- an account's reasons carries across periods so it can be reviewed next month.
create table if not exists public.expense_reasons (
  id bigint generated always as identity primary key,
  scope text not null,                 -- BU code, combined code ("BU01+BU05"), or 'GFFC'
  account text not null,
  range_id uuid not null references public.report_ranges(id) on delete cascade,
  reason text not null,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (scope, account, range_id)
);
create index if not exists expense_reasons_scope_account_idx on public.expense_reasons (scope, account);

alter table public.expense_reasons enable row level security;

-- Finance writes; GM / BU Head can read the notes alongside the expense data.
drop policy if exists expense_reasons_finance on public.expense_reasons;
create policy expense_reasons_finance on public.expense_reasons
  for all using (public.current_role() = 'finance') with check (public.current_role() = 'finance');

drop policy if exists expense_reasons_read on public.expense_reasons;
create policy expense_reasons_read on public.expense_reasons
  for select using (public.current_role() in ('gm', 'bu_head'));
