-- Per-BU sales volume (Report C). Quantity sold per item, with unit of measure,
-- across several self-contained comparison blocks (annual, same-month YoY, vs
-- last month, quarter-vs-quarter). Anchored to the report's current-month range.

create table public.sales_qty_lines (
  id bigint generated always as identity primary key,
  range_id uuid not null references public.report_ranges(id) on delete cascade,
  bu_code text not null references public.business_units(code),
  item text not null,
  item_code text not null default '',
  uom text not null default '',
  comparison_key text not null,          -- annual | yoy_month | mom | q_4q | q_1q | ...
  prior_label text not null default '',
  current_label text not null default '',
  prior_qty numeric not null default 0,
  current_qty numeric not null default 0,
  diff numeric not null default 0,
  pct_diff numeric not null default 0,
  sort_order int not null default 0,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  -- keyed by row position: item names can repeat within a BU tab.
  unique (range_id, bu_code, comparison_key, sort_order)
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
