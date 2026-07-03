-- Alternative allocation methods (% revenue, per-transaction) for the support
-- centers, imported from the FINANCE/HR/MANCOM P&L "simulated support unit"
-- tabs. Keyed by report_range so the viewer can toggle allocation method and
-- recompute Net Income. The default gross-sales method already lives in
-- computed_pnl, so only the two alternatives are stored here.

drop table if exists public.support_sim;

create table public.support_sim (
  id bigint generated always as identity primary key,
  range_id uuid not null references public.report_ranges(id) on delete cascade,
  bu_code text not null references public.business_units(code),
  center text not null check (center in ('finance', 'hr', 'mancom')),
  method text not null check (method in ('revenue', 'per_txn')),
  amount numeric not null default 0,   -- ₱ thousands
  import_batch_id uuid references public.import_batches(id) on delete set null,
  unique (range_id, bu_code, center, method)
);
create index support_sim_range_bu_idx on public.support_sim (range_id, bu_code);

alter table public.support_sim enable row level security;

-- Same visibility model as computed_pnl.
create policy "support_sim_finance" on public.support_sim
  for all using (public.current_role() = 'finance');

create policy "support_sim_gm" on public.support_sim
  for select using (
    exists (select 1 from public.report_ranges r where r.id = range_id and r.is_published)
    and public.current_role() = 'gm'
  );

create policy "support_sim_bu_head" on public.support_sim
  for select using (
    exists (select 1 from public.report_ranges r where r.id = range_id and r.is_published)
    and public.current_role() = 'bu_head'
    and exists (
      select 1 from public.business_units bu
      where bu.code = support_sim.bu_code
        and (public.current_assigned_bu() = support_sim.bu_code or public.current_assigned_bu() = bu.parent_code)
    )
  );
