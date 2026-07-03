-- Per-BU expense detail (Report B). Each imported expense tab is grouped into
-- Controllable / Uncontrollable sections and expense accounts, with a value per
-- report_range. Amounts are FULL PESOS (unlike the P&L, which is in thousands).

create table public.expense_lines (
  id bigint generated always as identity primary key,
  range_id uuid not null references public.report_ranges(id) on delete cascade,
  bu_code text not null references public.business_units(code),
  section text not null check (section in ('controllable', 'uncontrollable')),
  group_name text not null default '',
  account text not null,
  amount numeric not null default 0,  -- full pesos
  sort_order int not null default 0,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  unique (range_id, bu_code, section, group_name, account)
);
create index expense_lines_range_bu_idx on public.expense_lines (range_id, bu_code);

alter table public.expense_lines enable row level security;

-- Same visibility model as computed_pnl.
create policy "expense_lines_finance" on public.expense_lines
  for all using (public.current_role() = 'finance');

create policy "expense_lines_gm" on public.expense_lines
  for select using (
    exists (select 1 from public.report_ranges r where r.id = range_id and r.is_published)
    and public.current_role() = 'gm'
  );

create policy "expense_lines_bu_head" on public.expense_lines
  for select using (
    exists (select 1 from public.report_ranges r where r.id = range_id and r.is_published)
    and public.current_role() = 'bu_head'
    and exists (
      select 1 from public.business_units bu
      where bu.code = expense_lines.bu_code
        and (public.current_assigned_bu() = expense_lines.bu_code or public.current_assigned_bu() = bu.parent_code)
    )
  );
