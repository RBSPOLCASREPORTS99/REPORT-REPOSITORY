-- Allow Finance to add new business units from the "Business Unit Names" screen.
-- (0011 already lets Finance update; 0001 lets everyone read.)
drop policy if exists "business_units_insert_finance" on public.business_units;
create policy "business_units_insert_finance" on public.business_units
  for insert with check (public.current_role() = 'finance');
