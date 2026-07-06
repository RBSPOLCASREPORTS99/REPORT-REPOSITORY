-- Mark user-added business units so the import auto-reads them from the
-- QuickBooks pivot (matching the BU code to its column). Seeded BUs stay false:
-- their compute is hardcoded/validated (BU_CONFIGS), and some seeded profit
-- centers (BU08 "Lakatan Growing/Trading") are already consumed by another
-- computed unit (BU08PH) — auto-mapping them would double-count.
alter table public.business_units
  add column if not exists auto_compute boolean not null default false;
