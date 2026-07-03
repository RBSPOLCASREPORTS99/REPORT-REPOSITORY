-- Editable "proper" Business Unit naming shown on the dashboard and BU detail,
-- formatted as "<display code> - <NAME>" (e.g. "BU01/02 - BODEGA 1 & 2").
-- The internal `code` (BU0102) stays the join key; `display_code` is only for
-- presentation, so BU01 & BU02 can read as "BU01/02" even though they are
-- always combined into one computed unit.

alter table public.business_units add column if not exists display_code text;

-- Sensible default for the combined Bodega 1 & 2 unit.
update public.business_units set display_code = 'BU01/02' where code = 'BU0102' and display_code is null;

-- Finance may rename business units; everyone can still read them (0001 policy).
drop policy if exists "business_units_update_finance" on public.business_units;
create policy "business_units_update_finance" on public.business_units
  for update using (public.current_role() = 'finance');
