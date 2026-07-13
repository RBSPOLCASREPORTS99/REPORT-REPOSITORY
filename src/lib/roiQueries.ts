import { supabase } from './supabaseClient';
import { fetchRanges, fetchTruckPnl, type RangeRow } from './queries';
import { GFFC_CATEGORIES, GFFC_EXPENSE_KEYS } from './gffc/gffcConfig';

// ROI on Labor per BU = Net Income from Ops ÷ Total Labor Cost, ranked highest
// first. Net Income and Labor Cost auto-build from each BU's P&L (POLCAS BUs from
// computed_pnl, plus BU10 Trucking and GFFC from their own data). Finance can
// override a BU's figures per range via roi_labor_manual. All values full pesos.

export interface RoiRow {
  buCode: string;
  label: string;
  netIncome: number; laborCost: number; roi: number | null; rank: number;
  priorNetIncome: number; priorLaborCost: number; priorRoi: number | null; priorRank: number;
  autoNetIncome: number; autoLaborCost: number; // pre-override (for the entry form)
  overridden: boolean;
}

const roi = (ni: number, labor: number): number | null => (labor !== 0 ? ni / labor : null);

// Display label per BU code (matches the Excel report).
const LABELS: Record<string, string> = {
  BU0102: 'BU01/02', BU03: 'BU03', BU04: 'BU04', BU05: 'BU05', BU06: 'BU06',
  BU07: 'BU07', BU08: 'BU08 LP', BU08LF: 'BU08 LF', BU09: 'BU09', BU11: 'BU11',
  BU10: 'BU10', GFFC: 'GFFC',
};
const labelFor = (code: string) => LABELS[code] ?? code;

const monthsInPeriod = (start: string, end: string) => {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const out: { year: number; month: number }[] = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) { out.push({ year: y, month: m }); m++; if (m > 12) { m = 1; y++; } }
  return out;
};

// GFFC Net Income from Ops (Gross Income − Total Expense) and Salaries, in pesos.
async function gffcNiLabor(period: { start: string; end: string } | undefined): Promise<{ ni: number; labor: number }> {
  if (!period) return { ni: 0, labor: 0 };
  const months = monthsInPeriod(period.start, period.end);
  const inSet = new Set(months.map((x) => `${x.year}-${x.month}`));
  const { data } = await supabase.from('gffc_monthly_pnl').select('year, month, line_key, amount').in('year', [...new Set(months.map((x) => x.year))]);
  const agg: Record<string, number> = {};
  for (const r of data ?? []) { if (inSet.has(`${r.year}-${r.month}`)) agg[r.line_key as string] = (agg[r.line_key as string] ?? 0) + Number(r.amount); }
  const gross = GFFC_CATEGORIES.reduce((s, x) => s + (agg[x.key] ?? 0), 0);
  const totalExp = GFFC_EXPENSE_KEYS.reduce((s, k) => s + (agg[k] ?? 0), 0);
  return { ni: gross - (agg.cogs ?? 0) - totalExp, labor: agg.salaries ?? 0 };
}

// BU10 Trucking labour = sum of monthly_truck_salary over the period (₱'000).
async function truckLabor(period: { start: string; end: string } | undefined): Promise<number> {
  if (!period) return 0;
  const { data: months } = await supabase.from('pnl_months').select('id, year, month');
  const idByYm = new Map((months ?? []).map((m) => [`${m.year}-${m.month}`, m.id as string]));
  const ids = monthsInPeriod(period.start, period.end).map((x) => idByYm.get(`${x.year}-${x.month}`)).filter((x): x is string => !!x);
  if (ids.length === 0) return 0;
  const { data: sal } = await supabase.from('monthly_truck_salary').select('amount').in('month_id', ids);
  return (sal ?? []).reduce((s, r) => s + Number(r.amount), 0);
}

