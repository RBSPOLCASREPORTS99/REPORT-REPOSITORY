import { supabase } from '../supabaseClient';
import { GFFC_CATEGORIES, GFFC_GROUPS, GFFC_EXPENSE_KEYS } from './gffcConfig';

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
