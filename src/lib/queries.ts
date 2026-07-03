import { supabase } from './supabaseClient';
import { BUSINESS_UNITS, PNL_LINE_ITEMS } from './constants';

const BU_SORT = new Map(BUSINESS_UNITS.map((bu, i) => [bu.code, i]));
const LINE_ORDER = new Map(PNL_LINE_ITEMS.map((item, i) => [item.key, i]));
const LINE_LABEL = new Map(PNL_LINE_ITEMS.map((item) => [item.key, item.label]));
const PCT_KEYS = new Set(['net_income_ops_pct', 'net_income_pct']);

export interface RangeRow {
  id: string;
  label: string;
  kind: 'month' | 'ytd' | 'quarter' | 'half' | 'year' | 'range';
  period_start: string;
  period_end: string;
  is_published: boolean;
}

// RLS scopes visibility (finance: all; bu_head/gm: published). Newest first.
export async function fetchRanges(): Promise<RangeRow[]> {
  const { data, error } = await supabase
    .from('report_ranges')
    .select('id, label, kind, period_start, period_end, is_published')
    .order('period_end', { ascending: false })
    .order('period_start', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Publish / unpublish a range. Publishing makes its computed P&L visible to
// BU Heads and the GM (RLS keys viewer access off report_ranges.is_published).
export async function setRangePublished(rangeId: string, isPublished: boolean): Promise<void> {
  const { error } = await supabase.from('report_ranges').update({ is_published: isPublished }).eq('id', rangeId);
  if (error) throw error;
}

export type AllocMethod = 'gross_sales' | 'revenue' | 'per_txn';
export const ALLOC_METHOD_LABELS: Record<AllocMethod, string> = {
  gross_sales: 'Gross Sales',
  revenue: '% Revenue',
  per_txn: 'Per Transaction',
};

interface SupportOverride { finance: number; hr: number; mancom: number }

// Imported alternative-method support allocations for a range, keyed by BU.
// Empty for the default gross-sales method (which lives in computed_pnl).
async function supportByBu(rangeId: string, method: AllocMethod): Promise<Map<string, SupportOverride>> {
  if (method === 'gross_sales') return new Map();
  const { data, error } = await supabase
    .from('support_sim')
    .select('bu_code, center, amount')
    .eq('range_id', rangeId)
    .eq('method', method);
  if (error) throw error;
  const m = new Map<string, SupportOverride>();
  for (const r of data ?? []) {
    const bu = r.bu_code as string;
    if (!m.has(bu)) m.set(bu, { finance: 0, hr: 0, mancom: 0 });
    (m.get(bu)! as unknown as Record<string, number>)[r.center as string] = r.amount as number;
  }
  return m;
}

// Which report_ranges have any imported support allocations (→ toggle enabled).
export async function rangesWithSupport(): Promise<Set<string>> {
  const { data, error } = await supabase.from('support_sim').select('range_id');
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.range_id as string));
}

async function netIncomeByBu(rangeId: string, method: AllocMethod = 'gross_sales'): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('computed_pnl')
    .select('bu_code, line_item, amount')
    .eq('range_id', rangeId)
    .in('line_item', ['net_income', 'total_support_centers']);
  if (error) throw error;
  const net = new Map<string, number>();
  const support = new Map<string, number>();
  for (const r of data ?? []) {
    if (r.line_item === 'net_income') net.set(r.bu_code as string, r.amount as number);
    else support.set(r.bu_code as string, r.amount as number);
  }
  if (method !== 'gross_sales') {
    // Net Income shifts by (old support − new support); ops & allocated are unchanged.
    const ov = await supportByBu(rangeId, method);
    for (const [bu, o] of ov) {
      const newSupport = o.finance + o.hr + o.mancom;
      const oldNet = net.get(bu) ?? 0;
      const oldSupport = support.get(bu) ?? 0;
      net.set(bu, oldNet + oldSupport - newSupport);
    }
  }
  return net;
}

export interface BuCardData {
  buCode: string;
  buName: string;
  netIncome: number;
  diff: number;
  pctDiff: number;
}

export async function fetchBuCards(currentRangeId: string, priorRangeId?: string, method: AllocMethod = 'gross_sales'): Promise<BuCardData[]> {
  const nameByCode = new Map(BUSINESS_UNITS.map((bu) => [bu.code, bu.name]));
  const [cur, pri] = await Promise.all([
    netIncomeByBu(currentRangeId, method),
    priorRangeId ? netIncomeByBu(priorRangeId, method) : Promise.resolve(new Map<string, number>()),
  ]);
  return [...cur.entries()]
    .map(([buCode, netIncome]) => {
      const prior = pri.get(buCode) ?? 0;
      return {
        buCode,
        buName: nameByCode.get(buCode) ?? buCode,
        netIncome,
        diff: netIncome - prior,
        pctDiff: prior !== 0 ? (netIncome - prior) / prior : 0,
      };
    })
    .sort((a, b) => (BU_SORT.get(a.buCode) ?? 999) - (BU_SORT.get(b.buCode) ?? 999));
}

