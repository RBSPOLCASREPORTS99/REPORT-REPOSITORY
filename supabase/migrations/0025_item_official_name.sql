-- Optional "official" (PAC) name per item, used as the display name in Sales Qty.
-- When blank, the item's own name is used. Different items may share one official
-- name — their quantities are then summed together in the Sales Qty view.
alter table public.item_units add column if not exists official_name text;
