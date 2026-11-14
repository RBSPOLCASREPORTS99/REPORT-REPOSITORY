-- Monthly PURCHASES per Business Unit, imported from the "PAC Purchases by BU"
-- workbook. Used to allocate the company Cost of Money pool by each BU's
-- (Purchases + Expenses) share instead of by Gross Sales. Amounts in ₱'000
-- (the same unit as the P&L inputs and pools), keyed by the imported P&L month.
-- Prefixed br_ to avoid any collision in the shared public schema.
create table if not exists public.br_bu_purchases (
  month_id uuid not null references public.pnl_months(id) on delete cascade,
  bu_code text not null,
  amount numeric not null default 0,
  primary key (month_id, bu_code)
);
create index if not exists br_bu_purchases_month_idx on public.br_bu_purchases (month_id);

alter table public.br_bu_purchases enable row level security;
-- Finance-only, like the other raw monthly_* import inputs. The derived figures
-- land in computed_pnl, which every role already reads.
drop policy if exists "br_bu_purchases_finance" on public.br_bu_purchases;
create policy "br_bu_purchases_finance" on public.br_bu_purchases
  for all using (public.current_role() = 'finance') with check (public.current_role() = 'finance');
