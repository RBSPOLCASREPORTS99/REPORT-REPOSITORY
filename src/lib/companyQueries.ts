import { supabase } from './supabaseClient';
import { PNL_LINE_ITEMS } from './constants';
import type { ComparisonLine } from './queries';

// Company-wide Total P&L for POLCAS AGRI TRADE CORP. (PCAC): the QuickBooks
// grand-total column summed over a period's months. Same P&L shape as the BUs
// (reuses PnlTable / ComparisonLine), but with no allocations.

export interface CompanyPeriod { start: string; end: string } // 'YYYY-MM-DD'

export const PCAC_LABEL = 'POLCAS AGRI TRADE CORP.';

const LABEL = new Map(PNL_LINE_ITEMS.map((i) => [i.key, i.label]));

interface CompanyInputs {
  gross_sales: number; cogs: number;
  admin_expense: number; discounting_expense: number; operations_expense: number;
  repairs_expense: number; salaries_expense: number; other_income: number;
}
const FIELDS: (keyof CompanyInputs)[] = ['gross_sales', 'cogs', 'admin_expense', 'discounting_expense', 'operations_expense', 'repairs_expense', 'salaries_expense', 'other_income'];
const ZERO: CompanyInputs = { gross_sales: 0, cogs: 0, admin_expense: 0, discounting_expense: 0, operations_expense: 0, repairs_expense: 0, salaries_expense: 0, other_income: 0 };

function monthsInPeriod(start: string, end: string): { year: number; month: number }[] {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const out: { year: number; month: number }[] = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) { out.push({ year: y, month: m }); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

const totalExpense = (x: CompanyInputs) => x.admin_expense + x.discounting_expense + x.operations_expense + x.repairs_expense + x.salaries_expense;
const netIncome = (x: CompanyInputs) => x.gross_sales - x.cogs - totalExpense(x) + x.other_income;

// Sum the company P&L over a period. Returns null when no company data exists
// for the period (so the card / page can hide it or show an empty state).
async function sumPeriod(period: CompanyPeriod): Promise<CompanyInputs | null> {
  const want = new Set(monthsInPeriod(period.start, period.end).map((x) => `${x.year}-${x.month}`));
  const { data: pm } = await supabase.from('pnl_months').select('id, year, month');
  const ids = (pm ?? []).filter((r) => want.has(`${r.year}-${r.month}`)).map((r) => r.id as string);
  if (ids.length === 0) return null;
  const { data } = await supabase.from('monthly_company_pnl').select('*').in('month_id', ids);
  if (!data || data.length === 0) return null;
  const agg = { ...ZERO };
  for (const r of data) for (const f of FIELDS) agg[f] += Number(r[f]) || 0;
  return agg;
}

export async function fetchCompanyPnl(current: CompanyPeriod, prior?: CompanyPeriod): Promise<{ hasData: boolean; lines: ComparisonLine[]; net: number; priorNet: number }> {
  const [cur, pri] = await Promise.all([sumPeriod(current), prior ? sumPeriod(prior) : Promise.resolve(null)]);
  if (!cur) return { hasData: false, lines: [], net: 0, priorNet: 0 };
  const p = pri ?? ZERO;

  const gsC = cur.gross_sales, gsP = p.gross_sales;
  const line = (key: string, c: number, pr: number, isPct = false): ComparisonLine => ({
    key,
    label: LABEL.get(key) ?? key,
    prior: pr,
    current: c,
    priorPct: isPct ? 0 : gsP !== 0 ? pr / gsP : 0,
    currentPct: isPct ? 0 : gsC !== 0 ? c / gsC : 0,
    diff: isPct ? 0 : c - pr,
    pctDiff: isPct ? 0 : pr !== 0 ? (c - pr) / pr : 0,
    isPct,
  });

  const giC = cur.gross_sales - cur.cogs, giP = p.gross_sales - p.cogs;
  const teC = totalExpense(cur), teP = totalExpense(p);
  const netC = netIncome(cur), netP = netIncome(p);

  const lines: ComparisonLine[] = [
    line('gross_sales', cur.gross_sales, p.gross_sales),
    line('cogs', cur.cogs, p.cogs),
    line('gross_income', giC, giP),
    line('admin_expense', cur.admin_expense, p.admin_expense),
    line('discounting_expense', cur.discounting_expense, p.discounting_expense),
    line('operations_expense', cur.operations_expense, p.operations_expense),
    line('repairs_expense', cur.repairs_expense, p.repairs_expense),
    line('salaries_expense', cur.salaries_expense, p.salaries_expense),
    line('total_expense', teC, teP),
    line('other_income', cur.other_income, p.other_income),
    line('net_income', netC, netP),
    line('net_income_pct', gsC !== 0 ? netC / gsC : 0, gsP !== 0 ? netP / gsP : 0, true),
  ];
  return { hasData: true, lines, net: netC, priorNet: netP };
}
