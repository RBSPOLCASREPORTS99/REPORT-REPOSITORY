import type { SupabaseClient } from '@supabase/supabase-js';
import { TRUCKING_CODES, type BuConfig } from './buConfig';
import { loadBuConfigs } from './loadBuConfigs';
import { computeFromInputs, type BuInputs, type PoolInputs } from './computeBuPnl';
import { PNL_LINE_ITEMS, COGS_VARIANCE_LABELS } from '../constants';
import { monthLabel } from '../format';

// deriveRanges takes the Supabase client explicitly so both the app (anon +
// session) and offline scripts (service key) can run it without importing the
// browser-only supabaseClient (which reads import.meta.env).
type Db = SupabaseClient;

// Derive every report_range for a year from its imported monthly inputs, by
// summing the months in each range and recomputing the allocation on the totals
// (which reproduces Excel's YTD/quarter figures). Materializes report_ranges +
// computed_pnl. Re-run after any month of the year is imported or updated.

interface MonthData {
  year: number;
  month: number;
  inputs: Map<string, BuInputs>; // bu_code -> raw lines
  variance: Map<string, number>; // bu_code -> COGS "Reclass or Adjusted Variance" (₱ '000)
  pools: PoolInputs;
  trucking: Record<string, number>; // code -> amount
}