export interface ComparisonLine {
  key: string;
  label: string;
  prior: number;
  current: number;
  priorPct: number;
  currentPct: number;
  diff: number;
  pctDiff: number;
  isPct: boolean;
}

async function sideByLine(rangeId: string, buCode: string, method: AllocMethod): Promise<Map<string, { amount: number; pct: number }>> {
  const { data, error } = await supabase
    .from('computed_pnl')
    .select('line_item, amount, pct_of_sales')
    .eq('range_id', rangeId)
    .eq('bu_code', buCode);
  if (error) throw error;
  const side = new Map((data ?? []).map((r) => [r.line_item as string, { amount: r.amount as number, pct: r.pct_of_sales as number }]));

  if (method !== 'gross_sales') {
    const ov = (await supportByBu(rangeId, method)).get(buCode);
    if (ov) {
      const gs = side.get('gross_sales')?.amount ?? 0;
      const pct = (v: number) => (gs !== 0 ? v / gs : 0);
      side.set('support_finance', { amount: ov.finance, pct: pct(ov.finance) });
      side.set('support_hr', { amount: ov.hr, pct: pct(ov.hr) });
      side.set('support_management', { amount: ov.mancom, pct: pct(ov.mancom) });
      const newSupport = ov.finance + ov.hr + ov.mancom;
      const oldSupport = side.get('total_support_centers')?.amount ?? 0;
      side.set('total_support_centers', { amount: newSupport, pct: pct(newSupport) });
      const newNet = (side.get('net_income')?.amount ?? 0) + oldSupport - newSupport;
      side.set('net_income', { amount: newNet, pct: pct(newNet) });
      side.set('net_income_pct', { amount: gs !== 0 ? newNet / gs : 0, pct: 0 });
    }
  }
  return side;
}

// Compare a BU across two ranges → ordered comparison lines.
export async function fetchBuComparison(currentRangeId: string, priorRangeId: string | undefined, buCode: string, method: AllocMethod = 'gross_sales'): Promise<ComparisonLine[]> {
  const [cur, pri] = await Promise.all([
    sideByLine(currentRangeId, buCode, method),
    priorRangeId ? sideByLine(priorRangeId, buCode, method) : Promise.resolve(new Map<string, { amount: number; pct: number }>()),
  ]);
  const keys = new Set([...cur.keys(), ...pri.keys()]);
  return [...keys]
    .map((key) => {
      const c = cur.get(key) ?? { amount: 0, pct: 0 };
      const p = pri.get(key) ?? { amount: 0, pct: 0 };
      const isPct = PCT_KEYS.has(key);
      return {
        key,
        label: LINE_LABEL.get(key) ?? key,
        prior: p.amount,
        current: c.amount,
        priorPct: p.pct,
        currentPct: c.pct,
        diff: isPct ? 0 : c.amount - p.amount,
        pctDiff: isPct ? 0 : p.amount !== 0 ? (c.amount - p.amount) / p.amount : 0,
        isPct,
      };
    })
    .sort((a, b) => (LINE_ORDER.get(a.key) ?? 999) - (LINE_ORDER.get(b.key) ?? 999));
}

export interface ExpenseRow {
  account: string;
  section: 'controllable' | 'uncontrollable';
  groupName: string;
  current: number;
  prior: number;
  currentPct: number; // share of current grand total
  priorPct: number;   // share of prior grand total
  diff: number;
  pctDiff: number;
}

export interface ExpenseSection {
  section: 'controllable' | 'uncontrollable';
  total: number;      // current section total
  priorTotal: number;
  rows: ExpenseRow[];
}

async function expensesByAccount(rangeId: string, buCode: string): Promise<Map<string, { amount: number; section: 'controllable' | 'uncontrollable'; groupName: string }>> {
  const { data, error } = await supabase
    .from('expense_lines')
    .select('account, section, group_name, amount')
    .eq('range_id', rangeId)
    .eq('bu_code', buCode);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.account as string, {
    amount: r.amount as number, section: r.section as 'controllable' | 'uncontrollable', groupName: r.group_name as string,
  }]));
}

