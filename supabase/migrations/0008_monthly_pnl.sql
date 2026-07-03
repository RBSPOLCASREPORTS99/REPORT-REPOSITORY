-- Phase 3: monthly P&L imports. One QuickBooks P&L file per month is stored as
-- compact additive inputs; YTD / quarter ranges are DERIVED by summing months
-- (allocations recomputed on the totals) and materialized into computed_pnl.

create table public.pnl_months (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  month int not null check (month between 1 and 12),
  label text not null,                 -- e.g. "January 2025"
  import_batch_id uuid references public.import_batches(id) on delete set null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (year, month)
);

-- Per computed BU, the additive raw lines (₱ thousands) before allocation.
create table public.monthly_pnl_inputs (
  id bigint generated always as identity primary key,
  month_id uuid not null references public.pnl_months(id) on delete cascade,
  bu_code text not null references public.business_units(code),
  gross_sales numeric not null default 0,
  cogs numeric not null default 0,
  admin_expense numeric not null default 0,
  discounting_expense numeric not null default 0,
  operations_expense numeric not null default 0,
  repairs_expense numeric not null default 0,
  salaries_expense numeric not null default 0,
  other_income numeric not null default 0,
  unique (month_id, bu_code)
);

-- Company-level pools for the gross-sales-pro-rata allocation (₱ thousands).
create table public.monthly_pnl_pools (
  month_id uuid primary key references public.pnl_months(id) on delete cascade,
  company_gross_sales numeric not null default 0,
  admin_pool numeric not null default 0,
  cost_money_pool numeric not null default 0,
  finance_pool numeric not null default 0,
  hr_pool numeric not null default 0,
  mancom_pool numeric not null default 0,
  bu10_truck_total numeric not null default 0
);

-- Manual per-BU trucking cost for the month (short codes BU01..BU11, OT).
create table public.monthly_trucking (
  id bigint generated always as identity primary key,
  month_id uuid not null references public.pnl_months(id) on delete cascade,
  trucking_code text not null,
  amount numeric not null default 0,
  unique (month_id, trucking_code)
);

-- All finance-only: raw inputs + company-wide pools must never reach a bu_head.
-- Viewers read only the materialized, RLS-scoped report_ranges / computed_pnl.
alter table public.pnl_months enable row level security;
alter table public.monthly_pnl_inputs enable row level security;
alter table public.monthly_pnl_pools enable row level security;
alter table public.monthly_trucking enable row level security;

create policy "pnl_months_finance" on public.pnl_months
  for all using (public.current_role() = 'finance');
create policy "monthly_pnl_inputs_finance" on public.monthly_pnl_inputs
  for all using (public.current_role() = 'finance');
create policy "monthly_pnl_pools_finance" on public.monthly_pnl_pools
  for all using (public.current_role() = 'finance');
create policy "monthly_trucking_finance" on public.monthly_trucking
  for all using (public.current_role() = 'finance');
