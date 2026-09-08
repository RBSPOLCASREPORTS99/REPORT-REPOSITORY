-- User-defined parameter items. Some parameter groups (e.g. BU11's "Kilos
-- Delivered") are open-ended: Finance can add products beyond the built-in ones.
-- Each row is one custom item's definition — its display label and the group it
-- belongs to. The item's per-period VALUE is still stored in bu_parameters under
-- item_key, exactly like a built-in manual parameter; only the definition lives
-- here. Prefixed br_ to avoid any collision in the shared public schema.
create table if not exists public.br_param_items (
  bu_code text not null,
  group_key text not null,   -- which group it belongs to (e.g. 'kilos_delivered')
  item_key text not null,    -- the param_key used in bu_parameters (unique per BU)
  label text not null,
  sort_order int not null default 0,
  primary key (bu_code, item_key)
);
alter table public.br_param_items enable row level security;
-- Definitions aren't sensitive (just labels) and must be visible to everyone who
-- views a BU's Parameters tab; Finance creates and edits them.
drop policy if exists "br_param_items_read" on public.br_param_items;
create policy "br_param_items_read" on public.br_param_items for select to authenticated using (true);
drop policy if exists "br_param_items_write" on public.br_param_items;
create policy "br_param_items_write" on public.br_param_items
  for all using (public.current_role() = 'finance') with check (public.current_role() = 'finance');
