-- Fixes "infinite recursion detected in policy for relation profiles":
-- the original policies subqueried `profiles` from within a policy on
-- `profiles` itself. Replace with SECURITY DEFINER helper functions that
-- bypass RLS internally. See 0001_init.sql for the corrected version this
-- brings an already-migrated database in line with.

create or replace function public.current_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where user_id = auth.uid()
$$;

create or replace function public.current_assigned_bu()
returns text
language sql stable security definer set search_path = public
as $$
  select assigned_bu_code from public.profiles where user_id = auth.uid()
$$;

drop policy if exists "profiles_select_finance" on public.profiles;
create policy "profiles_select_finance" on public.profiles
  for select using (public.current_role() = 'finance');

drop policy if exists "profiles_update_finance" on public.profiles;
create policy "profiles_update_finance" on public.profiles
  for update using (public.current_role() = 'finance');

drop policy if exists "periods_select_finance" on public.periods;
create policy "periods_select_finance" on public.periods
  for select using (public.current_role() = 'finance');

drop policy if exists "periods_select_published" on public.periods;
create policy "periods_select_published" on public.periods
  for select using (is_published and public.current_role() in ('bu_head', 'gm'));

drop policy if exists "periods_write_finance" on public.periods;
create policy "periods_write_finance" on public.periods
  for all using (public.current_role() = 'finance');

drop policy if exists "import_batches_finance" on public.import_batches;
create policy "import_batches_finance" on public.import_batches
  for all using (public.current_role() = 'finance');

drop policy if exists "pnl_lines_select_finance" on public.pnl_lines;
create policy "pnl_lines_select_finance" on public.pnl_lines
  for select using (public.current_role() = 'finance');

drop policy if exists "pnl_lines_select_gm" on public.pnl_lines;
create policy "pnl_lines_select_gm" on public.pnl_lines
  for select using (
    exists (select 1 from public.periods pe where pe.id = period_id and pe.is_published)
    and public.current_role() = 'gm'
  );

drop policy if exists "pnl_lines_select_bu_head" on public.pnl_lines;
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

drop policy if exists "pnl_lines_write_finance" on public.pnl_lines;
create policy "pnl_lines_write_finance" on public.pnl_lines
  for all using (public.current_role() = 'finance');

drop policy if exists "imports_bucket_finance_all" on storage.objects;
create policy "imports_bucket_finance_all" on storage.objects
  for all using (bucket_id = 'imports' and public.current_role() = 'finance');
