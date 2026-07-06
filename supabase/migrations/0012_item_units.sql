-- Editable per-item Unit of Measure for the Sales-in-Qty view. Finance sets/
-- overrides the U/M for each item; it applies regardless of what the import
-- file carried, and is remembered permanently.

create table if not exists public.item_units (
  item text primary key,
  uom text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.item_units enable row level security;

-- Readable by any signed-in user (needed to render Sales Qty); Finance edits.
drop policy if exists "item_units_read_all" on public.item_units;
create policy "item_units_read_all" on public.item_units
  for select to authenticated using (true);

drop policy if exists "item_units_write_finance" on public.item_units;
create policy "item_units_write_finance" on public.item_units
  for all using (public.current_role() = 'finance');
