-- "Reclass or Adjusted Variance" — a leaf account under the COGS section that is
-- already included in Total COGS. For BU07 / BU08PH / BU09 the P&L breaks it out
-- below Cost of Goods Sold with a Total. Stored per BU per month (₱ '000),
-- additive; does not change Gross Income (Total COGS is unchanged).
alter table public.monthly_pnl_inputs
  add column if not exists cogs_variance numeric not null default 0;
