-- Let a BU Head be assigned BU10 (Trucking) and read its simulated-P&L data.
-- Finance keeps full access via the existing *_finance policies; these add
-- read-only access for anyone whose approved BUs include BU10.
drop policy if exists "pnl_months_bu10" on public.pnl_months;
create policy "pnl_months_bu10" on public.pnl_months
  for select using ('BU10' in (select public.current_bu_codes()));

drop policy if exists "monthly_truck_income_bu10" on public.monthly_truck_income;
create policy "monthly_truck_income_bu10" on public.monthly_truck_income
  for select using ('BU10' in (select public.current_bu_codes()));

drop policy if exists "monthly_truck_expense_bu10" on public.monthly_truck_expense;
create policy "monthly_truck_expense_bu10" on public.monthly_truck_expense
  for select using ('BU10' in (select public.current_bu_codes()));

drop policy if exists "monthly_truck_salary_bu10" on public.monthly_truck_salary;
create policy "monthly_truck_salary_bu10" on public.monthly_truck_salary
  for select using ('BU10' in (select public.current_bu_codes()));
