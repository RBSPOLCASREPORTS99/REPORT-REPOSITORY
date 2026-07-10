import { lookupValue, type ParsedPivot } from '../importers/parsePivotTab';
import { PNL_LINE_ITEMS } from '../constants';
import type { ComparisonValues } from '../types';
import { COLS, PULLS, TRUCKING_CODES, type BuConfig } from './buConfig';

// Trucking manual inputs for one period: short BU code -> cost (₱ thousands).
export type TruckingInputs = Record<string, number>;

// The raw per-line amounts for a single BU in a single period, all in ₱ '000.
// Keys match PNL_LINE_ITEMS keys in src/lib/constants.ts.
export type SideAmounts = Record<string, number>;

function sumMemberCols(pivot: ParsedPivot, cols: string[], hierCol: number, label: string): number {
  let total = 0;
  for (const col of cols) total += lookupValue(pivot, hierCol, label, col);
  return total / 1000; // pivots are full pesos; P&L is thousands
}

// The additive per-BU raw lines (₱ '000) — everything before allocation.
export interface BuInputs {
  gross_sales: number;
  cogs: number;
  admin_expense: number;
  discounting_expense: number;
  operations_expense: number;
  repairs_expense: number;
  salaries_expense: number;
  other_income: number;
}

// The company-level pools (₱ '000) needed for the gross-sales-pro-rata
// allocation, all additive across months.
export interface PoolInputs {
  company_gross_sales: number;
  admin_pool: number;
  cost_money_pool: number;
  finance_pool: number;
  hr_pool: number;
  mancom_pool: number;
  bu10_truck_total: number; // positive cost
}

// Pull one BU's (or one truck's) additive raw lines out of a raw pivot. Only
// the member columns are needed, so a truck can pass its single QB column here.
export function extractBuInputs(pivot: ParsedPivot, cfg: { memberColumns: string[] }): BuInputs {
  const cols = cfg.memberColumns;
  return {
    gross_sales: sumMemberCols(pivot, cols, PULLS.grossSales.hierCol, PULLS.grossSales.label),
    cogs: sumMemberCols(pivot, cols, PULLS.cogs.hierCol, PULLS.cogs.label),
    admin_expense: sumMemberCols(pivot, cols, PULLS.admin.hierCol, PULLS.admin.label),
    discounting_expense: sumMemberCols(pivot, cols, PULLS.discounting.hierCol, PULLS.discounting.label),
    operations_expense: sumMemberCols(pivot, cols, PULLS.operations.hierCol, PULLS.operations.label),
    repairs_expense: sumMemberCols(pivot, cols, PULLS.repairs.hierCol, PULLS.repairs.label),
    salaries_expense: sumMemberCols(pivot, cols, PULLS.salaries.hierCol, PULLS.salaries.label),
    other_income: sumMemberCols(pivot, cols, PULLS.otherIncome.hierCol, PULLS.otherIncome.label),
  };
}

// Pull the company-level pools out of a raw pivot.
export function extractPools(pivot: ParsedPivot): PoolInputs {
  const at = (hierCol: number, label: string, col: string) => lookupValue(pivot, hierCol, label, col) / 1000;
  const costMoneyPool = at(PULLS.discounting.hierCol, PULLS.discounting.label, COLS.admin);
  const adminNetIncome = at(PULLS.netIncome.hierCol, PULLS.netIncome.label, COLS.admin);
  return {
    company_gross_sales: at(PULLS.grossSales.hierCol, PULLS.grossSales.label, COLS.companyTotal),
    admin_pool: -adminNetIncome - costMoneyPool,
    cost_money_pool: costMoneyPool,
    finance_pool: at(PULLS.classTotalExpense.hierCol, PULLS.classTotalExpense.label, COLS.finance),
    hr_pool: at(PULLS.classTotalExpense.hierCol, PULLS.classTotalExpense.label, COLS.hr),
    mancom_pool: at(PULLS.classTotalExpense.hierCol, PULLS.classTotalExpense.label, COLS.management),
    bu10_truck_total: -at(PULLS.netIncome.hierCol, PULLS.netIncome.label, COLS.truckTotal),
  };
}

// "Reclass or Adjusted Variance" — a leaf under the COGS section (already inside
// Total COGS), summed over a BU's member columns (₱ '000). Broken out below COGS
// for BU07 / BU08PH / BU09.
export function extractCogsVariance(pivot: ParsedPivot, cfg: { memberColumns: string[] }): number {
  return sumMemberCols(pivot, cfg.memberColumns, 4, 'Reclass or Adjusted Variance');
}

// QB "Total BU10 - TRUCK" -> Total Salaries and Wages (₱ '000). QuickBooks posts
// BU10 driver salaries at the class level, so this is the authoritative total
// that Finance's per-truck split is reconciled against.
export function extractBu10Salaries(pivot: ParsedPivot): number {
  return lookupValue(pivot, PULLS.salaries.hierCol, PULLS.salaries.label, COLS.truckTotal) / 1000;
}

