-- Make GFFC (Chickboy Meating Place) an assignable business unit so Finance can
-- give a BU Head access to it in the Users screen, and grant that user read
-- access to the GFFC data tables. GFFC is not auto_compute, so it is never
-- treated as a POLCAS P&L-pivot column.
insert into public.business_units (code, name, is_profit_center, sort_order)
  values ('GFFC', 'Chickboy Meating Place', true, 90)
  on conflict (code) do nothing;

-- Read access to GFFC data for anyone whose approved BUs include GFFC (Finance
-- keeps its existing full access via the *_finance policies).
drop policy if exists "gffc_monthly_pnl_assigned" on public.gffc_monthly_pnl;
create policy "gffc_monthly_pnl_assigned" on public.gffc_monthly_pnl
  for select using ('GFFC' in (select public.current_bu_codes()));

drop policy if exists "gffc_monthly_expense_assigned" on public.gffc_monthly_expense;
create policy "gffc_monthly_expense_assigned" on public.gffc_monthly_expense
  for select using ('GFFC' in (select public.current_bu_codes()));

drop policy if exists "gffc_monthly_sales_assigned" on public.gffc_monthly_sales;
create policy "gffc_monthly_sales_assigned" on public.gffc_monthly_sales
  for select using ('GFFC' in (select public.current_bu_codes()));

drop policy if exists "gffc_branch_pnl_assigned" on public.gffc_branch_pnl;
create policy "gffc_branch_pnl_assigned" on public.gffc_branch_pnl
  for select using ('GFFC' in (select public.current_bu_codes()));
