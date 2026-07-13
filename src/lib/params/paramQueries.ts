import { supabase } from '../supabaseClient';
import { BU_PARAM_CONFIG, type BuParamConfig, type ParamDef } from './paramConfig';

// A resolved parameter row for the comparison table.
export interface ParamRow {
  key: string;
  label: string;
  std: number | null;
  prior: number | null;
  current: number | null;
  decimals: number;
  pct: boolean;
  peso: boolean;
}

// The month-range ids that make up a range (itself if it is a single month).
async function monthRangeIds(rangeId: string): Promise<{ ids: string[]; multi: boolean }> {
  const { data: r } = await supabase.from('report_ranges').select('kind, period_start, period_end').eq('id', rangeId).maybeSingle();
  if (!r || r.kind === 'month') return { ids: [rangeId], multi: false };
  const { data: months } = await supabase.from('report_ranges').select('id')
    .eq('kind', 'month').gte('period_start', r.period_start).lte('period_end', r.period_end);
  const ids = (months ?? []).map((m) => m.id as string);
  return { ids: ids.length ? ids : [rangeId], multi: true };
}

// Resolve every parameter's value for one range: manual (stored) + P&L (from
// computed_pnl, ₱'000 → full pesos) + ratio (num ÷ den, computed last).
async function resolveParams(rangeId: string | undefined, buCode: string, config: BuParamConfig): Promise<Map<string, number>> {
  const vals = new Map<string, number>();
  if (!rangeId) return vals;

  // 1. manual values. For a multi-month range (YTD/quarter) the monthly entries
  //    are auto-combined — additive params sum, rate params ('avg') average —
  //    with a fallback to the range's own stored value for keys with no months.
  const { ids: monthIds, multi } = await monthRangeIds(rangeId);
  const aggIds = multi ? [...new Set([...monthIds, rangeId])] : monthIds;
  const { data: manual } = await supabase.from('bu_parameters').select('range_id, param_key, value').in('range_id', aggIds).eq('bu_code', buCode);
  const monthSet = new Set(monthIds);
  const byKey = new Map<string, { sum: number; count: number; own: number | null }>();
  for (const r of manual ?? []) {
    const key = r.param_key as string;
    const e = byKey.get(key) ?? { sum: 0, count: 0, own: null };
    if (monthSet.has(r.range_id as string)) { e.sum += Number(r.value); e.count += 1; }
    if ((r.range_id as string) === rangeId) e.own = Number(r.value);
    byKey.set(key, e);
  }
  const aggMode = (key: string): 'sum' | 'avg' => {
    const p = config.params.find((x) => x.key === key);
    return p?.source.kind === 'manual' ? (p.aggregate ?? 'sum') : 'sum';
  };
  for (const [key, e] of byKey) {
    if (e.count > 0) vals.set(key, aggMode(key) === 'avg' ? e.sum / e.count : e.sum);
    else if (e.own != null) vals.set(key, e.own);
  }

  // 2. P&L-sourced (sum of the given computed_pnl lines, ₱'000 → full pesos).
  const pnlKeys = config.params.filter((p): p is ParamDef & { source: { kind: 'pnl'; lines: string[] } } => p.source.kind === 'pnl');
  if (pnlKeys.length) {
    const allLines = [...new Set(pnlKeys.flatMap((p) => p.source.lines))];
    const { data: pnl } = await supabase.from('computed_pnl').select('line_item, amount').eq('range_id', rangeId).eq('bu_code', buCode).in('line_item', allLines);
    const byLine = new Map((pnl ?? []).map((r) => [r.line_item as string, Number(r.amount)]));
    for (const p of pnlKeys) vals.set(p.key, p.source.lines.reduce((s, l) => s + (byLine.get(l) ?? 0), 0) * 1000);
  }

  // 3. sums of other params (in config order so dependencies resolve first).
  for (const p of config.params) {
    if (p.source.kind === 'sum') vals.set(p.key, p.source.of.reduce((s, k) => s + (vals.get(k) ?? 0), 0));
  }

  // 4. ratios (num ÷ den), last.
  for (const p of config.params) {
    if (p.source.kind === 'ratio') {
      const num = vals.get(p.source.num) ?? 0;
      const den = vals.get(p.source.den) ?? 0;
      vals.set(p.key, den !== 0 ? num / den : 0);
    }
  }
  return vals;
}

async function fetchStd(buCode: string): Promise<Map<string, number>> {
  const { data } = await supabase.from('bu_parameter_std').select('param_key, value').eq('bu_code', buCode);
  return new Map((data ?? []).map((r) => [r.param_key as string, Number(r.value)]));
}

// Build the Parameters comparison rows for a BU (current vs prior range).
export async function fetchBuParameters(buCode: string, currentRangeId: string, priorRangeId?: string): Promise<ParamRow[] | null> {
  const config = BU_PARAM_CONFIG[buCode];
  if (!config) return null;
  const [cur, pri, std] = await Promise.all([
    resolveParams(currentRangeId, buCode, config),
    resolveParams(priorRangeId, buCode, config),
    fetchStd(buCode),
  ]);
  return config.params.filter((p) => !p.hidden).map((p) => ({
    key: p.key,
    label: p.label,
    std: std.has(p.key) ? std.get(p.key)! : null,
    prior: pri.has(p.key) ? pri.get(p.key)! : null,
    current: cur.has(p.key) ? cur.get(p.key)! : null,
    decimals: p.decimals ?? 2,
    pct: !!p.pct,
    peso: !!p.peso,
  }));
}

// ---- Entry (finance) ----------------------------------------------------

// The manual parameter values stored for a BU + range (to pre-fill the form).
export async function loadBuParameterInputs(rangeId: string, buCode: string): Promise<Record<string, number>> {
  const { data } = await supabase.from('bu_parameters').select('param_key, value').eq('range_id', rangeId).eq('bu_code', buCode);
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.param_key as string] = Number(r.value);
  return out;
}

export async function loadBuParameterStd(buCode: string): Promise<Record<string, number>> {
  const { data } = await supabase.from('bu_parameter_std').select('param_key, value').eq('bu_code', buCode);
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.param_key as string] = Number(r.value);
  return out;
}

// Save the manual values for a BU + range (only the manual params are stored;
// P&L and ratio values are recomputed at read time).
export async function saveBuParameters(rangeId: string, buCode: string, values: Record<string, number>): Promise<void> {
  const config = BU_PARAM_CONFIG[buCode];
  if (!config) return;
  const manualKeys = config.params.filter((p) => p.source.kind === 'manual').map((p) => p.key);
  const rows = manualKeys
    .filter((k) => values[k] != null)
    .map((k) => ({ range_id: rangeId, bu_code: buCode, param_key: k, value: values[k] }));
  await supabase.from('bu_parameters').delete().eq('range_id', rangeId).eq('bu_code', buCode);
  if (rows.length) { const { error } = await supabase.from('bu_parameters').insert(rows); if (error) throw error; }
}

export async function saveBuParameterStd(buCode: string, values: Record<string, number>): Promise<void> {
  const rows = Object.entries(values)
    .filter(([, v]) => v != null)
    .map(([param_key, value]) => ({ bu_code: buCode, param_key, value }));
  await supabase.from('bu_parameter_std').delete().eq('bu_code', buCode);
  if (rows.length) { const { error } = await supabase.from('bu_parameter_std').upsert(rows, { onConflict: 'bu_code,param_key' }); if (error) throw error; }
}