// Expense accounts for a BU in the current range (compared to a prior range),
// grouped by section and sorted largest-first, with share of the grand total.
export async function fetchBuExpenses(currentRangeId: string, priorRangeId: string | undefined, buCode: string): Promise<ExpenseSection[]> {
  const [cur, pri] = await Promise.all([
    expensesByAccount(currentRangeId, buCode),
    priorRangeId ? expensesByAccount(priorRangeId, buCode) : Promise.resolve(new Map<string, { amount: number; section: 'controllable' | 'uncontrollable'; groupName: string }>()),
  ]);
  const grandCur = [...cur.values()].reduce((s, r) => s + r.amount, 0);
  const grandPri = [...pri.values()].reduce((s, r) => s + r.amount, 0);
  const accounts = new Set([...cur.keys(), ...pri.keys()]);

  const rows: ExpenseRow[] = [...accounts].map((account) => {
    const c = cur.get(account);
    const p = pri.get(account);
    const current = c?.amount ?? 0;
    const prior = p?.amount ?? 0;
    return {
      account,
      section: c?.section ?? p?.section ?? 'controllable',
      groupName: c?.groupName ?? p?.groupName ?? '',
      current,
      prior,
      currentPct: grandCur !== 0 ? current / grandCur : 0,
      priorPct: grandPri !== 0 ? prior / grandPri : 0,
      diff: current - prior,
      pctDiff: prior !== 0 ? (current - prior) / prior : 0,
    };
  });

  const sections: ('controllable' | 'uncontrollable')[] = ['controllable', 'uncontrollable'];
  return sections
    .map((section) => {
      const sectionRows = rows.filter((r) => r.section === section).sort((a, b) => b.current - a.current);
      return {
        section,
        total: sectionRows.reduce((s, r) => s + r.current, 0),
        priorTotal: sectionRows.reduce((s, r) => s + r.prior, 0),
        rows: sectionRows,
      };
    })
    .filter((s) => s.rows.length > 0);
}

// Which ranges have any imported expense detail (→ Expenses tab enabled).
export async function rangesWithExpenses(): Promise<Set<string>> {
  const { data, error } = await supabase.from('expense_lines').select('range_id');
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.range_id as string));
}

export interface SalesItemRow {
  item: string;
  uom: string;
  prior: number;
  current: number;
  diff: number;
  pctDiff: number;
}

async function salesByItem(rangeId: string, buCode: string): Promise<Map<string, { qty: number; uom: string }>> {
  const { data, error } = await supabase
    .from('sales_qty_lines').select('item, uom, qty').eq('range_id', rangeId).eq('bu_code', buCode);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.item as string, { qty: r.qty as number, uom: r.uom as string }]));
}

// Quantity per item for a BU, comparing a current range vs a prior range,
// sorted largest-first by current quantity.
export async function fetchBuSales(currentRangeId: string, priorRangeId: string | undefined, buCode: string): Promise<SalesItemRow[]> {
  const [cur, pri] = await Promise.all([
    salesByItem(currentRangeId, buCode),
    priorRangeId ? salesByItem(priorRangeId, buCode) : Promise.resolve(new Map<string, { qty: number; uom: string }>()),
  ]);
  const items = new Set([...cur.keys(), ...pri.keys()]);
  return [...items]
    .map((item) => {
      const c = cur.get(item);
      const p = pri.get(item);
      const current = c?.qty ?? 0;
      const prior = p?.qty ?? 0;
      return { item, uom: c?.uom ?? p?.uom ?? '', prior, current, diff: current - prior, pctDiff: prior !== 0 ? (current - prior) / prior : 0 };
    })
    .sort((a, b) => b.current - a.current);
}

// Which ranges have imported sales-quantity detail (→ Sales tab enabled).
export async function rangesWithSales(): Promise<Set<string>> {
  const { data, error } = await supabase.from('sales_qty_lines').select('range_id');
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.range_id as string));
}

export interface TrendPoint {
  label: string;
  periodEnd: string;
  grossSales: number;
  grossIncome: number;
  netIncome: number;
}

// Trend across month ranges (standalone monthly figures) for a BU.
export async function fetchTrend(buCode: string, limit = 12): Promise<TrendPoint[]> {
  const { data, error } = await supabase
    .from('computed_pnl')
    .select('amount, line_item, report_ranges!inner(label, kind, period_end)')
    .eq('bu_code', buCode)
    .in('line_item', ['gross_sales', 'gross_income', 'net_income']);
  if (error) throw error;

  const byRange = new Map<string, TrendPoint>();
  for (const row of (data ?? []) as unknown as { amount: number; line_item: string; report_ranges: { label: string; kind: string; period_end: string } }[]) {
    if (row.report_ranges.kind !== 'month') continue;
    const k = row.report_ranges.period_end;
    if (!byRange.has(k)) {
      byRange.set(k, { label: row.report_ranges.label, periodEnd: k, grossSales: 0, grossIncome: 0, netIncome: 0 });
    }
    const pt = byRange.get(k)!;
    if (row.line_item === 'gross_sales') pt.grossSales = row.amount;
    if (row.line_item === 'gross_income') pt.grossIncome = row.amount;
    if (row.line_item === 'net_income') pt.netIncome = row.amount;
  }
  return [...byRange.values()].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd)).slice(-limit);
}