// The single source of truth for the P&L math. Works from already-summed
// inputs, so it serves both a single month (from a pivot) and any range (sum of
// months). `truckNumer` = this BU's trucking cost, `truckDenom` = all BUs' total.
export function computeFromInputs(
  bu: BuInputs,
  pools: PoolInputs,
  cfg: BuConfig,
  truckNumer: number,
  truckDenom: number,
): SideAmounts {
  const grossIncome = bu.gross_sales - bu.cogs;
  const truckingAllocated = truckDenom !== 0 ? (truckNumer / truckDenom) * pools.bu10_truck_total : 0;
  const totalExpense =
    bu.admin_expense + bu.discounting_expense + bu.operations_expense + bu.repairs_expense + bu.salaries_expense + truckingAllocated;
  const netIncomeOps = grossIncome - totalExpense + bu.other_income;

  const share = pools.company_gross_sales !== 0 ? bu.gross_sales / pools.company_gross_sales : 0;
  const adminAllocated = share * pools.admin_pool;
  const costMoneyAllocated = share * pools.cost_money_pool;
  const totalAllocated = adminAllocated + costMoneyAllocated;

  const supportFinance = cfg.includeSupportCenters ? share * pools.finance_pool : 0;
  const supportHr = cfg.includeSupportCenters ? share * pools.hr_pool : 0;
  const supportManagement = cfg.includeSupportCenters ? share * pools.mancom_pool : 0;
  const totalSupport = supportFinance + supportHr + supportManagement;

  const netIncome = netIncomeOps - totalAllocated - totalSupport;

  return {
    gross_sales: bu.gross_sales,
    cogs: bu.cogs,
    gross_income: grossIncome,
    admin_expense: bu.admin_expense,
    discounting_expense: bu.discounting_expense,
    operations_expense: bu.operations_expense,
    repairs_expense: bu.repairs_expense,
    salaries_expense: bu.salaries_expense,
    trucking_expense: truckingAllocated,
    total_expense: totalExpense,
    other_income: bu.other_income,
    net_income_ops: netIncomeOps,
    admin_allocated: adminAllocated,
    cost_of_money_allocated: costMoneyAllocated,
    total_allocated_expense: totalAllocated,
    support_finance: supportFinance,
    support_hr: supportHr,
    support_management: supportManagement,
    total_support_centers: totalSupport,
    net_income: netIncome,
    net_income_ops_pct: bu.gross_sales !== 0 ? netIncomeOps / bu.gross_sales : 0,
    net_income_pct: bu.gross_sales !== 0 ? netIncome / bu.gross_sales : 0,
  };
}

// Compute every P&L line for one BU in one period from its raw pivot.
// `trucking` holds that period's manual per-BU trucking cost inputs (thousands).
export function computeSide(pivot: ParsedPivot, cfg: BuConfig, trucking: TruckingInputs): SideAmounts {
  const bu = extractBuInputs(pivot, cfg);
  const pools = extractPools(pivot);
  const truckDenom = TRUCKING_CODES.reduce((s, code) => s + (trucking[code] ?? 0), 0);
  const truckNumer = cfg.truckingMembers.reduce((s, code) => s + (trucking[code] ?? 0), 0);
  return computeFromInputs(bu, pools, cfg, truckNumer, truckDenom);
}

// Percentage-of-sales lines are ratios, not peso amounts; their "%" columns
// are blank in the source, so we store the ratio as the amount and 0 for pct.
const PCT_LINES = new Set(['net_income_ops_pct', 'net_income_pct']);

function block(current: SideAmounts, prior: SideAmounts, key: string): ComparisonValues {
  const cur = current[key] ?? 0;
  const pri = prior[key] ?? 0;
  const curSales = current.gross_sales || 0;
  const priSales = prior.gross_sales || 0;
  const isPct = PCT_LINES.has(key);
  // The %-of-sales summary rows (Net Income from Ops %, Net Income %) show only
  // the ratio; the source leaves their DIFF / %DIFF columns blank.
  return {
    prior: pri,
    current: cur,
    priorPct: isPct ? 0 : priSales !== 0 ? pri / priSales : 0,
    currentPct: isPct ? 0 : curSales !== 0 ? cur / curSales : 0,
    diff: isPct ? 0 : cur - pri,
    pctDiff: isPct ? 0 : pri !== 0 ? (cur - pri) / pri : 0,
  };
}

// Build one comparison block (current vs prior) as ordered lines. Used by the
// validation script; the app-facing 3-block assembly lives in buildBrFromRaw.
export interface SingleBlockLine {
  key: string;
  label: string;
  blocks: { SINGLE: ComparisonValues };
}

export function combineSides(current: SideAmounts, prior: SideAmounts): SingleBlockLine[] {
  return PNL_LINE_ITEMS.map((item) => ({
    key: item.key,
    label: item.label,
    blocks: { SINGLE: block(current, prior, item.key) },
  }));
}
