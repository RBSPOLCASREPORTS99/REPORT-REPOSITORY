-- auth.users is shared across all six systems in this project, so our signup
-- trigger that provisions public.profiles is unreliable (it can't raise for
-- non-POLCAS emails without blocking the other systems). Instead, self-provision
-- on login: the app calls ensure_profile(), which — only for an allow-listed
-- POLCAS email — creates/refreshes the caller's profile + BU assignments from the
-- allow-list. For any other email it does nothing, so other systems are untouched.
create or replace function public.ensure_profile()
returns text
language plpgsql security definer set search_path = public
as $$
declare
  au public.allowed_users;
  em text;
begin
  select public.norm_email(email) into em from auth.users where id = auth.uid();
  if em is null then return null; end if;

  select * into au from public.allowed_users where email = em;
  if au.email is null then return null; end if; -- not a POLCAS user

  insert into public.profiles (user_id, role, full_name)
    values (auth.uid(), au.role, au.full_name)
    on conflict (user_id) do update
      set role = excluded.role,
          full_name = coalesce(excluded.full_name, public.profiles.full_name);

  -- Sync BU assignments from the allow-list (bu_head only; finance/gm none).
  delete from public.profile_bus where user_id = auth.uid();
  insert into public.profile_bus (user_id, bu_code)
    select auth.uid(), bu_code from public.allowed_user_bus where email = au.email
    on conflict do nothing;

  update public.allowed_users
    set user_id = auth.uid(), registered_at = coalesce(registered_at, now())
    where email = au.email;

  return au.role;
end;
$$;

grant execute on function public.ensure_profile() to authenticated;
