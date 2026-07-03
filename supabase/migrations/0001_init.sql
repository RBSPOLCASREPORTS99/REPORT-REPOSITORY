-- POLCAS BU Reporting App — initial schema
-- Business units, periods, import batches, P&L lines, profiles + RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- business_units
-- ---------------------------------------------------------------------------
create table public.business_units (
  code text primary key,
  name text not null,
  is_profit_center boolean not null default true,
  parent_code text references public.business_units(code),
  sort_order int not null default 0
);

-- Seed list mirrors src/lib/constants.ts BUSINESS_UNITS — keep both in sync.
insert into public.business_units (code, name, is_profit_center, parent_code, sort_order) values
  ('BU0102', 'Bodega 1 & 2', true, null, 10),
  ('BU03', 'Bodega 3 Sumilao', true, null, 20),
  ('BU04', 'Bodega 4 – Wooden Pallets', true, null, 30),
  ('BU05', 'Trading', true, null, 40),
  ('BU06', 'CCG/CPG/PGF', true, null, 50),
  ('BU07', 'Hogs Partnership Growing', true, null, 60),
  ('BU08', 'Lakatan Growing/Trading', true, null, 70),
  ('BU08LF', 'Lakatan Farm', true, 'BU08', 71),
  ('BU08PH', 'Lakatan Packhouse', true, 'BU08', 72),
  ('BU09', 'Hog Feeds Production', true, null, 80),
  ('BU10', 'Truck', false, null, 90),
  ('BU11', 'Agri-Solutions', true, null, 100),
  ('ADMIN', 'Admin', false, null, 200),
  ('FINANCE', 'Finance', false, null, 210),
  ('HR', 'Human Resource', false, null, 220),
  ('MANAGEMENT', 'Management', false, null, 230);

-- ---------------------------------------------------------------------------
-- periods
-- ---------------------------------------------------------------------------
create table public.periods (
  id bigint generated always as identity primary key,
  year int not null,
  month int not null check (month between 1 and 12),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (year, month)
);

-- ---------------------------------------------------------------------------
-- import_batches
-- ---------------------------------------------------------------------------
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source_report text not null check (source_report in ('BR', 'EXPENSE', 'SALES')),
  filename text not null,
  storage_path text,
  uploaded_by uuid references auth.users(id),
  period_id bigint references public.periods(id),
  row_count int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'failed')),
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- pnl_lines (Report A — BR/P&L)
-- ---------------------------------------------------------------------------
create table public.pnl_lines (
  id bigint generated always as identity primary key,
  period_id bigint not null references public.periods(id) on delete cascade,
  bu_code text not null references public.business_units(code),
  line_item text not null,
  comparison_pair text not null check (comparison_pair in ('YTD', 'YOY_MONTH', 'MOM')),
  current_amount numeric not null default 0,
  prior_amount numeric not null default 0,
  current_pct_of_sales numeric not null default 0,
  prior_pct_of_sales numeric not null default 0,
  diff numeric not null default 0,
  pct_diff numeric not null default 0,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  unique (period_id, bu_code, line_item, comparison_pair)
);

create index pnl_lines_period_bu_idx on public.pnl_lines (period_id, bu_code);

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'bu_head' check (role in ('finance', 'bu_head', 'gm')),
  assigned_bu_code text references public.business_units(code),
  full_name text,
  created_at timestamptz not null default now()
);

-- New auth users get an unassigned bu_head profile by default; Finance
-- upgrades role/assigned_bu_code manually via the Supabase table editor
-- until a user-management screen exists.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.business_units enable row level security;
alter table public.periods enable row level security;
alter table public.import_batches enable row level security;
alter table public.pnl_lines enable row level security;
alter table public.profiles enable row level security;

-- Policies on `profiles` cannot subquery `profiles` itself (Postgres reports
-- "infinite recursion detected in policy for relation profiles" — evaluating
-- the policy re-triggers the same policy). These SECURITY DEFINER helpers
-- read the caller's own role/assigned BU while bypassing RLS internally,
-- breaking the recursion. Used by every policy below, including on `profiles`.
create function public.current_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where user_id = auth.uid()
$$;

create function public.current_assigned_bu()
returns text
language sql stable security definer set search_path = public
as $$
  select assigned_bu_code from public.profiles where user_id = auth.uid()
$$;

-- profiles: everyone can read their own row; finance can read/write everyone's.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);

create policy "profiles_select_finance" on public.profiles
  for select using (public.current_role() = 'finance');

create policy "profiles_update_finance" on public.profiles
  for update using (public.current_role() = 'finance');

-- business_units: readable by any authenticated user.
create policy "business_units_select_all" on public.business_units
  for select to authenticated using (true);

-- periods: finance sees every period; bu_head/gm only see published ones.
create policy "periods_select_finance" on public.periods
  for select using (public.current_role() = 'finance');

create policy "periods_select_published" on public.periods
  for select using (is_published and public.current_role() in ('bu_head', 'gm'));

create policy "periods_write_finance" on public.periods
  for all using (public.current_role() = 'finance');

-- import_batches: finance only (viewers never see the import audit trail).
create policy "import_batches_finance" on public.import_batches
  for all using (public.current_role() = 'finance');

-- pnl_lines: finance sees everything; gm sees published periods; bu_head sees
-- published periods for their assigned BU (or its children, e.g. BU08 -> BU08LF/BU08PH).
create policy "pnl_lines_select_finance" on public.pnl_lines
  for select using (public.current_role() = 'finance');

create policy "pnl_lines_select_gm" on public.pnl_lines
  for select using (
    exists (select 1 from public.periods pe where pe.id = period_id and pe.is_published)
    and public.current_role() = 'gm'
  );

create policy "pnl_lines_select_bu_head" on public.pnl_lines
  for select using (
    exists (select 1 from public.periods pe where pe.id = period_id and pe.is_published)
    and public.current_role() = 'bu_head'
    and exists (
      select 1 from public.business_units bu
      where bu.code = pnl_lines.bu_code
        and (public.current_assigned_bu() = pnl_lines.bu_code or public.current_assigned_bu() = bu.parent_code)
    )
  );

create policy "pnl_lines_write_finance" on public.pnl_lines
  for all using (public.current_role() = 'finance');

-- ---------------------------------------------------------------------------
-- Storage: private "imports" bucket, finance-only.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do nothing;

create policy "imports_bucket_finance_all" on storage.objects
  for all using (
    bucket_id = 'imports' and public.current_role() = 'finance'
  );
