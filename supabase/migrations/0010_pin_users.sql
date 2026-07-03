-- PIN-based auth + in-app user management.
--
-- Auth model change: BU Heads / GM / Finance now sign in with email + a
-- 6-digit PIN (the PIN is their Supabase password). Only emails Finance has
-- pre-authorized may register, and each user picks their own PIN the first
-- time they sign in. Magic-link stays available as a fallback.
--
-- Also replaces the single `profiles.assigned_bu_code` with a many-to-many
-- `profile_bus` so one person can head multiple BUs (e.g. BU01 & BU02).

-- ---------------------------------------------------------------------------
-- 1. Multiple BUs per registered user
-- ---------------------------------------------------------------------------
create table if not exists public.profile_bus (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  bu_code text not null references public.business_units(code),
  primary key (user_id, bu_code)
);
alter table public.profile_bus enable row level security;

-- Carry existing single-BU assignments over so current users keep access.
insert into public.profile_bus (user_id, bu_code)
  select user_id, assigned_bu_code from public.profiles
  where assigned_bu_code is not null
  on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Email allowlist (who Finance authorized) + their designation
-- ---------------------------------------------------------------------------
create table if not exists public.allowed_users (
  email text primary key,                 -- always stored lower-cased / trimmed
  role text not null default 'bu_head' check (role in ('finance', 'bu_head', 'gm')),
  full_name text,
  user_id uuid references auth.users(id) on delete set null,
  registered_at timestamptz,              -- set when the person first signs up
  created_at timestamptz not null default now()
);
alter table public.allowed_users enable row level security;

create table if not exists public.allowed_user_bus (
  email text not null references public.allowed_users(email) on delete cascade,
  bu_code text not null references public.business_units(code),
  primary key (email, bu_code)
);
alter table public.allowed_user_bus enable row level security;

create or replace function public.norm_email(e text)
returns text language sql immutable as $$ select lower(trim(e)) $$;

-- Seed the allowlist from any existing profiles so today's users stay valid.
-- (auth.users holds the email; join via user_id.)
insert into public.allowed_users (email, role, full_name, user_id, registered_at)
  select public.norm_email(u.email), p.role, p.full_name, p.user_id, u.created_at
  from public.profiles p
  join auth.users u on u.id = p.user_id
  on conflict (email) do nothing;

insert into public.allowed_user_bus (email, bu_code)
  select public.norm_email(u.email), pb.bu_code
  from public.profile_bus pb
  join auth.users u on u.id = pb.user_id
  on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Signup gate: only allow-listed emails may register; provision from list
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  au public.allowed_users;
begin
  select * into au from public.allowed_users
    where email = public.norm_email(new.email);

  if au.email is null then
    raise exception 'This email is not authorized. Ask Finance to add you first.'
      using errcode = 'check_violation';
  end if;

  insert into public.profiles (user_id, role, full_name)
    values (new.id, au.role, coalesce(au.full_name, new.raw_user_meta_data ->> 'full_name'))
    on conflict (user_id) do update
      set role = excluded.role, full_name = excluded.full_name;

  insert into public.profile_bus (user_id, bu_code)
    select new.id, bu_code from public.allowed_user_bus where email = au.email
    on conflict do nothing;

  update public.allowed_users
    set user_id = new.id, registered_at = now()
    where email = au.email;

  return new;
end;
$$;
-- The on_auth_user_created trigger from 0001 already calls handle_new_user().

-- ---------------------------------------------------------------------------
-- 4. Multi-BU RLS helper (set of BU codes the caller may see)
-- ---------------------------------------------------------------------------
create or replace function public.current_bu_codes()
returns setof text
language sql stable security definer set search_path = public
as $$
  select bu_code from public.profile_bus where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS for the new tables
-- ---------------------------------------------------------------------------
-- profile_bus: a user reads their own rows; Finance manages everyone's.
drop policy if exists "profile_bus_select_own" on public.profile_bus;
create policy "profile_bus_select_own" on public.profile_bus
  for select using (auth.uid() = user_id);
drop policy if exists "profile_bus_finance_all" on public.profile_bus;
create policy "profile_bus_finance_all" on public.profile_bus
  for all using (public.current_role() = 'finance');

-- allowlist tables: Finance only.
drop policy if exists "allowed_users_finance_all" on public.allowed_users;
create policy "allowed_users_finance_all" on public.allowed_users
  for all using (public.current_role() = 'finance');
drop policy if exists "allowed_user_bus_finance_all" on public.allowed_user_bus;
create policy "allowed_user_bus_finance_all" on public.allowed_user_bus
  for all using (public.current_role() = 'finance');

-- ---------------------------------------------------------------------------
-- 6. Repoint every bu_head SELECT policy to the multi-BU helper
-- ---------------------------------------------------------------------------
drop policy if exists "pnl_lines_select_bu_head" on public.pnl_lines;
create policy "pnl_lines_select_bu_head" on public.pnl_lines
  for select using (
    exists (select 1 from public.periods pe where pe.id = period_id and pe.is_published)
    and public.current_role() = 'bu_head'
    and exists (
      select 1 from public.business_units bu
      where bu.code = pnl_lines.bu_code
        and (bu.code in (select public.current_bu_codes())
             or bu.parent_code in (select public.current_bu_codes()))
    )
  );

drop policy if exists "computed_pnl_bu_head" on public.computed_pnl;
create policy "computed_pnl_bu_head" on public.computed_pnl
  for select using (
    exists (select 1 from public.report_ranges r where r.id = range_id and r.is_published)
    and public.current_role() = 'bu_head'
    and exists (
      select 1 from public.business_units bu
      where bu.code = computed_pnl.bu_code
        and (bu.code in (select public.current_bu_codes())
             or bu.parent_code in (select public.current_bu_codes()))
    )
  );

drop policy if exists "support_sim_bu_head" on public.support_sim;
create policy "support_sim_bu_head" on public.support_sim
  for select using (
    exists (select 1 from public.report_ranges r where r.id = range_id and r.is_published)
    and public.current_role() = 'bu_head'
    and exists (
      select 1 from public.business_units bu
      where bu.code = support_sim.bu_code
        and (bu.code in (select public.current_bu_codes())
             or bu.parent_code in (select public.current_bu_codes()))
    )
  );

drop policy if exists "expense_lines_bu_head" on public.expense_lines;
create policy "expense_lines_bu_head" on public.expense_lines
  for select using (
    exists (select 1 from public.report_ranges r where r.id = range_id and r.is_published)
    and public.current_role() = 'bu_head'
    and exists (
      select 1 from public.business_units bu
      where bu.code = expense_lines.bu_code
        and (bu.code in (select public.current_bu_codes())
             or bu.parent_code in (select public.current_bu_codes()))
    )
  );

drop policy if exists "sales_qty_bu_head" on public.sales_qty_lines;
create policy "sales_qty_bu_head" on public.sales_qty_lines
  for select using (
    exists (select 1 from public.report_ranges r where r.id = range_id and r.is_published)
    and public.current_role() = 'bu_head'
    and exists (
      select 1 from public.business_units bu
      where bu.code = sales_qty_lines.bu_code
        and (bu.code in (select public.current_bu_codes())
             or bu.parent_code in (select public.current_bu_codes()))
    )
  );
