import { supabase } from './supabaseClient';
import { fetchRanges, type RangeRow } from './queries';

// Simulated Support-Unit P&L (Finance / HR / Management). Revenue is simulated as
// a % of company revenue (excluding any configured BUs); expenses are the unit's
// actual figures captured from the P&L-per-Class import. All values ₱'000.

// The BUs a support unit bills, with their pivot columns (for import) and the
// label shown in the services breakdown.
export const SERVICE_BUS: { code: string; label: string; cols: string[] }[] = [
  { code: 'BU0102', label: 'BU01/BU02', cols: ['BU01 - Bodega 1', 'BU02 - Bodega 2'] },
  { code: 'BU04', label: 'BU04', cols: ['BU04 - Bodega 4 Wooden Pallets'] },
  { code: 'BU05', label: 'BU05', cols: ['BU05 - Trading'] },
  { code: 'BU06', label: 'BU06', cols: ['BU06 - CCG/CPG/PGF'] },
  { code: 'BU07', label: 'BU07', cols: ['BU07 - Hogs Partnership Growing'] },
  { code: 'BU08', label: 'BU08', cols: ['Total BU08 - Lakatan Growing/Trading'] },
  { code: 'BU09', label: 'BU09', cols: ['BU09 - Hog Feeds Production'] },
  { code: 'BU10', label: 'BU10', cols: ['Total BU10 - TRUCK'] },
  { code: 'BU11', label: 'BU11', cols: ['BU11 - Agri-Solutions'] },
];

export type SupportMethod = 'pct' | 'per_txn' | 'per_pax';
export type SupportUnit = 'FINANCE' | 'HR' | 'MANCOM';
export const SUPPORT_UNITS: { unit: SupportUnit; label: string; slug: string }[] = [
  { unit: 'FINANCE', label: 'Finance P&L', slug: 'finance' },
  { unit: 'HR', label: 'HR P&L', slug: 'hr' },
  { unit: 'MANCOM', label: 'Management P&L', slug: 'management' },
];
export const unitBySlug = (slug?: string) => SUPPORT_UNITS.find((u) => u.slug === slug);

export type SupportLineKind = 'category' | 'gross' | 'cogs' | 'gross_income' | 'expense' | 'total' | 'other' | 'net' | 'pct';
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

export interface SupportConfig { pct: number; exclude: string[]; method: SupportMethod; rate: number }
export async function fetchSupportConfig(unit: SupportUnit): Promise<SupportConfig> {
  const { data } = await supabase.from('support_unit_config').select('pct_of_revenue, exclude_bus, method, rate').eq('unit', unit).maybeSingle();
  return {
    pct: data ? Number(data.pct_of_revenue) : 0,
    exclude: (data?.exclude_bus as string[]) ?? [],
    method: (data?.method as SupportMethod) ?? 'pct',
    rate: data ? Number(data.rate) : 0,
  };
}
export async function saveSupportPct(unit: SupportUnit, pct: number): Promise<void> {
  const { error } = await supabase.from('support_unit_config').upsert({ unit, pct_of_revenue: pct }, { onConflict: 'unit' });
  if (error) throw error;
}
export async function saveSupportConfig(unit: SupportUnit, method: SupportMethod, rate: number): Promise<void> {
  const { error } = await supabase.from('support_unit_config').upsert({ unit, method, rate }, { onConflict: 'unit' });
  if (error) throw error;
}

// Month ids for a period.
async function monthIds(period: { start: string; end: string }): Promise<string[]> {
  const months = monthsInPeriod(period.start, period.end);
  const years = [...new Set(months.map((x) => x.year))];
  const inSet = new Set(months.map((x) => `${x.year}-${x.month}`));
  const { data: pm } = await supabase.from('pnl_months').select('id, year, month').in('year', years);
  return (pm ?? []).filter((r) => inSet.has(`${r.year}-${r.month}`)).map((r) => r.id as string);
}