const ZERO_BU: BuInputs = {
  gross_sales: 0, cogs: 0, admin_expense: 0, discounting_expense: 0,
  operations_expense: 0, repairs_expense: 0, salaries_expense: 0, other_income: 0,
};
const ZERO_POOLS: PoolInputs = {
  company_gross_sales: 0, admin_pool: 0, cost_money_pool: 0, finance_pool: 0, hr_pool: 0, mancom_pool: 0, bu10_truck_total: 0,
};
const PCT_KEYS = new Set(['net_income_ops_pct', 'net_income_pct']);
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
const firstDay = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-01`;

async function loadYearMonths(db: Db, year: number): Promise<MonthData[]> {
  const { data: months } = await db.from('pnl_months').select('id, year, month').eq('year', year);
  const out: MonthData[] = [];
  for (const m of months ?? []) {
    const [{ data: inputs }, { data: pool }, { data: truck }] = await Promise.all([
      db.from('monthly_pnl_inputs').select('*').eq('month_id', m.id),
      db.from('monthly_pnl_pools').select('*').eq('month_id', m.id).maybeSingle(),
      db.from('monthly_trucking').select('trucking_code, amount').eq('month_id', m.id),
    ]);
    const inputMap = new Map<string, BuInputs>();
    const varMap = new Map<string, number>();
    for (const r of inputs ?? []) {
      inputMap.set(r.bu_code as string, {
        gross_sales: r.gross_sales, cogs: r.cogs, admin_expense: r.admin_expense,
        discounting_expense: r.discounting_expense, operations_expense: r.operations_expense,
        repairs_expense: r.repairs_expense, salaries_expense: r.salaries_expense, other_income: r.other_income,
      });
      varMap.set(r.bu_code as string, (r.cogs_variance as number) ?? 0);
    }
    const trucking: Record<string, number> = {};
    for (const t of truck ?? []) trucking[t.trucking_code as string] = t.amount as number;
    out.push({
      year: m.year, month: m.month, inputs: inputMap, variance: varMap,
      pools: pool ? {
        company_gross_sales: pool.company_gross_sales, admin_pool: pool.admin_pool, cost_money_pool: pool.cost_money_pool,
        finance_pool: pool.finance_pool, hr_pool: pool.hr_pool, mancom_pool: pool.mancom_pool, bu10_truck_total: pool.bu10_truck_total,
      } : { ...ZERO_POOLS },
      trucking,
    });
  }
  return out.sort((a, b) => a.month - b.month);
}

function addBu(a: BuInputs, b: BuInputs): BuInputs {
  return {
    gross_sales: a.gross_sales + b.gross_sales, cogs: a.cogs + b.cogs, admin_expense: a.admin_expense + b.admin_expense,
    discounting_expense: a.discounting_expense + b.discounting_expense, operations_expense: a.operations_expense + b.operations_expense,
    repairs_expense: a.repairs_expense + b.repairs_expense, salaries_expense: a.salaries_expense + b.salaries_expense,
    other_income: a.other_income + b.other_income,
  };
}
function addPools(a: PoolInputs, b: PoolInputs): PoolInputs {
  return {
    company_gross_sales: a.company_gross_sales + b.company_gross_sales, admin_pool: a.admin_pool + b.admin_pool,
    cost_money_pool: a.cost_money_pool + b.cost_money_pool, finance_pool: a.finance_pool + b.finance_pool,
    hr_pool: a.hr_pool + b.hr_pool, mancom_pool: a.mancom_pool + b.mancom_pool, bu10_truck_total: a.bu10_truck_total + b.bu10_truck_total,
  };
}

// Sum a set of months and materialize a report_range + its computed_pnl.
async function materializeRange(
  db: Db,
  configs: BuConfig[],
  months: MonthData[],
  kind: 'month' | 'ytd' | 'quarter',
  label: string,
  periodStart: string,
  periodEnd: string,
) {
  // Sum inputs, pools, trucking across the months.
  const pools = months.reduce((acc, m) => addPools(acc, m.pools), { ...ZERO_POOLS });
  const truckByCode: Record<string, number> = {};
  for (const code of TRUCKING_CODES) truckByCode[code] = months.reduce((s, m) => s + (m.trucking[code] ?? 0), 0);
  const truckDenom = TRUCKING_CODES.reduce((s, code) => s + truckByCode[code], 0);

  // Upsert the range (preserve is_published on update).
  const { data: existing } = await db
    .from('report_ranges').select('id, is_published')
    .eq('period_start', periodStart).eq('period_end', periodEnd).eq('label', label).maybeSingle();
  let rangeId: string;
  if (existing) {
    rangeId = existing.id;
  } else {
    const { data: created, error } = await db.from('report_ranges')
      .insert({ label, kind, period_start: periodStart, period_end: periodEnd }).select('id').single();
    if (error) throw error;
    rangeId = created.id;
  }

  const rows: Record<string, unknown>[] = [];
  for (const cfg of configs) {
    if (cfg.manualEntry) continue; // Lakatan Farm is entered separately, not derived
    const bu = months.reduce((acc, m) => addBu(acc, m.inputs.get(cfg.buCode) ?? ZERO_BU), { ...ZERO_BU });
    const truckNumer = cfg.truckingMembers.reduce((s, code) => s + (truckByCode[code] ?? 0), 0);
    const side = computeFromInputs(bu, pools, cfg, truckNumer, truckDenom);
    const gs = side.gross_sales || 0;
    const pctOf = (key: string, amount: number) => (PCT_KEYS.has(key) || gs === 0 ? 0 : amount / gs);
    const push = (key: string, amount: number) => rows.push({ range_id: rangeId, bu_code: cfg.buCode, line_item: key, amount, pct_of_sales: pctOf(key, amount) });
    const variance = months.reduce((s, m) => s + (m.variance.get(cfg.buCode) ?? 0), 0);
    for (const item of PNL_LINE_ITEMS) {
      const amount = side[item.key] ?? 0;
      // For the variance BUs, split COGS: Cost of Goods Sold (= Total − variance),
      // the variance line, then Total Cost of Goods Sold (= Total COGS). Gross
      // Income is unchanged (still Gross Sales − Total COGS).
      if (item.key === 'cogs' && cfg.buCode in COGS_VARIANCE_LABELS && variance !== 0) {
        push('cogs', amount - variance);
        push('cogs_variance', variance);
        push('cogs_total', amount);
      } else {
        push(item.key, amount);
      }
    }
    await db.from('computed_pnl').delete().eq('range_id', rangeId).eq('bu_code', cfg.buCode);
  }
  // insert in chunks
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('computed_pnl').insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
  return rangeId;
}

interface Ym { year: number; month: number }

// Fetch every row of a table for the given years, paging past the API row cap
// so a large year (>1000 rows) isn't silently truncated.
async function fetchAllByYears(db: Db, table: string, years: number[]): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await db.from(table).select('*').in('year', years).range(from, from + page - 1);
    if (error) throw error;
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

// Materialize expense_lines for a range by summing monthly_expense over its
// months (imported from the raw QB Exp Data). No-op if no expense data yet.
async function materializeExpenses(db: Db, rangeId: string, yms: Ym[]) {
  const years = [...new Set(yms.map((y) => y.year))];
  const ymSet = new Set(yms.map((y) => `${y.year}-${y.month}`));
  const data = await fetchAllByYears(db, 'monthly_expense', years) as any[];
  const src = data.filter((r) => ymSet.has(`${r.year}-${r.month}`));
  await db.from('expense_lines').delete().eq('range_id', rangeId);
  if (src.length === 0) return;

  const agg = new Map<string, { bu_code: string; section: string; group_name: string; account: string; amount: number }>();
  for (const r of src) {
    const key = `${r.bu_code}|${r.section}|${r.group_name}|${r.account}`;
    const e = agg.get(key);
    if (e) e.amount += r.amount;
    else agg.set(key, { bu_code: r.bu_code, section: r.section, group_name: r.group_name, account: r.account, amount: r.amount });
  }
  const rows = [...agg.values()].filter((r) => r.amount !== 0).map((r) => ({ range_id: rangeId, ...r, sort_order: 0 }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('expense_lines').insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
}

// Materialize sales_qty_lines for a range by summing monthly_sales over its
// months (imported from the raw QB Sales Data). No-op if no sales data yet.
async function materializeSales(db: Db, rangeId: string, yms: Ym[]) {
  const years = [...new Set(yms.map((y) => y.year))];
  const ymSet = new Set(yms.map((y) => `${y.year}-${y.month}`));
  const data = await fetchAllByYears(db, 'monthly_sales', years) as any[];
  const src = data.filter((r) => ymSet.has(`${r.year}-${r.month}`));
  await db.from('sales_qty_lines').delete().eq('range_id', rangeId);
  if (src.length === 0) return;

  const agg = new Map<string, { bu_code: string; item: string; uom: string; qty: number }>();
  for (const r of src) {
    const key = `${r.bu_code}|${r.item}`;
    const e = agg.get(key);
    if (e) e.qty += r.qty;
    else agg.set(key, { bu_code: r.bu_code, item: r.item, uom: r.uom, qty: r.qty });
  }
  const rows = [...agg.values()].filter((r) => r.qty !== 0).map((r) => ({ range_id: rangeId, ...r }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('sales_qty_lines').insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
}

// Rebuild all derived ranges for a year from its stored monthly inputs.
export async function deriveRanges(db: Db, year: number): Promise<{ ranges: number }> {
  const months = await loadYearMonths(db, year);
  if (months.length === 0) return { ranges: 0 };
  // Hardcoded (validated) BUs + any user-added BUs flagged auto_compute. No pivot
  // here — recompute works from the stored monthly inputs, not member columns.
  const configs = await loadBuConfigs(db);
  let count = 0;

  const ymOf = (ms: MonthData[]): Ym[] => ms.map((m) => ({ year: m.year, month: m.month }));

  for (const m of months) {
    // month range
    const monthId = await materializeRange(db, configs, [m], 'month', monthLabel(m.year, m.month), firstDay(m.year, m.month), lastDay(m.year, m.month));
    await materializeExpenses(db, monthId, ymOf([m]));
    await materializeSales(db, monthId, ymOf([m]));
    count++;

    // YTD ending at this month = Jan..m (labelled by its end month, e.g. "YTD May 2026")
    const ytdMonths = months.filter((x) => x.month <= m.month);
    const ytdId = await materializeRange(db, configs, ytdMonths, 'ytd', `YTD ${monthLabel(m.year, m.month)}`, firstDay(year, 1), lastDay(m.year, m.month));
    await materializeExpenses(db, ytdId, ymOf(ytdMonths));
    await materializeSales(db, ytdId, ymOf(ytdMonths));
    count++;
  }

  // Quarters with all three months present.
  const present = new Set(months.map((m) => m.month));
  const quarters: { q: number; start: number; end: number }[] = [
    { q: 1, start: 1, end: 3 }, { q: 2, start: 4, end: 6 }, { q: 3, start: 7, end: 9 }, { q: 4, start: 10, end: 12 },
  ];
  for (const qd of quarters) {
    if (![qd.start, qd.start + 1, qd.end].every((mm) => present.has(mm))) continue;
    const qMonths = months.filter((m) => m.month >= qd.start && m.month <= qd.end);
    const qId = await materializeRange(db, configs, qMonths, 'quarter', `Q${qd.q} ${year}`, firstDay(year, qd.start), lastDay(year, qd.end));
    await materializeExpenses(db, qId, ymOf(qMonths));
    await materializeSales(db, qId, ymOf(qMonths));
    count++;
  }

  return { ranges: count };
}
