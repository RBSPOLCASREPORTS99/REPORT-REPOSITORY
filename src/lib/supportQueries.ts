import { supabase } from './supabaseClient';
import { fetchRanges, type RangeRow } from './queries';

// Simulated Support-Unit P&L (Finance / HR / Management). Revenue is simulated as
// a % of company revenue (excluding any configured BUs); expenses are the unit's
// actual figures captured from the P&L-per-Class import. All values ₱'000.

export type SupportUnit = 'FINANCE' | 'HR' | 'MANCOM';
export const SUPPORT_UNITS: { unit: SupportUnit; label: string; slug: string }[] = [
  { unit: 'FINANCE', label: 'Finance P&L', slug: 'finance' },
  { unit: 'HR', label: 'HR P&L', slug: 'hr' },
  { unit: 'MANCOM', label: 'Management P&L', slug: 'management' },
];
export const unitBySlug = (slug?: string) => SUPPORT_UNITS.find((u) => u.slug === slug);

export type SupportLineKind = 'gross' | 'cogs' | 'gross_income' | 'expense' | 'total' | 'other' | 'net' | 'pct';
export interface SupportLine { key: string; label: string; kind: SupportLineKind; current: number; prior: number; cost?: boolean }
export interface SupportPnlResult { hasData: boolean; lines: SupportLine[]; net: number; priorNet: number; pct: number }

const monthsInPeriod = (start: string, end: string) => {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const out: { year: number; month: number }[] = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) { out.push({ year: y, month: m }); m++; if (m > 12) { m = 1; y++; } }
  return out;
};
const periodOf = (ranges: RangeRow[], id?: string) => {
  const r = ranges.find((x) => x.id === id);
  return r ? { start: r.period_start, end: r.period_end } : undefined;
};

// Config (manual %) for a unit — defaults if not yet set.
export async function fetchSupportConfig(unit: SupportUnit): Promise<{ pct: number; exclude: string[] }> {
  const { data } = await supabase.from('support_unit_config').select('pct_of_revenue, exclude_bus').eq('unit', unit).maybeSingle();
  return { pct: data ? Number(data.pct_of_revenue) : 0, exclude: (data?.exclude_bus as string[]) ?? [] };
}
export async function saveSupportPct(unit: SupportUnit, pct: number): Promise<void> {
  const { error } = await supabase.from('support_unit_config').upsert({ unit, pct_of_revenue: pct }, { onConflict: 'unit' });
  if (error) throw error;
}

// Company revenue for a period (QB TOTAL column, ₱'000) and the summed gross
// sales of a set of BU codes (to exclude them from the revenue base).
async function revenueBase(period: { start: string; end: string }, exclude: string[]): Promise<number> {
  const months = monthsInPeriod(period.start, period.end);
  const years = [...new Set(months.map((x) => x.year))];
  const inSet = new Set(months.map((x) => `${x.year}-${x.month}`));
  const { data: pm } = await supabase.from('pnl_months').select('id, year, month').in('year', years);
  const ids = (pm ?? []).filter((r) => inSet.has(`${r.year}-${r.month}`)).map((r) => r.id as string);
  if (ids.length === 0) return 0;
  const { data: comp } = await supabase.from('monthly_company_pnl').select('gross_sales').in('month_id', ids);
  const company = (comp ?? []).reduce((s, r) => s + Number(r.gross_sales), 0);
  if (exclude.length === 0) return company;
  // Exclude BUs by their computed gross sales over the period's ranges is complex;
  // instead subtract their monthly inputs' gross sales.
  const { data: inp } = await supabase.from('monthly_pnl_inputs').select('gross_sales').in('month_id', ids).in('bu_code', exclude);
  const excl = (inp ?? []).reduce((s, r) => s + Number(r.gross_sales), 0);
  return company - excl;
}

