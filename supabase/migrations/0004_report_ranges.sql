-- Flexible periods: each imported QB pivot is a self-contained dated RANGE
-- (month, YTD, quarter, half-year, custom). The app stores the computed P&L
-- for each range as ONE SIDE, and the viewer compares any two ranges
-- (current vs prior). This replaces the fixed "one month + 3 comparisons" model.

-- ---------------------------------------------------------------------------
-- report_ranges: a period the user can select (viewer-readable when published).
-- ---------------------------------------------------------------------------
create table public.report_ranges (
  id uuid primary key default gen_random_uuid(),
  label text not null,                 -- e.g. "May 2026", "YTD 2026", "Q1 2026"
  kind text not null check (kind in ('month', 'ytd', 'quarter', 'half', 'year', 'range')),
  period_start date not null,
  period_end date not null,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (period_start, period_end, label)
);

-- ---------------------------------------------------------------------------
-- computed_pnl: one computed side (no comparison) per range/BU/line.
-- pct_of_sales is that line ÷ the range's gross sales. Comparisons (diff,
-- %diff) are derived in the viewer from two ranges.
-- ---------------------------------------------------------------------------
create table public.computed_pnl (
  id bigint generated always as identity primary key,
  range_id uuid not null references public.report_ranges(id) on delete cascade,
  bu_code text not null references public.business_units(code),
  line_item text not null,
  amount numeric not null default 0,
  pct_of_sales numeric not null default 0,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  unique (range_id, bu_code, line_item)
);
create index computed_pnl_range_bu_idx on public.computed_pnl (range_id, bu_code);

-- ---------------------------------------------------------------------------
-- RLS — mirrors the validated pnl_lines model.
-- ---------------------------------------------------------------------------
alter table public.report_ranges enable row level security;
alter table public.computed_pnl enable row level security;

-- report_ranges: finance sees all; bu_head/gm see published ones.
create policy "report_ranges_finance" on public.report_ranges
  for all using (public.current_role() = 'finance');
create policy "report_ranges_published" on public.report_ranges
  for select using (is_published and public.current_role() in ('bu_head', 'gm'));

-- computed_pnl: finance all; gm published; bu_head published + own BU (incl.
-- BU08 children of an assigned parent).
create policy "computed_pnl_finance" on public.computed_pnl
  for all using (public.current_role() = 'finance');

create policy "computed_pnl_gm" on public.computed_pnl
  for select using (
    exists (select 1 from public.report_ranges r where r.id = range_id and r.is_published)
    and public.current_role() = 'gm'
  );

create policy "computed_pnl_bu_head" on public.computed_pnl
  for select using (
    exists (select 1 from public.report_ranges r where r.id = range_id and r.is_published)
    and public.current_role() = 'bu_head'
    and exists (
      select 1 from public.business_units bu
      where bu.code = computed_pnl.bu_code
        and (public.current_assigned_bu() = computed_pnl.bu_code or public.current_assigned_bu() = bu.parent_code)
    )
  );
