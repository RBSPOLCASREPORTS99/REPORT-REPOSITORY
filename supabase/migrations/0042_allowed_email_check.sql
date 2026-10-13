-- Passwordless (email-only) login needs to check, before sending a one-time
-- login link, whether an email is registered in THIS app's allow-list. The
-- shared auth.users signup trigger can't be relied on to gate (it must not raise
-- for the other PAC systems' users), so expose a small read-only check instead.
-- SECURITY DEFINER so the anon (pre-login) client can call it; it returns only a
-- boolean and never touches any other schema.
create or replace function public.is_br_allowed_email(p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.allowed_users where email = public.norm_email(p_email));
$$;

grant execute on function public.is_br_allowed_email(text) to anon, authenticated;
