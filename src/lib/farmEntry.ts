import { supabase } from './supabaseClient';
import {
  FARM_BU_CODE, FARM_DEFERRED_PREFIX, FARM_INPUT_LINES, FARM_INPUT_KEYS,
  deriveFarmLines, farmComputedRows, farmItemKeys, type FarmInputs,
} from './pnl/farmDerive';
import { recomputeFarmAggregates } from './pnl/deriveRanges';

// Lakatan Farm (BU08LF) is hand-entered in the Excel workbook, not computed
// from QuickBooks. Finance types the input lines; we derive the subtotals the
// same way the P&L does, then store the result as BU08LF's computed_pnl side so
// it appears in the dashboard like any other BU. The pure math (inputs, derive,
// row-building) lives in ./pnl/farmDerive so the range aggregator can share it.
export { FARM_BU_CODE, FARM_DEFERRED_PREFIX, FARM_INPUT_LINES, deriveFarmLines, type FarmInputs };

// Load the Farm's currently-stored inputs for a range (to pre-fill the form).
// deferred=true reads the "def_"-prefixed lines (the Deferred P&L).
export async function loadFarmInputs(rangeId: string, deferred = false): Promise<FarmInputs> {
  const { data, error } = await supabase
    .from('computed_pnl').select('line_item, amount').eq('range_id', rangeId).eq('bu_code', FARM_BU_CODE);
  if (error) throw error;
  const inputs: FarmInputs = {};
  for (const r of data ?? []) {
    const li = r.line_item as string;
    const isDef = li.startsWith(FARM_DEFERRED_PREFIX);
    if (isDef !== deferred) continue;
    const key = deferred ? li.slice(FARM_DEFERRED_PREFIX.length) : li;
    if (FARM_INPUT_KEYS.has(key)) inputs[key] = r.amount as number;
  }
  return inputs;
}

function monthsInPeriod(start: string, end: string): { year: number; month: number }[] {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const out: { year: number; month: number }[] = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) { out.push({ year: y, month: m }); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

// Auto-compute the Farm's allocated support-centre lines the same way the other
// BUs are allocated: each = (Farm Gross Sales ÷ company Gross Sales) × the
// company-wide pool, summed over the range's months. Returns null when the pools
// for the period aren't imported yet.
export interface FarmAllocations {
  admin_allocated: number;
  cost_of_money_allocated: number;
  support_finance: number;
  support_hr: number;
  support_management: number;
}
export async function computeFarmAllocations(rangeId: string, grossSales: number): Promise<FarmAllocations | null> {
  const { data: rng } = await supabase.from('report_ranges').select('period_start, period_end').eq('id', rangeId).maybeSingle();
  if (!rng) return null;
  const want = new Set(monthsInPeriod(rng.period_start as string, rng.period_end as string).map((m) => `${m.year}-${m.month}`));
  const { data: pm } = await supabase.from('pnl_months').select('id, year, month');
  const ids = (pm ?? []).filter((r) => want.has(`${r.year}-${r.month}`)).map((r) => r.id as string);
  if (ids.length === 0) return null;
  const { data: pools } = await supabase.from('monthly_pnl_pools')
    .select('company_gross_sales, admin_pool, cost_money_pool, finance_pool, hr_pool, mancom_pool').in('month_id', ids);
  if (!pools || pools.length === 0) return null;
  const sum = { company_gross_sales: 0, admin_pool: 0, cost_money_pool: 0, finance_pool: 0, hr_pool: 0, mancom_pool: 0 };
  for (const p of pools) {
    sum.company_gross_sales += Number(p.company_gross_sales) || 0;
    sum.admin_pool += Number(p.admin_pool) || 0;
    sum.cost_money_pool += Number(p.cost_money_pool) || 0;
    sum.finance_pool += Number(p.finance_pool) || 0;
    sum.hr_pool += Number(p.hr_pool) || 0;
    sum.mancom_pool += Number(p.mancom_pool) || 0;
  }
  const share = sum.company_gross_sales !== 0 ? grossSales / sum.company_gross_sales : 0;
  const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
  return {
    admin_allocated: r5(share * sum.admin_pool),
    cost_of_money_allocated: r5(share * sum.cost_money_pool),
    support_finance: r5(share * sum.finance_pool),
    support_hr: r5(share * sum.hr_pool),
    support_management: r5(share * sum.mancom_pool),
  };
}

// Save the Farm's P&L for a range (replace prior entry). deferred=true writes the
// "def_"-prefixed lines; each save only replaces its own line-item set, so the
// Farm P&L and Deferred P&L (both under BU08LF) don't clobber each other. Saving
// a month then re-aggregates that year's YTD / quarter Farm figures.
export async function saveFarmEntry(rangeId: string, inputs: FarmInputs, deferred = false): Promise<void> {
  await supabase.from('computed_pnl').delete().eq('range_id', rangeId).eq('bu_code', FARM_BU_CODE).in('line_item', farmItemKeys(deferred));
  const { error } = await supabase.from('computed_pnl').insert(farmComputedRows(rangeId, inputs, deferred));
  if (error) throw error;

  // Auto-compute YTD / quarter from the months: refresh this year's aggregates
  // whenever a month is saved. (Non-fatal — the values are also refreshed on the
  // next P&L import via deriveRanges.)
  const { data: r } = await supabase.from('report_ranges').select('kind, period_start').eq('id', rangeId).maybeSingle();
  if (r?.kind === 'month' && typeof r.period_start === 'string') {
    try { await recomputeFarmAggregates(supabase, Number(r.period_start.slice(0, 4))); } catch { /* non-fatal */ }
  }
}
