import { supabase } from './supabaseClient';
import { PNL_LINE_ITEMS } from './constants';

// Lakatan Farm (BU08LF) is hand-entered in the Excel workbook, not computed
// from QuickBooks. Finance types the input lines; we derive the subtotals the
// same way the P&L does, then store the result as BU08LF's computed_pnl side so
// it appears in the dashboard like any other BU.

export const FARM_BU_CODE = 'BU08LF';

// The lines Finance enters directly. The farmLabel shows the Excel's farm-
// specific wording; values are stored under the standard P&L keys so the viewer
// renders the Farm consistently with the other units.
export const FARM_INPUT_LINES: { key: string; label: string; farmHint?: string }[] = [
  { key: 'gross_sales', label: 'Gross Sales' },
  { key: 'cogs', label: 'Cost of Goods Sold' },
  { key: 'admin_expense', label: 'Admin Expense', farmHint: 'Fertilizer / Chemical' },
  { key: 'discounting_expense', label: 'Discounting Expense', farmHint: 'Labor' },
  { key: 'operations_expense', label: 'Operations Expense', farmHint: 'Other Ops' },
  { key: 'repairs_expense', label: 'Repairs & Maintenance', farmHint: 'Land Prep' },
  { key: 'salaries_expense', label: 'Salaries & Wages', farmHint: 'Planting' },
  { key: 'other_income', label: 'Other Income' },
  { key: 'admin_allocated', label: 'Admin Expense (allocated)' },
  { key: 'cost_of_money_allocated', label: 'Cost of Money (allocated)' },
  { key: 'support_finance', label: 'Support: Finance' },
  { key: 'support_hr', label: 'Support: Human Resource' },
  { key: 'support_management', label: 'Support: Management' },
];

export type FarmInputs = Record<string, number>;

// Derive every P&L line (inputs + computed subtotals) from the entered inputs.
export function deriveFarmLines(inp: FarmInputs): Record<string, number> {
  const v = (k: string) => inp[k] ?? 0;
  const grossSales = v('gross_sales');
  const grossIncome = grossSales - v('cogs');
  const trucking = 0; // the Farm carries no trucking allocation
  const totalExpense =
    v('admin_expense') + v('discounting_expense') + v('operations_expense') +
    v('repairs_expense') + v('salaries_expense') + trucking;
  const netIncomeOps = grossIncome - totalExpense + v('other_income');
  const totalAllocated = v('admin_allocated') + v('cost_of_money_allocated');
  const totalSupport = v('support_finance') + v('support_hr') + v('support_management');
  const netIncome = netIncomeOps - totalAllocated - totalSupport;

  return {
    gross_sales: grossSales,
    cogs: v('cogs'),
    gross_income: grossIncome,
    admin_expense: v('admin_expense'),
    discounting_expense: v('discounting_expense'),
    operations_expense: v('operations_expense'),
    repairs_expense: v('repairs_expense'),
    salaries_expense: v('salaries_expense'),
    trucking_expense: trucking,
    total_expense: totalExpense,
    other_income: v('other_income'),
    net_income_ops: netIncomeOps,
    admin_allocated: v('admin_allocated'),
    cost_of_money_allocated: v('cost_of_money_allocated'),
    total_allocated_expense: totalAllocated,
    support_finance: v('support_finance'),
    support_hr: v('support_hr'),
    support_management: v('support_management'),
    total_support_centers: totalSupport,
    net_income: netIncome,
    net_income_ops_pct: grossSales !== 0 ? netIncomeOps / grossSales : 0,
    net_income_pct: grossSales !== 0 ? netIncome / grossSales : 0,
  };
}

const PCT_KEYS = new Set(['net_income_ops_pct', 'net_income_pct']);

// Load the Farm's currently-stored inputs for a range (to pre-fill the form).
export async function loadFarmInputs(rangeId: string): Promise<FarmInputs> {
  const { data, error } = await supabase
    .from('computed_pnl').select('line_item, amount').eq('range_id', rangeId).eq('bu_code', FARM_BU_CODE);
  if (error) throw error;
  const inputs: FarmInputs = {};
  const inputKeys = new Set(FARM_INPUT_LINES.map((l) => l.key));
  for (const r of data ?? []) if (inputKeys.has(r.line_item as string)) inputs[r.line_item as string] = r.amount as number;
  return inputs;
}

function monthsInPeriod(start: string, end: string): { year: number; month: number }[] {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const out: { year: number; month: number }[] = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) { out.push({ year: y, month: m }); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

// Auto-compute the Farm's allocated support-centre lines the same way the other
// BUs are allocated: each = (Farm Gross Sales ÷ company Gross Sales) × the
// company-wide pool, summed over the range's months. Returns null when the pools
// for the period aren't imported yet.
export interface FarmAllocations {
  admin_allocated: number;
  cost_of_money_allocated: number;
  support_finance: number;
  support_hr: number;
  support_management: number;
}
export async function computeFarmAllocations(rangeId: string, grossSales: number): Promise<FarmAllocations | null> {
  const { data: rng } = await supabase.from('report_ranges').select('period_start, period_end').eq('id', rangeId).maybeSingle();
  if (!rng) return null;
  const want = new Set(monthsInPeriod(rng.period_start as string, rng.period_end as string).map((m) => `${m.year}-${m.month}`));
  const { data: pm } = await supabase.from('pnl_months').select('id, year, month');
  const ids = (pm ?? []).filter((r) => want.has(`${r.year}-${r.month}`)).map((r) => r.id as string);
  if (ids.length === 0) return null;
  const { data: pools } = await supabase.from('monthly_pnl_pools')
    .select('company_gross_sales, admin_pool, cost_money_pool, finance_pool, hr_pool, mancom_pool').in('month_id', ids);
  if (!pools || pools.length === 0) return null;
  const sum = { company_gross_sales: 0, admin_pool: 0, cost_money_pool: 0, finance_pool: 0, hr_pool: 0, mancom_pool: 0 };
  for (const p of pools) {
    sum.company_gross_sales += Number(p.company_gross_sales) || 0;
    sum.admin_pool += Number(p.admin_pool) || 0;
    sum.cost_money_pool += Number(p.cost_money_pool) || 0;
    sum.finance_pool += Number(p.finance_pool) || 0;
    sum.hr_pool += Number(p.hr_pool) || 0;
    sum.mancom_pool += Number(p.mancom_pool) || 0;
  }
  const share = sum.company_gross_sales !== 0 ? grossSales / sum.company_gross_sales : 0;
  const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
  return {
    admin_allocated: r5(share * sum.admin_pool),
    cost_of_money_allocated: r5(share * sum.cost_money_pool),
    support_finance: r5(share * sum.finance_pool),
    support_hr: r5(share * sum.hr_pool),
    support_management: r5(share * sum.mancom_pool),
  };
}

// Save the Farm's P&L for a range (replace prior entry).
export async function saveFarmEntry(rangeId: string, inputs: FarmInputs): Promise<void> {
  const derived = deriveFarmLines(inputs);
  const gs = derived.gross_sales || 0;
  await supabase.from('computed_pnl').delete().eq('range_id', rangeId).eq('bu_code', FARM_BU_CODE);
  const rows = PNL_LINE_ITEMS.map((item) => {
    const amount = derived[item.key] ?? 0;
    return {
      range_id: rangeId, bu_code: FARM_BU_CODE, line_item: item.key, amount,
      pct_of_sales: PCT_KEYS.has(item.key) || gs === 0 ? 0 : amount / gs,
    };
  });
  const { error } = await supabase.from('computed_pnl').insert(rows);
  if (error) throw error;
}
