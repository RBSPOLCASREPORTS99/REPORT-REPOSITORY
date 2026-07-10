-- Company-wide Total P&L for POLCAS AGRI TRADE CORP. (PCAC): the QuickBooks
-- grand-total ("TOTAL") column of each month's P&L, in ₱ '000. Additive across
-- months, so YTD / quarter / month ranges are derived by summing. No allocations
-- (trucking nets to 0 company-wide; support centers are already in the total).
create table if not exists public.monthly_company_pnl (
  month_id uuid primary key references public.pnl_months(id) on delete cascade,
  gross_sales numeric not null default 0,
  cogs numeric not null default 0,
  admin_expense numeric not null default 0,
  discounting_expense numeric not null default 0,
  operations_expense numeric not null default 0,
  repairs_expense numeric not null default 0,
  salaries_expense numeric not null default 0,
  other_income numeric not null default 0
);
alter table public.monthly_company_pnl enable row level security;

-- Company-wide totals are finance-only (a BU head must never see the whole company).
drop policy if exists "company_pnl_finance" on public.monthly_company_pnl;
create policy "company_pnl_finance" on public.monthly_company_pnl
  for all using (public.current_role() = 'finance') with check (public.current_role() = 'finance');
