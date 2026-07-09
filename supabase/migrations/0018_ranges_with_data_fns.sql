-- The viewer decides whether to show the Expenses / Sales / Support tabs by
-- collecting the set of range_ids that have data. Selecting every row from these
-- (growing) tables hits the API row cap once they exceed ~1000 rows, silently
-- dropping ranges. These DISTINCT functions return only the range_ids (≤ a few
-- dozen rows), so the availability check stays correct at any data volume.
-- SECURITY INVOKER (the default) keeps the caller's RLS in force.
create or replace function public.ranges_with_expenses()
  returns table(range_id uuid) language sql stable
  as $$ select distinct e.range_id from public.expense_lines e $$;

create or replace function public.ranges_with_sales()
  returns table(range_id uuid) language sql stable
  as $$ select distinct s.range_id from public.sales_qty_lines s $$;

create or replace function public.ranges_with_support()
  returns table(range_id uuid) language sql stable
  as $$ select distinct s.range_id from public.support_sim s $$;

grant execute on function public.ranges_with_expenses() to anon, authenticated;
grant execute on function public.ranges_with_sales() to anon, authenticated;
grant execute on function public.ranges_with_support() to anon, authenticated;