export async function fetchRoiLabor(currentRangeId: string, priorRangeId?: string): Promise<RoiRow[]> {
  const ranges = await fetchRanges();
  const curRange = ranges.find((r) => r.id === currentRangeId);
  const priRange = ranges.find((r) => r.id === priorRangeId);
  const curP = curRange ? { start: curRange.period_start, end: curRange.period_end } : undefined;
  const priP = priRange ? { start: priRange.period_start, end: priRange.period_end } : undefined;
  // The month ranges a range covers (itself if a single month). YTD/quarter thus
  // aggregate their months, so per-month manual overrides carry into the total.
  const monthRangesIn = (r?: RangeRow) => (!r ? [] : r.kind === 'month' ? [r] : ranges.filter((x) => x.kind === 'month' && x.period_start >= r.period_start && x.period_end <= r.period_end));
  const curMR = monthRangesIn(curRange);
  const priMR = monthRangesIn(priRange);
  const monthIds = [...new Set([...curMR, ...priMR].map((r) => r.id))];

  // 1. POLCAS BUs from computed_pnl per constituent month (₱'000 → ×1000 full
  //    pesos). BU08LF's labor is its "Labor" line (discounting_expense).
  const [{ data: pnl }, { data: ovMonthly }, { data: ovAgg }, truck, truckLab, gffcC, gffcP, truckLabP] = await Promise.all([
    supabase.from('computed_pnl').select('range_id, bu_code, line_item, amount').in('range_id', monthIds).in('line_item', ['net_income_ops', 'salaries_expense', 'discounting_expense']),
    supabase.from('roi_labor_manual').select('range_id, bu_code, net_income, labor_cost').in('range_id', monthIds),
    supabase.from('roi_labor_manual').select('bu_code, net_income, labor_cost').eq('range_id', currentRangeId),
    fetchTruckPnl(curP ?? { start: '', end: '' }, priP).catch(() => ({ hasData: false, net: 0, priorNet: 0 } as { hasData: boolean; net: number; priorNet: number })),
    truckLabor(curP), gffcNiLabor(curP), gffcNiLabor(priP), truckLabor(priP),
  ]);

  const byRange = new Map<string, Map<string, { ni: number; salaries: number; disc: number }>>();
  for (const r of pnl ?? []) {
    const rid = r.range_id as string, code = r.bu_code as string;
    if (!byRange.has(rid)) byRange.set(rid, new Map());
    const m = byRange.get(rid)!;
    if (!m.has(code)) m.set(code, { ni: 0, salaries: 0, disc: 0 });
    const e = m.get(code)!;
    if (r.line_item === 'net_income_ops') e.ni = Number(r.amount) * 1000;
    if (r.line_item === 'salaries_expense') e.salaries = Number(r.amount) * 1000;
    if (r.line_item === 'discounting_expense') e.disc = Number(r.amount) * 1000;
  }
  // Per-month manual overrides (full pesos): range_id -> bu -> { net_income, labor_cost }.
  const ovBy = new Map<string, Map<string, { net_income: number | null; labor_cost: number | null }>>();
  for (const r of ovMonthly ?? []) {
    const rid = r.range_id as string;
    if (!ovBy.has(rid)) ovBy.set(rid, new Map());
    ovBy.get(rid)!.set(r.bu_code as string, { net_income: r.net_income as number | null, labor_cost: r.labor_cost as number | null });
  }
  const laborOf = (code: string, e: { salaries: number; disc: number }) => (code === 'BU08LF' ? e.disc : e.salaries);

  // Sum a range's months: value = Σ (monthOverride ?? monthAuto); also the pure
  // auto sum (for the entry form's placeholder).
  const aggregate = (mrs: RangeRow[]) => {
    const out = new Map<string, { ni: number; labor: number; autoNi: number; autoLabor: number }>();
    const codes = new Set<string>();
    for (const mr of mrs) for (const c of byRange.get(mr.id)?.keys() ?? []) codes.add(c);
    for (const code of codes) {
      let ni = 0, labor = 0, autoNi = 0, autoLabor = 0;
      for (const mr of mrs) {
        const auto = byRange.get(mr.id)?.get(code) ?? { ni: 0, salaries: 0, disc: 0 };
        const aNi = auto.ni, aLabor = laborOf(code, auto);
        const o = ovBy.get(mr.id)?.get(code);
        autoNi += aNi; autoLabor += aLabor;
        ni += o?.net_income != null ? Number(o.net_income) : aNi;
        labor += o?.labor_cost != null ? Number(o.labor_cost) : aLabor;
      }
      out.set(code, { ni, labor, autoNi, autoLabor });
    }
    return out;
  };
  const cur = aggregate(curMR);
  const pri = aggregate(priMR);

  // 2. BU10 (Trucking) and GFFC — period auto (no per-month override tracked).
  const set2 = (m: typeof cur, code: string, ni: number, labor: number) => m.set(code, { ni, labor, autoNi: ni, autoLabor: labor });
  set2(cur, 'BU10', (truck.net || 0) * 1000, truckLab * 1000);
  set2(pri, 'BU10', (truck.priorNet || 0) * 1000, truckLabP * 1000);
  set2(cur, 'GFFC', gffcC.ni, gffcC.labor);
  set2(pri, 'GFFC', gffcP.ni, gffcP.labor);

  // 3. A manual override set directly on the viewed range wins over the month sum.
  const overrides = new Map((ovAgg ?? []).map((r) => [r.bu_code as string, r]));

  const codes = [...new Set([...cur.keys(), ...pri.keys()])];
  const rows = codes.map((code) => {
    const c = cur.get(code) ?? { ni: 0, labor: 0, autoNi: 0, autoLabor: 0 };
    const p = pri.get(code) ?? { ni: 0, labor: 0, autoNi: 0, autoLabor: 0 };
    const o = overrides.get(code);
    const netIncome = o?.net_income != null ? Number(o.net_income) : c.ni;
    const laborCost = o?.labor_cost != null ? Number(o.labor_cost) : c.labor;
    return {
      buCode: code, label: labelFor(code),
      netIncome, laborCost, roi: roi(netIncome, laborCost), rank: 0,
      priorNetIncome: p.ni, priorLaborCost: p.labor, priorRoi: roi(p.ni, p.labor), priorRank: 0,
      autoNetIncome: c.autoNi, autoLaborCost: c.autoLabor,
      overridden: (!!o && (o.net_income != null || o.labor_cost != null)) || c.ni !== c.autoNi || c.labor !== c.autoLabor,
    };
  }).filter((r) => r.netIncome !== 0 || r.laborCost !== 0 || r.priorNetIncome !== 0 || r.priorLaborCost !== 0);

  // 4. Rank by ROI (highest first); null ROI ranks last.
  const rankBy = (arr: RoiRow[], get: (r: RoiRow) => number | null, set: (r: RoiRow, n: number) => void) => {
    [...arr].sort((a, b) => (get(b) ?? -Infinity) - (get(a) ?? -Infinity)).forEach((r, i) => set(r, i + 1));
  };
  rankBy(rows, (r) => r.roi, (r, n) => { r.rank = n; });
  rankBy(rows, (r) => r.priorRoi, (r, n) => { r.priorRank = n; });

  return rows.sort((a, b) => a.rank - b.rank);
}

// ---- Manual override entry ------------------------------------------------
export async function loadRoiOverrides(rangeId: string): Promise<Record<string, { net_income: number | null; labor_cost: number | null }>> {
  const { data } = await supabase.from('roi_labor_manual').select('bu_code, net_income, labor_cost').eq('range_id', rangeId);
  const out: Record<string, { net_income: number | null; labor_cost: number | null }> = {};
  for (const r of data ?? []) out[r.bu_code as string] = { net_income: r.net_income as number | null, labor_cost: r.labor_cost as number | null };
  return out;
}

export async function saveRoiOverride(rangeId: string, buCode: string, netIncome: number | null, laborCost: number | null): Promise<void> {
  if (netIncome == null && laborCost == null) {
    await supabase.from('roi_labor_manual').delete().eq('range_id', rangeId).eq('bu_code', buCode);
    return;
  }
  const { error } = await supabase.from('roi_labor_manual').upsert({ range_id: rangeId, bu_code: buCode, net_income: netIncome, labor_cost: laborCost }, { onConflict: 'range_id,bu_code' });
  if (error) throw error;
}
