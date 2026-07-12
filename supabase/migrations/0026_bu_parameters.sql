-- Per-BU operational KPIs ("Parameters"). Manual values are stored per report
-- range (like the Farm entry); P&L-sourced and derived-ratio values are computed
-- at read time. STD targets are per BU + parameter (not per range).
create table if not exists public.bu_parameters (
  range_id uuid not null references public.report_ranges(id) on delete cascade,
  bu_code text not null,
  param_key text not null,
  value numeric not null default 0,
  primary key (range_id, bu_code, param_key)
);
alter table public.bu_parameters enable row level security;
drop policy if exists "bu_parameters_finance" on public.bu_parameters;
create policy "bu_parameters_finance" on public.bu_parameters
  for all using (public.current_role() = 'finance') with check (public.current_role() = 'finance');

create table if not exists public.bu_parameter_std (
  bu_code text not null,
  param_key text not null,
  value numeric not null default 0,
  primary key (bu_code, param_key)
);
alter table public.bu_parameter_std enable row level security;
-- Readable by any signed-in user (targets aren't sensitive); Finance edits.
drop policy if exists "bu_parameter_std_read" on public.bu_parameter_std;
create policy "bu_parameter_std_read" on public.bu_parameter_std for select to authenticated using (true);
drop policy if exists "bu_parameter_std_write" on public.bu_parameter_std;
create policy "bu_parameter_std_write" on public.bu_parameter_std for all using (public.current_role() = 'finance');

-- bu_parameters is finance-only (business KPIs), matching the P&L detail access.
