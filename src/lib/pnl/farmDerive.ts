import { PNL_LINE_ITEMS } from '../constants';

// Pure Lakatan Farm (BU08LF) P&L math — no Supabase — so both the browser entry
// screen (farmEntry.ts) and the offline range-aggregator (deriveRanges.ts) can
// share it. The Farm is hand-entered, not computed from QuickBooks.

export const FARM_BU_CODE = 'BU08LF';
// The Deferred P&L is a second, parallel Farm P&L stored under the SAME BU08LF
// bu_code with a "def_" line-item prefix (computed_pnl.bu_code is FK-constrained,
// so a separate pseudo-code would be rejected).
export const FARM_DEFERRED_PREFIX = 'def_';

// The lines Finance enters directly. farmHint shows the Excel's farm-specific
// wording; values are stored under the standard P&L keys.
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

// The input keys, as a set (for pulling inputs back out of stored computed_pnl).
export const FARM_INPUT_KEYS = new Set(FARM_INPUT_LINES.map((l) => l.key));

export type FarmInputs = Record<string, number>;

const PCT_KEYS = new Set(['net_income_ops_pct', 'net_income_pct']);

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

export interface FarmPnlRow { range_id: string; bu_code: string; line_item: string; amount: number; pct_of_sales: number }

// The computed_pnl rows for a Farm P&L (or, deferred=true, its Deferred P&L).
export function farmComputedRows(rangeId: string, inputs: FarmInputs, deferred = false): FarmPnlRow[] {
  const derived = deriveFarmLines(inputs);
  const gs = derived.gross_sales || 0;
  const prefix = deferred ? FARM_DEFERRED_PREFIX : '';
  return PNL_LINE_ITEMS.map((item) => {
    const amount = derived[item.key] ?? 0;
    return {
      range_id: rangeId, bu_code: FARM_BU_CODE, line_item: prefix + item.key, amount,
      pct_of_sales: PCT_KEYS.has(item.key) || gs === 0 ? 0 : amount / gs,
    };
  });
}

// The line-item keys a Farm save owns (regular or deferred) — used to delete only
// its own rows before re-inserting.
export const farmItemKeys = (deferred = false): string[] =>
  PNL_LINE_ITEMS.map((i) => (deferred ? FARM_DEFERRED_PREFIX : '') + i.key);
