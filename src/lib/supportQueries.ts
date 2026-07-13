import { supabase } from './supabaseClient';
import { fetchRanges, fetchExpenseSectionOverrides, type RangeRow, type ExpenseSection, type ExpenseRow } from './queries';

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
export interface SupportPnlResult { hasData: boolean; lines: SupportLine[]; net: number; priorNet: number; pct: number; method: SupportMethod; rate: number }

// Methods available per unit (Management is % of revenue only).
export const UNIT_METHODS: Record<SupportUnit, { value: SupportMethod; label: string }[]> = {
  FINANCE: [{ value: 'pct', label: '% of Revenue' }, { value: 'per_txn', label: 'Per # Transaction' }],
  HR: [{ value: 'pct', label: '% of Revenue' }, { value: 'per_pax', label: 'Per PAX (EE)' }],
  MANCOM: [{ value: 'pct', label: '% of Revenue' }],
};

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

// ---- Expenses tab: grouped Salaries & Wages / Controllable / Non-controllable,
// with Finance-reclassify (like the BUs). Overrides namespaced per unit so a
// same-named account doesn't collide across units.
export const supportOverrideKey = (unit: SupportUnit, account: string) => `${unit}:${account}`;

export async function fetchSupportExpenses(unit: SupportUnit, currentRangeId: string, priorRangeId?: string): Promise<{ hasData: boolean; sections: ExpenseSection[] }> {
  const ranges = await fetchRanges();
  const curP = periodOf(ranges, currentRangeId);
  const priP = periodOf(ranges, priorRangeId);
  if (!curP) return { hasData: false, sections: [] };
  const curMonths = monthsInPeriod(curP.start, curP.end);
  const priMonths = priP ? monthsInPeriod(priP.start, priP.end) : [];
  const years = [...new Set([...curMonths, ...priMonths].map((x) => x.year))];
  const [{ data: pm }, overrides] = await Promise.all([
    supabase.from('pnl_months').select('id, year, month').in('year', years),
    fetchExpenseSectionOverrides(),
  ]);
  const idYm = new Map((pm ?? []).map((m) => [m.id as string, `${m.year}-${m.month}`]));
  const curSet = new Set(curMonths.map((x) => `${x.year}-${x.month}`));
  const priSet = new Set(priMonths.map((x) => `${x.year}-${x.month}`));
  const ids = (pm ?? []).map((m) => m.id as string);
  if (ids.length === 0) return { hasData: false, sections: [] };
  const { data } = await supabase.from('monthly_support_expense').select('month_id, section, account, amount').eq('unit', unit).in('month_id', ids);
  const K = 1000;
  // Aggregate per account (keeping the QB section to detect salaries).
  const acc = new Map<string, { section: string; current: number; prior: number }>();
  for (const r of data ?? []) {
    const ym = idYm.get(r.month_id as string); if (!ym) continue;
    const account = r.account as string;
    if (!acc.has(account)) acc.set(account, { section: r.section as string, current: 0, prior: 0 });
    const e = acc.get(account)!;
    if (curSet.has(ym)) e.current += Number(r.amount) * K;
    if (priSet.has(ym)) e.prior += Number(r.amount) * K;
  }
  const all = [...acc.entries()].filter(([, v]) => v.current !== 0 || v.prior !== 0);
  const grossCur = all.reduce((s, [, v]) => s + v.current, 0);
  const grossPri = all.reduce((s, [, v]) => s + v.prior, 0);

  const isSal = (section: string, account: string) => /salar|wage|13th\s*month/i.test(section) || /salar|wage|13th\s*month/i.test(account);
  const effCtrl = (account: string) => { const o = overrides.get(supportOverrideKey(unit, account)); return o ? o === 'controllable' : true; };

  const mkRow = (account: string, v: { section: string; current: number; prior: number }): ExpenseRow => ({
    account, section: effCtrl(account) ? 'controllable' : 'uncontrollable', groupName: v.section,
    current: v.current, prior: v.prior,
    currentPct: grossCur ? v.current / grossCur : 0, priorPct: grossPri ? v.prior / grossPri : 0,
    diff: v.current - v.prior, pctDiff: v.prior !== 0 ? (v.current - v.prior) / v.prior : 0,
  });
  const buildSec = (section: ExpenseSection['section'], filter: (a: string, v: { section: string }) => boolean): ExpenseSection => {
    const rows = all.filter(([a, v]) => filter(a, v)).map(([a, v]) => mkRow(a, v)).sort((x, y) => Math.abs(y.current) - Math.abs(x.current));
    const total = rows.reduce((s, r) => s + r.current, 0), priorTotal = rows.reduce((s, r) => s + r.prior, 0);
    return { section, total, priorTotal, pct: grossCur ? total / grossCur : 0, priorPct: grossPri ? priorTotal / grossPri : 0, rows };
  };
  const sections = [
    buildSec('salaries', (a, v) => isSal(v.section, a)),
    buildSec('controllable', (a, v) => !isSal(v.section, a) && effCtrl(a)),
    buildSec('uncontrollable', (a, v) => !isSal(v.section, a) && !effCtrl(a)),
  ].filter((s) => s.rows.length > 0);
  return { hasData: sections.length > 0, sections };
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
  if (!curP) return { hasData: false, lines: [], net: 0, priorNet: 0, pct, method, rate };

  const [basisC, basisP, expC, expP] = await Promise.all([
    serviceBasis(curP, unit, method),
    priP ? serviceBasis(priP, unit, method) : Promise.resolve(new Map<string, number>()),
    supportExpense(curP, unit),
    priP ? supportExpense(priP, unit) : Promise.resolve({ admin: 0, finance: 0, operations: 0, repairs: 0, salaries: 0, other: 0, hasData: false }),
  ]);

  const excl = new Set(exclude);
  // Everything is emitted in FULL pesos (the shared P&L table expects full pesos).
  // Revenue basis (bu_revenue) is ₱'000, so the % method ×1000; per-txn/per-PAX
  // rates are already full pesos. Expenses are ₱'000, so ×1000.
  const K = 1000;
  const serviceOf = (basis: Map<string, number>, code: string) => {
    if (excl.has(code)) return 0;
    const b = basis.get(code) ?? 0;
    return method === 'pct' ? b * pct * K : b * rate;
  };
  const eC = { admin: expC.admin * K, finance: expC.finance * K, operations: expC.operations * K, repairs: expC.repairs * K, salaries: expC.salaries * K, other: expC.other * K };
  const eP = { admin: expP.admin * K, finance: expP.finance * K, operations: expP.operations * K, repairs: expP.repairs * K, salaries: expP.salaries * K, other: expP.other * K };

  const L = (key: string, label: string, kind: SupportLineKind, current: number, prior: number, cost?: boolean): SupportLine => ({ key, label, kind, current, prior, cost });
  const serviceLines = SERVICE_BUS
    .map((b) => L(`svc_${b.code}`, `Services: ${b.label}`, 'category', serviceOf(basisC, b.code), serviceOf(basisP, b.code)))
    .filter((l) => l.current !== 0 || l.prior !== 0);
  const revenueC = serviceLines.reduce((s, l) => s + l.current, 0);
  const revenueP = serviceLines.reduce((s, l) => s + l.prior, 0);

  const totExpC = eC.admin + eC.finance + eC.operations + eC.repairs + eC.salaries;
  const totExpP = eP.admin + eP.finance + eP.operations + eP.repairs + eP.salaries;
  const netC = revenueC - totExpC + eC.other;
  const netP = revenueP - totExpP + eP.other;

  // Expense groups auto-sorted biggest-first by current amount (like the BU P&L).
  const expenseLines = [
    L('admin_expense', 'Admin Expense', 'expense', eC.admin, eP.admin, true),
    L('finance_expense', 'Finance Expense', 'expense', eC.finance, eP.finance, true),
    L('operations_expense', 'Operations Expense', 'expense', eC.operations, eP.operations, true),
    L('repairs_expense', 'Repairs/Maint. Expense', 'expense', eC.repairs, eP.repairs, true),
    L('salaries_expense', 'Salaries & Wages', 'expense', eC.salaries, eP.salaries, true),
  ].sort((a, b) => b.current - a.current);
  const lines: SupportLine[] = [
    ...serviceLines,
    L('gross_sales', 'Gross Sales — Services', 'gross', revenueC, revenueP),
    L('cost_of_services', 'Cost of Services', 'cogs', 0, 0, true),
    L('gross_income', 'Gross Income', 'gross_income', revenueC, revenueP),
    ...expenseLines,
    L('total_expense', 'Total Expense', 'total', totExpC, totExpP, true),
    L('other_income', 'Other Income', 'other', eC.other, eP.other),
    L('net_income', 'Net Income', 'net', netC, netP),
    L('net_income_pct', 'Net Income %', 'pct', revenueC ? netC / revenueC : 0, revenueP ? netP / revenueP : 0),
  ];
  return { hasData: expC.hasData || revenueC !== 0, lines, net: netC, priorNet: netP, pct, method, rate };
}
