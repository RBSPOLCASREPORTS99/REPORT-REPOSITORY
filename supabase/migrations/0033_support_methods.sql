-- Support-unit allocation methods: % of revenue (default), per # transaction
-- (Finance), or per PAX/EE (HR). Plus per-BU revenue captured at import (for the
-- % breakdown) and manual per-BU counts for the alternate methods.
alter table public.support_unit_config
  add column if not exists method text not null default 'pct',  -- pct | per_txn | per_pax
  add column if not exists rate numeric not null default 0;      -- per-txn / per-EE rate

create table if not exists public.monthly_support_bu_revenue (
  month_id uuid not null references public.pnl_months(id) on delete cascade,
  bu_code text not null,
  gross_sales numeric not null default 0,
  primary key (month_id, bu_code)
);
alter table public.monthly_support_bu_revenue enable row level security;
create policy "msbr_read" on public.monthly_support_bu_revenue for select using (public.current_role() in ('finance', 'gm'));
create policy "msbr_write" on public.monthly_support_bu_revenue for all using (public.current_role() = 'finance') with check (public.current_role() = 'finance');

create table if not exists public.support_bu_count (
  year int not null,
  month int not null,
  unit text not null,
  bu_code text not null,
  count numeric not null default 0,
  primary key (year, month, unit, bu_code)
);
alter table public.support_bu_count enable row level security;
create policy "sbc_read" on public.support_bu_count for select using (public.current_role() in ('finance', 'gm'));
create policy "sbc_write" on public.support_bu_count for all using (public.current_role() = 'finance') with check (public.current_role() = 'finance');
