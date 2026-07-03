-- Phase 2: store RAW QuickBooks pivots + manual trucking inputs, and compute
-- the P&L on demand (see src/lib/pnl/computeBuPnl.ts). Replaces the Phase-1
-- model of importing already-finished per-BU tabs.

-- ---------------------------------------------------------------------------
-- pivot_snapshots: one imported QB "P&L by Class" pivot tab, tagged with the
-- date range it covers (parsed from the tab name / QB header).
-- ---------------------------------------------------------------------------
create table public.pivot_snapshots (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('month', 'ytd', 'range')),
  period_start date not null,
  period_end date not null,
  label text not null,
  source_report text not null default 'PNL' check (source_report in ('PNL', 'SUPPORT')),
  import_batch_id uuid references public.import_batches(id) on delete set null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (source_report, period_start, period_end, label)
);

-- ---------------------------------------------------------------------------
-- pivot_accounts: the account dimension (deduped across snapshots). hier_col
-- records which hierarchy column (0=A..6=G) the label sits in, since lookups
-- are hierarchy-column specific.
-- ---------------------------------------------------------------------------
create table public.pivot_accounts (
  id bigint generated always as identity primary key,
  source_report text not null default 'PNL',
  hier_col int not null,
  label text not null,
  sort_order int not null default 0,
  unique (source_report, hier_col, label)
);

-- ---------------------------------------------------------------------------
-- pivot_values: every BU/class cell of every imported pivot (full pesos).
-- column_header is kept verbatim ("BU01 - Bodega 1", "Total BU10 - TRUCK",
-- "Admin", "TOTAL", ...) so the compute engine can resolve members/pools.
-- ---------------------------------------------------------------------------
create table public.pivot_values (
  id bigint generated always as identity primary key,
  snapshot_id uuid not null references public.pivot_snapshots(id) on delete cascade,
  account_id bigint not null references public.pivot_accounts(id),
  column_header text not null,
  amount numeric not null default 0,
  unique (snapshot_id, account_id, column_header)
);
create index pivot_values_snapshot_idx on public.pivot_values (snapshot_id);

-- ---------------------------------------------------------------------------
-- trucking_inputs: manual per-BU trucking cost for a snapshot (₱ thousands),
-- keyed by the short trucking code (BU01..BU11, OT).
-- ---------------------------------------------------------------------------
create table public.trucking_inputs (
  id bigint generated always as identity primary key,
  snapshot_id uuid not null references public.pivot_snapshots(id) on delete cascade,
  trucking_code text not null,
  amount numeric not null default 0,
  unique (snapshot_id, trucking_code)
);

-- ---------------------------------------------------------------------------
-- bu_pnl_config: how each BU tab is built. Mirrors src/lib/pnl/buConfig.ts.
-- ---------------------------------------------------------------------------
create table public.bu_pnl_config (
  bu_code text primary key references public.business_units(code),
  display_name text not null,
  member_columns text[] not null default '{}',
  trucking_members text[] not null default '{}',
  include_support_centers boolean not null default true,
  allocation_method text not null default 'gross_sales'
    check (allocation_method in ('gross_sales', 'revenue', 'per_txn')),
  manual_entry boolean not null default false,
  sort_order int not null default 0
);

insert into public.bu_pnl_config
  (bu_code, display_name, member_columns, trucking_members, include_support_centers, manual_entry, sort_order) values
  ('BU0102', 'Bodega 1 & 2', array['BU01 - Bodega 1','BU02 - Bodega 2'], array['BU01','BU02'], true, false, 10),
  ('BU04', 'Bodega 4 – Wooden Pallets', array['BU04 - Bodega 4 Wooden Pallets','Unclassified'], array['BU04'], false, false, 30),
  ('BU05', 'Trading', array['BU05 - Trading'], array['BU05'], true, false, 40),
  ('BU07', 'Hogs Partnership Growing', array['BU07 - Hogs Partnership Growing'], array['BU07'], true, false, 60),
  ('BU08PH', 'Lakatan Packhouse', array['Total BU08 - Lakatan Growing/Trading'], array['BU08'], true, false, 72),
  ('BU08LF', 'Lakatan Farm', array[]::text[], array[]::text[], false, true, 71),
  ('BU09', 'Hog Feeds Production', array['BU09 - Hog Feeds Production'], array['BU09'], true, false, 80),
  ('BU11', 'Agri-Solutions', array['BU11 - Agri-Solutions'], array['BU11'], true, false, 100);

-- ---------------------------------------------------------------------------
-- support_sim: imported FINANCE/HR/MANCOM simulated allocations, for methods
-- 2 (% revenue) & 3 (per-transaction) comparisons (populated in a later phase).
-- ---------------------------------------------------------------------------
create table public.support_sim (
  id bigint generated always as identity primary key,
  snapshot_id uuid not null references public.pivot_snapshots(id) on delete cascade,
  center text not null check (center in ('finance', 'hr', 'mancom')),
  bu_code text not null,
  method text not null check (method in ('gross_sales', 'revenue', 'per_txn')),
  amount numeric not null default 0
);

-- ---------------------------------------------------------------------------
-- RLS: all of these hold raw + company-wide data. Finance only. Viewers reach
-- computed results exclusively through the compute-pnl Edge Function, which
-- returns just their permitted BU(s).
-- ---------------------------------------------------------------------------
alter table public.pivot_snapshots enable row level security;
alter table public.pivot_accounts enable row level security;
alter table public.pivot_values enable row level security;
alter table public.trucking_inputs enable row level security;
alter table public.bu_pnl_config enable row level security;
alter table public.support_sim enable row level security;

create policy "pivot_snapshots_finance" on public.pivot_snapshots
  for all using (public.current_role() = 'finance');
create policy "pivot_accounts_finance" on public.pivot_accounts
  for all using (public.current_role() = 'finance');
create policy "pivot_values_finance" on public.pivot_values
  for all using (public.current_role() = 'finance');
create policy "trucking_inputs_finance" on public.trucking_inputs
  for all using (public.current_role() = 'finance');
create policy "support_sim_finance" on public.support_sim
  for all using (public.current_role() = 'finance');

-- bu_pnl_config is non-sensitive (no amounts); any authenticated user may read
-- it so the client can render BU names / structure. Only finance may change it.
create policy "bu_pnl_config_read" on public.bu_pnl_config
  for select to authenticated using (true);
create policy "bu_pnl_config_write_finance" on public.bu_pnl_config
  for all using (public.current_role() = 'finance');