async function supportExpense(period: { start: string; end: string }, unit: SupportUnit) {
  const months = monthsInPeriod(period.start, period.end);
  const years = [...new Set(months.map((x) => x.year))];
  const inSet = new Set(months.map((x) => `${x.year}-${x.month}`));
  const { data: pm } = await supabase.from('pnl_months').select('id, year, month').in('year', years);
  const ids = (pm ?? []).filter((r) => inSet.has(`${r.year}-${r.month}`)).map((r) => r.id as string);
  const agg = { admin: 0, finance: 0, operations: 0, repairs: 0, salaries: 0, other: 0 };
  if (ids.length === 0) return { ...agg, hasData: false };
  const { data } = await supabase.from('monthly_support_pnl').select('admin_expense, discounting_expense, operations_expense, repairs_expense, salaries_expense, other_income').in('month_id', ids).eq('unit', unit);
  for (const r of data ?? []) {
    agg.admin += Number(r.admin_expense); agg.finance += Number(r.discounting_expense);
    agg.operations += Number(r.operations_expense); agg.repairs += Number(r.repairs_expense);
    agg.salaries += Number(r.salaries_expense); agg.other += Number(r.other_income);
  }
  return { ...agg, hasData: (data ?? []).length > 0 };
}

export async function fetchSupportPnl(unit: SupportUnit, currentRangeId: string, priorRangeId?: string): Promise<SupportPnlResult> {
  const ranges = await fetchRanges();
  const curP = periodOf(ranges, currentRangeId);
  const priP = periodOf(ranges, priorRangeId);
  const { pct, exclude } = await fetchSupportConfig(unit);
  if (!curP) return { hasData: false, lines: [], net: 0, priorNet: 0, pct };

  const [revC, revP, expC, expP] = await Promise.all([
    revenueBase(curP, exclude),
    priP ? revenueBase(priP, exclude) : Promise.resolve(0),
    supportExpense(curP, unit),
    priP ? supportExpense(priP, unit) : Promise.resolve({ admin: 0, finance: 0, operations: 0, repairs: 0, salaries: 0, other: 0, hasData: false }),
  ]);

  const revenueC = revC * pct, revenueP = revP * pct;
  const totExpC = expC.admin + expC.finance + expC.operations + expC.repairs + expC.salaries;
  const totExpP = expP.admin + expP.finance + expP.operations + expP.repairs + expP.salaries;
  const netC = revenueC - totExpC + expC.other;
  const netP = revenueP - totExpP + expP.other;

  const L = (key: string, label: string, kind: SupportLineKind, current: number, prior: number, cost?: boolean): SupportLine => ({ key, label, kind, current, prior, cost });
  const lines: SupportLine[] = [
    L('gross_sales', 'Gross Sales — Services', 'gross', revenueC, revenueP),
    L('cost_of_services', 'Cost of Services', 'cogs', 0, 0, true),
    L('gross_income', 'Gross Income', 'gross_income', revenueC, revenueP),
    L('admin_expense', 'Admin Expense', 'expense', expC.admin, expP.admin, true),
    L('finance_expense', 'Finance Expense', 'expense', expC.finance, expP.finance, true),
    L('operations_expense', 'Operations Expense', 'expense', expC.operations, expP.operations, true),
    L('repairs_expense', 'Repairs/Maint. Expense', 'expense', expC.repairs, expP.repairs, true),
    L('salaries_expense', 'Salaries & Wages', 'expense', expC.salaries, expP.salaries, true),
    L('total_expense', 'Total Expense', 'total', totExpC, totExpP, true),
    L('other_income', 'Other Income', 'other', expC.other, expP.other),
    L('net_income', 'Net Income', 'net', netC, netP),
    L('net_income_pct', 'Net Income %', 'pct', revenueC ? netC / revenueC : 0, revenueP ? netP / revenueP : 0),
  ];
  return { hasData: expC.hasData || revenueC !== 0, lines, net: netC, priorNet: netP, pct };
}
