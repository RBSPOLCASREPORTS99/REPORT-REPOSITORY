import { supabase } from '../supabaseClient';
import { GFFC_CATEGORIES, GFFC_GROUPS, GFFC_EXPENSE_KEYS } from './gffcConfig';
import type { ExpenseSection, ExpenseRow, SalesItemRow } from '../queries';

// A date period (from a resolved comparison range) → the GFFC P&L summed over
// its months. GFFC values are full pesos.

export interface Period { start: string; end: string } // 'YYYY-MM-DD'

export type GffcLineKind = 'category' | 'gross' | 'cogs' | 'gross_income' | 'expense' | 'total' | 'net' | 'pct';
export interface GffcPnlLine {
  key: string;
  label: string;
  kind: GffcLineKind;
  current: number;
  prior: number;
  cost?: boolean; // expense/COGS line (an increase is unfavourable)
}
export interface GffcPnlResult {
  hasData: boolean;
  lines: GffcPnlLine[];
  net: number;
  priorNet: number;
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
  const p = prior ? await sumPeriod(prior) : { agg: {}, hasData: false };
  const cur = c.agg, pri = p.agg;

  const grossSales = (a: Record<string, number>) => GFFC_CATEGORIES.reduce((s, x) => s + (a[x.key] ?? 0), 0);
  const totalExpense = (a: Record<string, number>) => GFFC_EXPENSE_KEYS.reduce((s, k) => s + (a[k] ?? 0), 0);
  const grossIncome = (a: Record<string, number>) => grossSales(a) - (a.cogs ?? 0);
  const net = (a: Record<string, number>) => grossIncome(a) - totalExpense(a);

  const line = (key: string, label: string, kind: GffcLineKind, cf: (a: Record<string, number>) => number, cost?: boolean): GffcPnlLine =>
    ({ key, label, kind, current: cf(cur), prior: cf(pri), cost });

  const lines: GffcPnlLine[] = [
    ...GFFC_CATEGORIES.map((x) => line(x.key, x.label, 'category', (a) => a[x.key] ?? 0)),
    line('gross_sales', 'Gross Sales', 'gross', grossSales),
    line('cogs', 'Cost of Goods Sold', 'cogs', (a) => a.cogs ?? 0, true),
    line('gross_income', 'Gross Income', 'gross_income', grossIncome),
    ...GFFC_GROUPS.filter((g) => g.key !== 'cogs').map((g) => line(g.key, g.label, 'expense', (a) => a[g.key] ?? 0, true)),
    line('total_expense', 'Total Expense', 'total', totalExpense, true),
    line('net_income', 'Net Income', 'net', net),
    line('net_income_pct', 'Net Income %', 'pct', (a) => (grossSales(a) !== 0 ? net(a) / grossSales(a) : 0)),
  ];

  return { hasData: c.hasData, lines, net: net(cur), priorNet: net(pri) };
}

function periodMonths(p: Period) {
  return { months: monthsInPeriod(p.start, p.end), years: [...new Set(monthsInPeriod(p.start, p.end).map((x) => x.year))] };
}

// ---- Expense Report (grouped controllable / uncontrollable) -----------------
interface ExpRow { year: number; month: number; account: string; section: string; controllable: boolean; amount: number }

export async function fetchGffcExpenses(current: Period, prior?: Period): Promise<{ hasData: boolean; sections: ExpenseSection[] }> {
  const { years } = periodMonths(current);
  const py = prior ? periodMonths(prior).years : [];
  const { data } = await supabase.from('gffc_monthly_expense').select('year, month, account, section, controllable, amount').in('year', [...new Set([...years, ...py])]);
  const rows = (data ?? []) as ExpRow[];
  const inSet = (p?: Period) => new Set(p ? monthsInPeriod(p.start, p.end).map((x) => `${x.year}-${x.month}`) : []);
  const curSet = inSet(current), priSet = inSet(prior);

  // account -> {section, controllable, current, prior}
  const acc = new Map<string, { section: string; controllable: boolean; current: number; prior: number }>();
  for (const r of rows) {
    const key = r.account;
    if (!acc.has(key)) acc.set(key, { section: r.section, controllable: r.controllable, current: 0, prior: 0 });
    const e = acc.get(key)!;
    if (curSet.has(`${r.year}-${r.month}`)) e.current += Number(r.amount);
    if (priSet.has(`${r.year}-${r.month}`)) e.prior += Number(r.amount);
  }
  const all = [...acc.entries()].filter(([, v]) => v.current !== 0 || v.prior !== 0);
  const curTotal = all.reduce((s, [, v]) => s + v.current, 0);
  const priTotal = all.reduce((s, [, v]) => s + v.prior, 0);

  const build = (controllable: boolean): ExpenseSection => {
    const sectionKey: ExpenseSection['section'] = controllable ? 'controllable' : 'uncontrollable';
    const rowsOut: ExpenseRow[] = all
      .filter(([, v]) => v.controllable === controllable)
      .map(([account, v]) => ({
        account, section: sectionKey, groupName: v.section,
        current: v.current, prior: v.prior,
        currentPct: curTotal ? v.current / curTotal : 0, priorPct: priTotal ? v.prior / priTotal : 0,
        diff: v.current - v.prior, pctDiff: v.prior !== 0 ? (v.current - v.prior) / v.prior : 0,
      }))
      .sort((a, b) => Math.abs(b.current) - Math.abs(a.current));
    return {
      section: sectionKey,
      total: rowsOut.reduce((s, r) => s + r.current, 0),
      priorTotal: rowsOut.reduce((s, r) => s + r.prior, 0),
      rows: rowsOut,
    };
  };

  const sections = [build(true), build(false)].filter((s) => s.rows.length > 0);
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
