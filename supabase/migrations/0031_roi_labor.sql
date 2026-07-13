-- ROI on Labor per BU report: Net Income from Ops ÷ Total Labor Cost, ranked.
-- Both figures auto-build from each BU's P&L; this table lets Finance override a
-- BU's Net Income and/or Labor Cost for a given range when needed.
create table if not exists public.roi_labor_manual (
  range_id uuid not null references public.report_ranges(id) on delete cascade,
  bu_code text not null,
  net_income numeric,
  labor_cost numeric,
  primary key (range_id, bu_code)
);
alter table public.roi_labor_manual enable row level security;
create policy "roi_labor_manual_finance" on public.roi_labor_manual
  for all using (public.current_role() = 'finance') with check (public.current_role() = 'finance');
