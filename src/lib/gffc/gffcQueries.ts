import { supabase } from '../supabaseClient';
import { GFFC_CATEGORIES, GFFC_GROUPS, GFFC_EXPENSE_KEYS } from './gffcConfig';
import { fetchExpenseSectionOverrides } from '../queries';
import type { ExpenseSection, ExpenseRow, SalesItemRow, TrendPoint } from '../queries';

// A date period (from a resolved comparison range) → the GFFC P&L summed over
// its months. GFFC values are full pesos.

export interface Period { start: string; end: string } // 'YYYY-MM-DD'

export type GffcLineKind = 'category' | 'gross' | 'cogs' | 'gross_income' | 'expense' | 'total' | 'other' | 'net' | 'pct';
export interface GffcPnlLine {
  key: string;
  label: string;
  kind: GffcLineKind;
  current: number;
  prior: number;
  cost?: boolean; // expense/COGS line (an increase is unfavourable)
  indent?: boolean; // sub-line of the row above (e.g. a Salaries & Wages component)
}
export interface GffcPnlResult {
  hasData: boolean;
  lines: GffcPnlLine[];
  net: number;
  priorNet: number;
  simulatedPrior?: boolean; // prior YTD was simulated from Aug–Dec 2025
}

function monthsInPeriod(start: string, end: string): { year: number; month: number }[] {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const out: { year: number; month: number }[] = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) { out.push({ year: y, month: m }); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

async function sumPeriod(p: Period): Promise<{ agg: Record<string, number>; hasData: boolean }> {
  const months = monthsInPeriod(p.start, p.end);
  const years = [...new Set(months.map((x) => x.year))];
  const { data } = await supabase.from('gffc_monthly_pnl').select('year, month, line_key, amount').in('year', years);
  const inSet = new Set(months.map((x) => `${x.year}-${x.month}`));
  const agg: Record<string, number> = {};
  let hasData = false;
  for (const r of data ?? []) {
    if (!inSet.has(`${r.year}-${r.month}`)) continue;
    hasData = true;
    agg[r.line_key as string] = (agg[r.line_key as string] ?? 0) + Number(r.amount);
  }
  return { agg, hasData };
}

// Build the ordered GFFC Total P&L for a current period vs an optional prior.
export async function fetchGffcPnl(current: Period, prior?: Period): Promise<GffcPnlResult> {
  const c = await sumPeriod(current);
  let p = prior ? await sumPeriod(prior) : { agg: {} as Record<string, number>, hasData: false };

  // GFFC started August 2025, so a prior-year YTD (Jan–…) has no actual data.
  // Simulate it from GFFC's first partial year: each line = (Aug 2025–Dec 2025
  // total ÷ 5 months of actual data) × the current YTD's month count (e.g. × 6
  // for YTD June). The derived rows (Gross Income, Total Expense, Net Income)
  // then compute from these.
  let simulatedPrior = false;
  const isJan = (d?: string) => !!d && Number(d.split('-')[1]) === 1;
  if (prior && !p.hasData && isJan(current.start) && isJan(prior.start)) {
    const base = await sumPeriod({ start: '2025-08-01', end: '2025-12-31' });
    if (base.hasData) {
      const baseMonths = monthsInPeriod('2025-08-01', '2025-12-31').length; // 5
      const monthCount = monthsInPeriod(current.start, current.end).length || 1;
      const sim: Record<string, number> = {};
      for (const [k, v] of Object.entries(base.agg)) sim[k] = (v / baseMonths) * monthCount;
      p = { agg: sim, hasData: true };
      simulatedPrior = true;
    }
  }

  const cur = c.agg, pri = p.agg;

  const grossSales = (a: Record<string, number>) => GFFC_CATEGORIES.reduce((s, x) => s + (a[x.key] ?? 0), 0);
  const totalExpense = (a: Record<string, number>) => GFFC_EXPENSE_KEYS.reduce((s, k) => s + (a[k] ?? 0), 0);
  const grossIncome = (a: Record<string, number>) => grossSales(a) - (a.cogs ?? 0);
  const otherIncome = (a: Record<string, number>) => a.other_income ?? 0;
  const net = (a: Record<string, number>) => grossIncome(a) - totalExpense(a) + otherIncome(a);

  const line = (key: string, label: string, kind: GffcLineKind, cf: (a: Record<string, number>) => number, cost?: boolean): GffcPnlLine =>
    ({ key, label, kind, current: cf(cur), prior: cf(pri), cost });

  // Sales categories & expense groups, auto-sorted biggest-first by current amount.
  const categoryLines = GFFC_CATEGORIES
    .map((x) => line(x.key, x.label, 'category', (a) => a[x.key] ?? 0))
    .sort((a, b) => b.current - a.current);
  const expenseLines = GFFC_GROUPS.filter((g) => g.key !== 'cogs')
    .map((g) => line(g.key, g.label, 'expense', (a) => a[g.key] ?? 0, true))
    .sort((a, b) => b.current - a.current);

  const lines: GffcPnlLine[] = [
    ...categoryLines,
    line('gross_sales', 'Gross Sales', 'gross', grossSales),
    line('cogs', 'Cost of Goods Sold', 'cogs', (a) => a.cogs ?? 0, true),
    line('gross_income', 'Gross Income', 'gross_income', grossIncome),
    ...expenseLines,
    line('total_expense', 'Total Expense', 'total', totalExpense, true),
    line('other_income', 'Other Income', 'other', otherIncome),
    line('net_income', 'Net Income', 'net', net),
    line('net_income_pct', 'Net Income %', 'pct', (a) => (grossSales(a) !== 0 ? net(a) / grossSales(a) : 0)),
  ];

  return { hasData: c.hasData, lines, net: net(cur), priorNet: net(pri), simulatedPrior };
}

function periodMonths(p: Period) {
  return { months: monthsInPeriod(p.start, p.end), years: [...new Set(monthsInPeriod(p.start, p.end).map((x) => x.year))] };
}

// ---- Trend (monthly Gross Sales / Gross Income / Expense / NIfO) -------------
const TREND_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// GFFC monthly trend for the chart shared with the BUs. GFFC values are full
// pesos; the chart is in ₱ thousands, so divide by 1000 to match its scale.
export async function fetchGffcTrend(limit = 12): Promise<TrendPoint[]> {
  const { data } = await supabase.from('gffc_monthly_pnl').select('year, month, line_key, amount');
  const byM = new Map<string, { year: number; month: number; agg: Record<string, number> }>();
  for (const r of data ?? []) {
    const key = `${r.year}-${String(r.month).padStart(2, '0')}`;
    let e = byM.get(key);
    if (!e) { e = { year: r.year as number, month: r.month as number, agg: {} }; byM.set(key, e); }
    e.agg[r.line_key as string] = (e.agg[r.line_key as string] ?? 0) + Number(r.amount);
  }
  const K = 1000;
  const points = [...byM.entries()].map(([key, { year, month, agg }]) => {
    const gs = GFFC_CATEGORIES.reduce((s, x) => s + (agg[x.key] ?? 0), 0);
    const gi = gs - (agg.cogs ?? 0);
    const te = GFFC_EXPENSE_KEYS.reduce((s, k) => s + (agg[k] ?? 0), 0);
    return {
      label: `${TREND_MON[month - 1]} ${String(year).slice(2)}`,
      periodEnd: key,
      grossSales: gs / K,
      grossIncome: gi / K,
      totalExpense: te / K,
      netIncomeOps: (gi - te) / K,
    };
  });
  return points.sort((a, b) => a.periodEnd.localeCompare(b.periodEnd)).slice(-limit);
}

// ---- Expense Report (grouped controllable / uncontrollable) -----------------
interface ExpRow { year: number; month: number; account: string; section: string; controllable: boolean; amount: number }

// GFFC expense-section overrides are namespaced with a "GFFC:" prefix so they
// don't collide with the POLCAS overrides for a same-named account.
export const gffcOverrideKey = (account: string) => `GFFC:${account}`;

export async function fetchGffcExpenses(current: Period, prior?: Period): Promise<{ hasData: boolean; sections: ExpenseSection[] }> {
  const { years } = periodMonths(current);
  const py = prior ? periodMonths(prior).years : [];
  const grossOf = (agg: Record<string, number>) => GFFC_CATEGORIES.reduce((s, x) => s + (agg[x.key] ?? 0), 0);
  const [{ data }, overrides, curSum, priSum] = await Promise.all([
    supabase.from('gffc_monthly_expense').select('year, month, account, section, controllable, amount').in('year', [...new Set([...years, ...py])]),
    fetchExpenseSectionOverrides(),
    sumPeriod(current),
    prior ? sumPeriod(prior) : Promise.resolve({ agg: {}, hasData: false }),
  ]);
  const grossCur = grossOf(curSum.agg);
  const grossPri = grossOf(priSum.agg);
  const rows = (data ?? []) as ExpRow[];
  const inSet = (p?: Period) => new Set(p ? monthsInPeriod(p.start, p.end).map((x) => `${x.year}-${x.month}`) : []);
  const curSet = inSet(current), priSet = inSet(prior);

  const acc = new Map<string, { section: string; controllable: boolean; current: number; prior: number }>();
  for (const r of rows) {
    const key = r.account;
    if (!acc.has(key)) acc.set(key, { section: r.section, controllable: r.controllable, current: 0, prior: 0 });
    const e = acc.get(key)!;
    if (curSet.has(`${r.year}-${r.month}`)) e.current += Number(r.amount);
    if (priSet.has(`${r.year}-${r.month}`)) e.prior += Number(r.amount);
  }
  const all = [...acc.entries()].filter(([, v]) => v.current !== 0 || v.prior !== 0);

  const isSal = (account: string) => /salar|wage|13th\s*month/i.test(account);
  // Finance can reclassify Controllable ↔ Non-controllable; the override wins.
  const effCtrl = (account: string, base: boolean) => {
    const o = overrides.get(gffcOverrideKey(account).toUpperCase());
    return o ? o === 'controllable' : base;
  };

  const mkRow = (account: string, v: { section: string; controllable: boolean; current: number; prior: number }): ExpenseRow => ({
    account, section: effCtrl(account, v.controllable) ? 'controllable' : 'uncontrollable', groupName: v.section,
    current: v.current, prior: v.prior,
    currentPct: grossCur ? v.current / grossCur : 0, priorPct: grossPri ? v.prior / grossPri : 0,
    diff: v.current - v.prior, pctDiff: v.prior !== 0 ? (v.current - v.prior) / v.prior : 0,
  });
  const buildSec = (section: ExpenseSection['section'], filter: (a: string, v: { controllable: boolean }) => boolean): ExpenseSection => {
    const rowsOut = all.filter(([a, v]) => filter(a, v)).map(([a, v]) => mkRow(a, v)).sort((x, y) => Math.abs(y.current) - Math.abs(x.current));
    const total = rowsOut.reduce((s, r) => s + r.current, 0);
    const priorTotal = rowsOut.reduce((s, r) => s + r.prior, 0);
    return { section, total, priorTotal, pct: grossCur ? total / grossCur : 0, priorPct: grossPri ? priorTotal / grossPri : 0, rows: rowsOut };
  };

  const sections = [
    buildSec('salaries', (a) => isSal(a)),
    buildSec('controllable', (a, v) => !isSal(a) && effCtrl(a, v.controllable)),
    buildSec('uncontrollable', (a, v) => !isSal(a) && !effCtrl(a, v.controllable)),
  ].filter((s) => s.rows.length > 0);
  return { hasData: sections.length > 0, sections };
}

// ---- Sales by Qty -----------------------------------------------------------
interface SaleRow { year: number; month: number; item: string; uom: string; qty: number }

export async function fetchGffcSales(current: Period, prior?: Period): Promise<{ hasData: boolean; rows: SalesItemRow[] }> {
  const { years } = periodMonths(current);
  const py = prior ? periodMonths(prior).years : [];
  const { data } = await supabase.from('gffc_monthly_sales').select('year, month, item, uom, qty').in('year', [...new Set([...years, ...py])]);
  const rows = (data ?? []) as SaleRow[];
  const curSet = new Set(monthsInPeriod(current.start, current.end).map((x) => `${x.year}-${x.month}`));
  const priSet = new Set(prior ? monthsInPeriod(prior.start, prior.end).map((x) => `${x.year}-${x.month}`) : []);

  const items = new Map<string, { uom: string; current: number; prior: number }>();
  for (const r of rows) {
    if (!items.has(r.item)) items.set(r.item, { uom: r.uom, current: 0, prior: 0 });
    const e = items.get(r.item)!;
    if (r.uom && !e.uom) e.uom = r.uom;
    if (curSet.has(`${r.year}-${r.month}`)) e.current += Number(r.qty);
    if (priSet.has(`${r.year}-${r.month}`)) e.prior += Number(r.qty);
  }
  const out: SalesItemRow[] = [...items.entries()]
    .map(([item, v]) => ({ item, uom: v.uom, prior: v.prior, current: v.current, diff: v.current - v.prior, pctDiff: v.prior !== 0 ? (v.current - v.prior) / v.prior : 0 }))
    .filter((r) => r.current !== 0 || r.prior !== 0)
    .sort((a, b) => b.current - a.current);
  return { hasData: out.length > 0, rows: out };
}

// ---- Per-branch P&L (from the "P&L PER BRANCH" sheet) -----------------------

export interface GffcBranchResult {
  hasData: boolean;
  branches: string[]; // ordered branch tabs (Main Branch, Branch 2, …, Total)
  byBranch: Record<string, GffcPnlLine[]>; // per-branch comparison lines
}

const TOTAL = 'TOTAL';
// Branches Finance reads first; the rest follow alphabetically, Total last.
const BRANCH_ORDER = ['Main Branch', 'Branch 2'];

// Per-branch P&L, each as a current-vs-prior comparison (same shape as the GFFC
// Total P&L). Each branch's base lines are summed over the current and prior
// periods and the derived rows (Gross Income / Total Expense / Net Income)
// computed from them; a Total-of-all-branches tab is appended.
export async function fetchGffcBranchPnl(current: Period, prior?: Period): Promise<GffcBranchResult> {
  const curMonths = monthsInPeriod(current.start, current.end);
  const priMonths = prior ? monthsInPeriod(prior.start, prior.end) : [];
  const years = [...new Set([...curMonths, ...priMonths].map((x) => x.year))];
  const { data } = await supabase.from('gffc_branch_pnl').select('year, month, branch, line_key, amount').in('year', years);

  const curSet = new Set(curMonths.map((x) => `${x.year}-${x.month}`));
  const priSet = new Set(priMonths.map((x) => `${x.year}-${x.month}`));
  const cur: Record<string, Record<string, number>> = {};
  const pri: Record<string, Record<string, number>> = {};
  for (const r of data ?? []) {
    const mk = `${r.year}-${r.month}`;
    const b = r.branch as string, k = r.line_key as string, amt = Number(r.amount);
    if (curSet.has(mk)) (cur[b] ??= {})[k] = (cur[b]?.[k] ?? 0) + amt;
    if (priSet.has(mk)) (pri[b] ??= {})[k] = (pri[b]?.[k] ?? 0) + amt;
  }
  const real = [...new Set([...Object.keys(cur), ...Object.keys(pri)])];
  if (real.length === 0) return { hasData: false, branches: [], byBranch: {} };
  const rank = (b: string) => { const i = BRANCH_ORDER.indexOf(b); return i === -1 ? BRANCH_ORDER.length : i; };
  real.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

  // A branch's value for line k (TOTAL = sum of all real branches).
  const at = (m: Record<string, Record<string, number>>, b: string, k: string) =>
    b === TOTAL ? real.reduce((s, br) => s + (m[br]?.[k] ?? 0), 0) : m[b]?.[k] ?? 0;
  // Total Expense = the top-level groups. The salary sub-lines are display-only
  // detail (already inside "salaries"), so they are not part of this sum.
  const EXP = ['admin', 'finance', 'operations', 'mcp_ops', 'repairs', 'salaries'];
  // Salaries & Wages breakdown, several of them costs allocated to the branch.
  const SALARY_DETAIL: [string, string][] = [
    ['sal_sales_crew', 'Sales Crew'],
    ['sal_manager', 'Manager - allocated'],
    ['sal_finance', 'Finance/Acctng - allocated'],
    ['sal_mcp_butcher', 'MCP Butcher - allocated'],
    ['sal_calamanade', 'Calamanade Prod'],
  ];

  const buildLines = (b: string): GffcPnlLine[] => {
    const c = (k: string) => at(cur, b, k);
    const p = (k: string) => at(pri, b, k);
    const gsC = c('gross_sales'), gsP = p('gross_sales');
    const teC = EXP.reduce((s, k) => s + c(k), 0), teP = EXP.reduce((s, k) => s + p(k), 0);
    const giC = gsC - c('cogs'), giP = gsP - p('cogs');
    const netC = giC - teC + c('other_income'), netP = giP - teP + p('other_income');
    const L = (key: string, label: string, kind: GffcLineKind, current: number, prior: number, cost?: boolean, indent?: boolean): GffcPnlLine =>
      ({ key, label, kind, current, prior, cost, indent });
    // Salary sub-lines shown indented right under Salaries & Wages (skip empties).
    const salaryDetail = SALARY_DETAIL
      .map(([k, label]) => L(k, label, 'expense', c(k), p(k), true, true))
      .filter((l) => l.current !== 0 || l.prior !== 0);
    // Top-level expense groups auto-sorted biggest-first by current amount, with
    // each group's detail lines kept immediately after it.
    const expenseBlocks: { head: GffcPnlLine; detail: GffcPnlLine[] }[] = [
      { head: L('admin', 'Admin Expense', 'expense', c('admin'), p('admin'), true), detail: [] },
      { head: L('finance', 'Finance Expense', 'expense', c('finance'), p('finance'), true), detail: [] },
      { head: L('operations', 'Operations Expense', 'expense', c('operations'), p('operations'), true), detail: [] },
      { head: L('mcp_ops', 'MCP Ops Expense - allocated', 'expense', c('mcp_ops'), p('mcp_ops'), true), detail: [] },
      { head: L('repairs', 'Repairs/Maint. Expense', 'expense', c('repairs'), p('repairs'), true), detail: [] },
      { head: L('salaries', 'Salaries & Wages', 'expense', c('salaries'), p('salaries'), true), detail: salaryDetail },
    ].filter((blk) => blk.head.current !== 0 || blk.head.prior !== 0 || blk.detail.length > 0);
    expenseBlocks.sort((x, y) => y.head.current - x.head.current);
    const expenseLines = expenseBlocks.flatMap((blk) => [blk.head, ...blk.detail]);
    return [
      L('gross_sales', 'Gross Sales', 'gross', gsC, gsP),
      L('cogs', 'Cost of Goods Sold', 'cogs', c('cogs'), p('cogs'), true),
      L('gross_income', 'Gross Income', 'gross_income', giC, giP),
      ...expenseLines,
      L('total_expense', 'Total Expense', 'total', teC, teP, true),
      L('other_income', 'Other Income', 'other', c('other_income'), p('other_income')),
      L('net_income', 'Net Income', 'net', netC, netP),
      L('net_income_pct', 'Net Income %', 'pct', gsC ? netC / gsC : 0, gsP ? netP / gsP : 0),
    ];
  };

  const branches = [...real, TOTAL];
  const byBranch = Object.fromEntries(branches.map((b) => [b, buildLines(b)]));
  return { hasData: true, branches, byBranch };
}

// ---- GFFC Parameters (operational KPIs) ------------------------------------
import type { ParamRow } from '../params/paramQueries';

const GFFC_MANUAL_PARAMS = [
  { key: 'carcass_recovery', label: '% Carcass Recovery', pct: true, decimals: 1 },
  { key: 'mcp_recovery', label: '% MCP Recovery', pct: true, decimals: 1 },
  { key: 'mcp_kilos_per_manhr', label: 'MCP Kilos per Man-Hr', pct: false, decimals: 2 },
];

// Sales-by-QTY category name (as stored in gffc_monthly_sales.category) → GFFC
// P&L category key, for the auto average-selling-price rows.
const GFFC_CAT_PRICE = [
  { key: 'beef', label: 'Avg Selling Price — Beef Meat', re: /beef/i },
  { key: 'calamanade', label: 'Avg Selling Price — Calamanade', re: /calaman/i },
  { key: 'chicken', label: 'Avg Selling Price — Chicken Meat', re: /chicken/i },
  { key: 'dairy', label: 'Avg Selling Price — Dairy Products', re: /dairy/i },
  { key: 'frozen', label: 'Avg Selling Price — Frozen Items', re: /frozen/i },
  { key: 'fruits_veg', label: 'Avg Selling Price — Fruits & Vegetables', re: /fruit|veget/i },
  { key: 'grocery', label: 'Avg Selling Price — Grocery Items', re: /grocery/i },
  { key: 'highland', label: 'Avg Selling Price — Highland Lakatan', re: /lakatan|highland/i },
  { key: 'pork', label: 'Avg Selling Price — Pork Meat', re: /pork/i },
  { key: 'seafoods', label: 'Avg Selling Price — Seafoods', re: /seafood/i },
];

async function gffcCategoryQty(period: Period): Promise<Record<string, number>> {
  const months = monthsInPeriod(period.start, period.end);
  const years = [...new Set(months.map((x) => x.year))];
  const inSet = new Set(months.map((x) => `${x.year}-${x.month}`));
  const { data } = await supabase.from('gffc_monthly_sales').select('year, month, category, qty').in('year', years);
  const out: Record<string, number> = {};
  for (const r of data ?? []) {
    if (!inSet.has(`${r.year}-${r.month}`)) continue;
    const m = GFFC_CAT_PRICE.find((c) => c.re.test(String(r.category)));
    if (m) out[m.key] = (out[m.key] ?? 0) + Number(r.qty);
  }
  return out;
}

const daysInPeriod = (p: Period) => (new Date(p.end).getTime() - new Date(p.start).getTime()) / 86400000 + 1;

// GFFC Parameters: manual KPIs (per range) + auto average selling price per
// category (category sales ÷ qty) + auto average sales/day per branch.
export async function fetchGffcParameters(currentRangeId: string, priorRangeId: string | undefined, current: Period, prior?: Period): Promise<ParamRow[]> {
  const rangeIds = [currentRangeId, priorRangeId].filter((x): x is string => !!x);
  const [{ data: manual }, { data: stdRows }] = await Promise.all([
    supabase.from('bu_parameters').select('range_id, param_key, value').eq('bu_code', 'GFFC').in('range_id', rangeIds),
    supabase.from('bu_parameter_std').select('param_key, value').eq('bu_code', 'GFFC'),
  ]);
  const mval = (rid: string | undefined, key: string) => {
    const r = manual?.find((x) => x.range_id === rid && x.param_key === key);
    return r ? Number(r.value) : null;
  };
  const std = new Map((stdRows ?? []).map((r) => [r.param_key as string, Number(r.value)]));

  const rows: ParamRow[] = [];
  for (const m of GFFC_MANUAL_PARAMS) {
    rows.push({ key: m.key, label: m.label, std: std.has(m.key) ? std.get(m.key)! : null, prior: mval(priorRangeId, m.key), current: mval(currentRangeId, m.key), decimals: m.decimals, pct: m.pct, peso: false });
  }

  const [salesC, qtyC, salesP, qtyP] = await Promise.all([
    sumPeriod(current), gffcCategoryQty(current),
    prior ? sumPeriod(prior) : Promise.resolve({ agg: {} as Record<string, number>, hasData: false }),
    prior ? gffcCategoryQty(prior) : Promise.resolve({} as Record<string, number>),
  ]);
  const price = (sales: Record<string, number>, qty: Record<string, number>, key: string) => ((qty[key] ?? 0) !== 0 ? (sales[key] ?? 0) / qty[key] : null);
  for (const c of GFFC_CAT_PRICE) {
    const cur = price(salesC.agg, qtyC, c.key);
    const pri = prior ? price(salesP.agg, qtyP, c.key) : null;
    if (cur != null || pri != null) rows.push({ key: `price_${c.key}`, label: c.label, std: null, prior: pri, current: cur, decimals: 2, pct: false, peso: true });
  }

  const br = await fetchGffcBranchPnl(current, prior);
  const dC = daysInPeriod(current);
  const dP = prior ? daysInPeriod(prior) : 0;
  for (const b of br.branches) {
    if (b === TOTAL) continue; // per-branch only
    const gs = br.byBranch[b]?.find((l) => l.key === 'gross_sales');
    if (!gs) continue;
    rows.push({
      key: `salesday_${b}`, label: `Avg Sales/Day — ${b}`, std: null,
      prior: dP ? gs.prior / dP : null,
      current: dC ? gs.current / dC : null,
      decimals: 0, pct: false, peso: true,
    });
  }
  return rows;
}
