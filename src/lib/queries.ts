import { supabase } from './supabaseClient';
import { BUSINESS_UNITS, PNL_LINE_ITEMS } from './constants';
import { monthLabel } from './format';
import { TRUCKS } from './pnl/truckConfig';

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

// Gross sales for a BU in a range, in FULL pesos (computed_pnl stores thousands).
async function grossSalesFull(rangeId: string, buCode: string): Promise<number> {
  const { data, error } = await supabase
    .from('computed_pnl')
    .select('amount')
    .eq('range_id', rangeId)
    .eq('bu_code', buCode)
    .eq('line_item', 'gross_sales')
    .maybeSingle();
  if (error) throw error;
  return ((data?.amount as number) ?? 0) * 1000;
}

// Expense accounts for a BU in the current range (compared to a prior range),
// grouped by section and sorted largest-first. The % column is each account as
// a share of that period's GROSS SALES (expense ÷ gross sales).
export async function fetchBuExpenses(currentRangeId: string, priorRangeId: string | undefined, buCode: string): Promise<ExpenseSection[]> {
  const [cur, pri, grossCur, grossPri] = await Promise.all([
    expensesByAccount(currentRangeId, buCode),
    priorRangeId ? expensesByAccount(priorRangeId, buCode) : Promise.resolve(new Map<string, { amount: number; section: 'controllable' | 'uncontrollable'; groupName: string }>()),
    grossSalesFull(currentRangeId, buCode),
    priorRangeId ? grossSalesFull(priorRangeId, buCode) : Promise.resolve(0),
  ]);
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
      currentPct: grossCur !== 0 ? current / grossCur : 0,
      priorPct: grossPri !== 0 ? prior / grossPri : 0,
      diff: current - prior,
      pctDiff: prior !== 0 ? (current - prior) / prior : 0,
    };
  });

  const sections: ('controllable' | 'uncontrollable')[] = ['controllable', 'uncontrollable'];
  return sections
    .map((section) => {
      let secRows = rows.filter((r) => r.section === section);
      // Controllable: collapse every Salaries & Wages account into one total line.
      if (section === 'controllable') {
        const sal = secRows.filter((r) => /salar|wage/i.test(r.groupName));
        if (sal.length > 0) {
          const current = sal.reduce((s, r) => s + r.current, 0);
          const prior = sal.reduce((s, r) => s + r.prior, 0);
          secRows = secRows.filter((r) => !/salar|wage/i.test(r.groupName));
          secRows.push({
            account: 'Salaries & Wages',
            section, groupName: 'Salaries & Wages',
            current, prior,
            currentPct: grossCur !== 0 ? current / grossCur : 0,
            priorPct: grossPri !== 0 ? prior / grossPri : 0,
            diff: current - prior,
            pctDiff: prior !== 0 ? (current - prior) / prior : 0,
          });
        }
      }
      const sectionRows = secRows.sort((a, b) => b.current - a.current);
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

// Finance-set U/M overrides (item -> uom), applied on top of the imported unit.
// Tolerant of the table not existing yet (returns empty) so Sales never breaks.
export async function fetchItemUnits(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('item_units').select('item, uom');
  if (error) return new Map();
  return new Map((data ?? []).map((r) => [r.item as string, (r.uom as string) || '']));
}

// Quantity per item for a BU, comparing a current range vs a prior range,
// sorted largest-first by current quantity. U/M uses the Finance override when
// set, otherwise the unit carried in the import.
export async function fetchBuSales(currentRangeId: string, priorRangeId: string | undefined, buCode: string): Promise<SalesItemRow[]> {
  const [cur, pri, overrides] = await Promise.all([
    salesByItem(currentRangeId, buCode),
    priorRangeId ? salesByItem(priorRangeId, buCode) : Promise.resolve(new Map<string, { qty: number; uom: string }>()),
    fetchItemUnits(),
  ]);
  const items = new Set([...cur.keys(), ...pri.keys()]);
  return [...items]
    .map((item) => {
      const c = cur.get(item);
      const p = pri.get(item);
      const current = c?.qty ?? 0;
      const prior = p?.qty ?? 0;
      const uom = overrides.get(item) || c?.uom || p?.uom || '';
      return { item, uom, prior, current, diff: current - prior, pctDiff: prior !== 0 ? (current - prior) / prior : 0 };
    })
    .sort((a, b) => b.current - a.current);
}

// Distinct sales items across all ranges, with a representative imported unit,
// for the Finance "Item Units" editor.
export async function fetchSalesItems(): Promise<{ item: string; importedUom: string }[]> {
  const { data, error } = await supabase.from('sales_qty_lines').select('item, uom');
  if (error) throw error;
  const map = new Map<string, string>();
  for (const r of data ?? []) {
    const item = r.item as string;
    const uom = (r.uom as string) || '';
    if (!map.has(item) || (!map.get(item) && uom)) map.set(item, uom);
  }
  return [...map.entries()].map(([item, importedUom]) => ({ item, importedUom })).sort((a, b) => a.item.localeCompare(b.item));
}

export async function saveItemUnit(item: string, uom: string): Promise<void> {
  const { error } = await supabase.from('item_units').upsert({ item, uom: uom.trim(), updated_at: new Date().toISOString() }, { onConflict: 'item' });
  if (error) throw error;
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

// ---------------------------------------------------------------------------
// Business-unit display names ("BU01/02 - BODEGA 1 & 2").
// ---------------------------------------------------------------------------
export interface BuLabel {
  code: string;          // internal join key (e.g. BU0102)
  displayCode: string;   // shown code (e.g. BU01/02)
  name: string;          // proper name (e.g. Bodega 1 & 2)
  label: string;         // "BU01/02 - BODEGA 1 & 2" (upper-cased)
}

export async function fetchBuLabels(): Promise<Map<string, BuLabel>> {
  const { data, error } = await supabase
    .from('business_units')
    .select('code, name, display_code, is_profit_center, sort_order')
    .order('sort_order');
  if (error) throw error;
  const m = new Map<string, BuLabel>();
  for (const r of data ?? []) {
    const code = r.code as string;
    const displayCode = (r.display_code as string) || code;
    const name = (r.name as string) || code;
    m.set(code, { code, displayCode, name, label: `${displayCode} - ${name}`.toUpperCase() });
  }
  return m;
}

export async function saveBuName(code: string, displayCode: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('business_units')
    .update({ display_code: displayCode.trim() || null, name: name.trim() })
    .eq('code', code);
  if (error) throw error;
}

// Add a new business unit (Finance). It's flagged `auto_compute` so the next
// P&L import auto-reads its figures from the QuickBooks pivot by matching this
// code to its column ("BUxx - Name" / "Total BUxx - Name") — no code change.
export async function createBusinessUnit(code: string, displayCode: string, name: string): Promise<void> {
  const c = code.trim().toUpperCase().replace(/\s+/g, '');
  if (!c) throw new Error('Enter a code.');
  if (!name.trim()) throw new Error('Enter a name.');
  const { data: maxRow } = await supabase.from('business_units').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
  const sortOrder = ((maxRow?.sort_order as number) ?? 0) + 10;
  const { error } = await supabase.from('business_units').insert({
    code: c, name: name.trim(), display_code: displayCode.trim() || null,
    is_profit_center: true, sort_order: sortOrder, auto_compute: true,
  });
  if (error) throw error.code === '23505' ? new Error(`Code "${c}" already exists.`) : error;
}

// ---------------------------------------------------------------------------
// User management (Finance-only; enforced by RLS on allowed_users / _bus).
// ---------------------------------------------------------------------------
import type { AllowedUser, UserRole } from './types';

const normEmail = (e: string) => e.trim().toLowerCase();

export async function fetchAllowedUsers(): Promise<AllowedUser[]> {
  const [usersRes, busRes] = await Promise.all([
    supabase.from('allowed_users').select('email, role, full_name, registered_at').order('created_at'),
    supabase.from('allowed_user_bus').select('email, bu_code'),
  ]);
  if (usersRes.error) throw usersRes.error;
  if (busRes.error) throw busRes.error;
  const busByEmail = new Map<string, string[]>();
  for (const r of busRes.data ?? []) {
    const e = r.email as string;
    if (!busByEmail.has(e)) busByEmail.set(e, []);
    busByEmail.get(e)!.push(r.bu_code as string);
  }
  return (usersRes.data ?? []).map((u) => ({
    email: u.email as string,
    role: u.role as UserRole,
    full_name: (u.full_name as string) ?? null,
    registered_at: (u.registered_at as string) ?? null,
    bus: (busByEmail.get(u.email as string) ?? []).sort(
      (a, b) => (BU_SORT.get(a) ?? 99) - (BU_SORT.get(b) ?? 99),
    ),
  }));
}

// Add or update a user's authorization + designation. If the person has
// already registered, their live profile + BU access are updated too so the
// change takes effect immediately.
export async function saveAllowedUser(input: {
  email: string;
  role: UserRole;
  full_name: string | null;
  bus: string[];
}): Promise<void> {
  const email = normEmail(input.email);
  // bu scoping only applies to bu_head; finance/gm see everything.
  const bus = input.role === 'bu_head' ? input.bus : [];

  const up = await supabase
    .from('allowed_users')
    .upsert({ email, role: input.role, full_name: input.full_name }, { onConflict: 'email' })
    .select('user_id')
    .single();
  if (up.error) throw up.error;

  await supabase.from('allowed_user_bus').delete().eq('email', email);
  if (bus.length) {
    const ins = await supabase.from('allowed_user_bus').insert(bus.map((bu_code) => ({ email, bu_code })));
    if (ins.error) throw ins.error;
  }

  // Apply live to an already-registered user.
  const userId = (up.data as { user_id: string | null } | null)?.user_id ?? null;
  if (userId) {
    await supabase.from('profiles').update({ role: input.role, full_name: input.full_name }).eq('user_id', userId);
    await supabase.from('profile_bus').delete().eq('user_id', userId);
    if (bus.length) await supabase.from('profile_bus').insert(bus.map((bu_code) => ({ user_id: userId, bu_code })));
  }
}

// Revoke a user: removes them from the allowlist and strips their live BU
// access. (Their auth login still exists but they can no longer see any BU.)
export async function removeAllowedUser(email: string): Promise<void> {
  const e = normEmail(email);
  const existing = await supabase.from('allowed_users').select('user_id').eq('email', e).maybeSingle();
  if (existing.error) throw existing.error;
  const userId = (existing.data as { user_id: string | null } | null)?.user_id ?? null;
  const del = await supabase.from('allowed_users').delete().eq('email', e);
  if (del.error) throw del.error;
  if (userId) await supabase.from('profile_bus').delete().eq('user_id', userId);
}

// ---------------------------------------------------------------------------
// Simulated P&L per Truck (BU10). Income comes from the TRUCKING DASHBOARD
// (monthly_truck_income); expenses from the QB per-truck columns
// (monthly_truck_inputs). Shows the latest month with truck data vs the
// previous month — all figures in ₱'000.
// ---------------------------------------------------------------------------
// One P&L line for a single truck (or the fleet TOTAL): current + prior + %chg.
export type TruckLineKind = 'income' | 'account' | 'subtotal' | 'gross' | 'total' | 'net';
export interface TruckPnlLine {
  label: string;
  kind: TruckLineKind;
  current: number;
  prior: number;
  chg: number;
  cost?: boolean; // expense line (an increase is unfavourable)
}
export interface TruckPnlResult {
  hasData: boolean;
  currentLabel: string;
  priorLabel: string;
  trucks: string[];                    // truck codes present (selector); '' excluded
  pnl: Record<string, TruckPnlLine[]>; // truck_code | 'TOTAL' -> ordered lines
  net: number;                         // fleet Net Income (for the Home card)
  priorNet: number;
  netChg: number;
}

interface TruckExpenseRow { month_id: string; truck_code: string; section: string; account: string; amount: number }

// Expense sections that sit under Total Expense (COGS is handled above Gross Profit).
const EXPENSE_SECTIONS = ['Admin Expenses', 'Finance Expenses', 'Operations Expenses', 'Repairs/Maintenance', 'Salaries and Wages'];
const chgOf = (cur: number, prior: number) => (prior !== 0 ? (cur - prior) / Math.abs(prior) : 0);

// `target` picks the current month (prior = the previous imported month); when
// omitted, uses the latest month that has truck income. All figures in ₱'000.
export async function fetchTruckPnl(target?: { year: number; month: number }): Promise<TruckPnlResult> {
  const empty: TruckPnlResult = { hasData: false, currentLabel: '', priorLabel: '', trucks: [], pnl: {}, net: 0, priorNet: 0, netChg: 0 };
  const { data: months } = await supabase.from('pnl_months').select('id, year, month');
  if (!months || months.length === 0) return empty;
  const sorted = [...months].sort((a, b) => a.year - b.year || a.month - b.month) as { id: string; year: number; month: number }[];

  const { data: incomeAll } = await supabase.from('monthly_truck_income').select('month_id, truck_code, income');
  const incomeRows = (incomeAll ?? []) as { month_id: string; truck_code: string; income: number }[];
  const withData = new Set(incomeRows.map((r) => r.month_id));

  let curIdx = -1;
  if (target) curIdx = sorted.findIndex((m) => m.year === target.year && m.month === target.month);
  else for (let i = sorted.length - 1; i >= 0; i--) if (withData.has(sorted[i].id)) { curIdx = i; break; }
  if (curIdx === -1) return empty;
  const cur = sorted[curIdx];
  const prior = curIdx > 0 ? sorted[curIdx - 1] : null;
  const ids = prior ? [cur.id, prior.id] : [cur.id];

  const { data: expAll } = await supabase.from('monthly_truck_expense').select('*').in('month_id', ids);
  const expRows = (expAll ?? []) as TruckExpenseRow[];

  const income = (monthId: string, code: string) => incomeRows.find((x) => x.month_id === monthId && x.truck_code === code)?.income ?? 0;
  // code|section -> account -> amount, for one month.
  const acctMap = (monthId: string) => {
    const m = new Map<string, Map<string, number>>();
    for (const r of expRows.filter((x) => x.month_id === monthId)) {
      const key = `${r.truck_code}|${r.section}`;
      if (!m.has(key)) m.set(key, new Map());
      const inner = m.get(key)!;
      inner.set(r.account, (inner.get(r.account) ?? 0) + r.amount);
    }
    return m;
  };
  const curAcc = acctMap(cur.id);
  const priAcc = prior ? acctMap(prior.id) : new Map<string, Map<string, number>>();

  const truckCodes = TRUCKS.map((t) => t.code).filter((code) => {
    if (income(cur.id, code)) return true;
    return expRows.some((r) => r.month_id === cur.id && r.truck_code === code);
  });
  if (truckCodes.length === 0) return { ...empty, currentLabel: monthLabel(cur.year, cur.month) };

  // Accounts of a section summed across the given codes: [{account, current, prior}] biggest first.
  const sectionAccounts = (codes: string[], section: string) => {
    const cur2 = new Map<string, number>(), pri2 = new Map<string, number>();
    for (const c of codes) {
      for (const [a, v] of curAcc.get(`${c}|${section}`) ?? []) cur2.set(a, (cur2.get(a) ?? 0) + v);
      for (const [a, v] of priAcc.get(`${c}|${section}`) ?? []) pri2.set(a, (pri2.get(a) ?? 0) + v);
    }
    return [...new Set([...cur2.keys(), ...pri2.keys()])]
      .map((a) => ({ account: a, current: cur2.get(a) ?? 0, prior: pri2.get(a) ?? 0 }))
      .sort((x, y) => Math.abs(y.current) - Math.abs(x.current));
  };

  const buildLines = (codes: string[]): TruckPnlLine[] => {
    const lines: TruckPnlLine[] = [];
    const incC = codes.reduce((s, c) => s + income(cur.id, c), 0);
    const incP = prior ? codes.reduce((s, c) => s + income(prior.id, c), 0) : 0;
    lines.push({ label: 'Trucking Income', kind: 'income', current: incC, prior: incP, chg: chgOf(incC, incP) });

    const cogs = sectionAccounts(codes, 'Cost of Goods Sold');
    const cogsC = cogs.reduce((s, a) => s + a.current, 0), cogsP = cogs.reduce((s, a) => s + a.prior, 0);
    if (cogs.length) {
      for (const a of cogs) lines.push({ label: a.account, kind: 'account', current: a.current, prior: a.prior, chg: chgOf(a.current, a.prior), cost: true });
      lines.push({ label: 'Total Cost of Goods Sold', kind: 'subtotal', current: cogsC, prior: cogsP, chg: chgOf(cogsC, cogsP), cost: true });
    }
    const grossC = incC - cogsC, grossP = incP - cogsP;
    lines.push({ label: 'Gross Profit', kind: 'gross', current: grossC, prior: grossP, chg: chgOf(grossC, grossP) });

    let expC = 0, expP = 0;
    for (const section of EXPENSE_SECTIONS) {
      const accts = sectionAccounts(codes, section);
      const secC = accts.reduce((s, a) => s + a.current, 0), secP = accts.reduce((s, a) => s + a.prior, 0);
      if (!accts.length) continue;
      for (const a of accts) lines.push({ label: a.account, kind: 'account', current: a.current, prior: a.prior, chg: chgOf(a.current, a.prior), cost: true });
      lines.push({ label: `Total ${section}`, kind: 'subtotal', current: secC, prior: secP, chg: chgOf(secC, secP), cost: true });
      expC += secC; expP += secP;
    }
    lines.push({ label: 'Total Expense', kind: 'total', current: expC, prior: expP, chg: chgOf(expC, expP), cost: true });
    const netC = grossC - expC, netP = grossP - expP;
    lines.push({ label: 'Net Income', kind: 'net', current: netC, prior: netP, chg: chgOf(netC, netP) });
    return lines;
  };

  const pnl: Record<string, TruckPnlLine[]> = { TOTAL: buildLines(truckCodes) };
  for (const code of truckCodes) pnl[code] = buildLines([code]);

  const netLine = pnl.TOTAL.find((l) => l.kind === 'net')!;
  return {
    hasData: true,
    currentLabel: monthLabel(cur.year, cur.month),
    priorLabel: prior ? monthLabel(prior.year, prior.month) : '—',
    trucks: truckCodes,
    pnl,
    net: netLine.current,
    priorNet: netLine.prior,
    netChg: netLine.chg,
  };
}