// Per-BU service basis over a period: revenue (% method) or summed counts.
async function serviceBasis(period: { start: string; end: string }, unit: SupportUnit, method: SupportMethod): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (method === 'pct') {
    const ids = await monthIds(period);
    if (ids.length === 0) return out;
    const { data } = await supabase.from('monthly_support_bu_revenue').select('bu_code, gross_sales').in('month_id', ids);
    for (const r of data ?? []) out.set(r.bu_code as string, (out.get(r.bu_code as string) ?? 0) + Number(r.gross_sales));
  } else {
    const months = monthsInPeriod(period.start, period.end);
    const years = [...new Set(months.map((x) => x.year))];
    const inSet = new Set(months.map((x) => `${x.year}-${x.month}`));
    const { data } = await supabase.from('support_bu_count').select('year, month, bu_code, count').eq('unit', unit).in('year', years);
    for (const r of data ?? []) if (inSet.has(`${r.year}-${r.month}`)) out.set(r.bu_code as string, (out.get(r.bu_code as string) ?? 0) + Number(r.count));
  }
  return out;
}

// ---- manual per-BU counts entry ----
export async function loadSupportCounts(year: number, month: number, unit: SupportUnit): Promise<Record<string, number>> {
  const { data } = await supabase.from('support_bu_count').select('bu_code, count').eq('year', year).eq('month', month).eq('unit', unit);
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.bu_code as string] = Number(r.count);
  return out;
}
export async function saveSupportCounts(year: number, month: number, unit: SupportUnit, counts: Record<string, number>): Promise<void> {
  await supabase.from('support_bu_count').delete().eq('year', year).eq('month', month).eq('unit', unit);
  const rows = Object.entries(counts).filter(([, v]) => v).map(([bu_code, count]) => ({ year, month, unit, bu_code, count }));
  if (rows.length) { const { error } = await supabase.from('support_bu_count').insert(rows); if (error) throw error; }
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
  const cfg = await fetchSupportConfig(unit);
  const { pct, exclude, method, rate } = cfg;
  if (!curP) return { hasData: false, lines: [], net: 0, priorNet: 0, pct };

  const [basisC, basisP, expC, expP] = await Promise.all([
    serviceBasis(curP, unit, method),
    priP ? serviceBasis(priP, unit, method) : Promise.resolve(new Map<string, number>()),
    supportExpense(curP, unit),
    priP ? supportExpense(priP, unit) : Promise.resolve({ admin: 0, finance: 0, operations: 0, repairs: 0, salaries: 0, other: 0, hasData: false }),
  ]);

  const excl = new Set(exclude);
  // Per-BU service income = revenue×% (pct) or count×rate (per_txn / per_pax).
  const serviceOf = (basis: Map<string, number>, code: string) => (excl.has(code) ? 0 : (basis.get(code) ?? 0) * (method === 'pct' ? pct : rate));

  const L = (key: string, label: string, kind: SupportLineKind, current: number, prior: number, cost?: boolean): SupportLine => ({ key, label, kind, current, prior, cost });
  const serviceLines = SERVICE_BUS
    .map((b) => L(`svc_${b.code}`, `Services: ${b.label}`, 'category', serviceOf(basisC, b.code), serviceOf(basisP, b.code)))
    .filter((l) => l.current !== 0 || l.prior !== 0);
  const revenueC = serviceLines.reduce((s, l) => s + l.current, 0);
  const revenueP = serviceLines.reduce((s, l) => s + l.prior, 0);

  const totExpC = expC.admin + expC.finance + expC.operations + expC.repairs + expC.salaries;
  const totExpP = expP.admin + expP.finance + expP.operations + expP.repairs + expP.salaries;
  const netC = revenueC - totExpC + expC.other;
  const netP = revenueP - totExpP + expP.other;

  const lines: SupportLine[] = [
    ...serviceLines,
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
