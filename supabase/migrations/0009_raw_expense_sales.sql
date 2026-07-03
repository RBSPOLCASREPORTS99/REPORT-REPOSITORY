-- Phase 4: compute Expenses and Sales from the raw QB Exp Data / QB Sales Data
-- transaction tabs. Aggregate per month, then derive each range by summing the
-- months it covers (like the P&L). This makes Expenses/Sales work for any
-- range (month / YTD / quarter) consistent with the P&L.

-- Monthly expense aggregate: sum of (Debit-Credit) per account per BU per month.
create table public.monthly_expense (
  id bigint generated always as identity primary key,
  year int not null,
  month int not null check (month between 1 and 12),
  bu_code text not null,
  section text not null check (section in ('controllable', 'uncontrollable')),
  group_name text not null default '',
  account text not null,
  amount numeric not null default 0,   -- full pesos
  unique (year, month, bu_code, section, group_name, account)
);
create index monthly_expense_ym_idx on public.monthly_expense (year, month);

-- Monthly sales aggregate: sum of Qty per display item per BU per month.
create table public.monthly_sales (
  id bigint generated always as identity primary key,
  year int not null,
  month int not null check (month between 1 and 12),
  bu_code text not null,
  item text not null,
  uom text not null default '',
  qty numeric not null default 0,
  unique (year, month, bu_code, item)
);
create index monthly_sales_ym_idx on public.monthly_sales (year, month);

alter table public.monthly_expense enable row level security;
alter table public.monthly_sales enable row level security;
create policy "monthly_expense_finance" on public.monthly_expense for all using (public.current_role() = 'finance');
create policy "monthly_sales_finance" on public.monthly_sales for all using (public.current_role() = 'finance');

-- Redesign sales_qty_lines to a single side per range (like computed_pnl /
-- expense_lines); the viewer compares a current range vs a prior range.
drop table if exists public.sales_qty_lines;
create table public.sales_qty_lines (
  id bigint generated always as identity primary key,
  range_id uuid not null references public.report_ranges(id) on delete cascade,
  bu_code text not null references public.business_units(code),
  item text not null,
  uom text not null default '',
  qty numeric not null default 0,
  unique (range_id, bu_code, item)
);
create index sales_qty_range_bu_idx on public.sales_qty_lines (range_id, bu_code);

alter table public.sales_qty_lines enable row level security;
create policy "sales_qty_finance" on public.sales_qty_lines
  for all using (public.current_role() = 'finance');
create policy "sales_qty_gm" on public.sales_qty_lines
  for select using (
    exists (select 1 from public.report_ranges r where r.id = range_id and r.is_published)
    and public.current_role() = 'gm'
  );
create policy "sales_qty_bu_head" on public.sales_qty_lines
  for select using (
    exists (select 1 from public.report_ranges r where r.id = range_id and r.is_published)
    and public.current_role() = 'bu_head'
    and exists (
      select 1 from public.business_units bu
      where bu.code = sales_qty_lines.bu_code
        and (public.current_assigned_bu() = sales_qty_lines.bu_code or public.current_assigned_bu() = bu.parent_code)
    )
  );
