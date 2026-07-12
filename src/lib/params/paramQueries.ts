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

// Resolve every parameter's value for one range: manual (stored) + P&L (from
// computed_pnl, ₱'000 → full pesos) + ratio (num ÷ den, computed last).
async function resolveParams(rangeId: string | undefined, buCode: string, config: BuParamConfig): Promise<Map<string, number>> {
  const vals = new Map<string, number>();
  if (!rangeId) return vals;

  const [{ data: manual }, pnlKeys] = [
    await supabase.from('bu_parameters').select('param_key, value').eq('range_id', rangeId).eq('bu_code', buCode),
    config.params.filter((p): p is ParamDef & { source: { kind: 'pnl'; line: string } } => p.source.kind === 'pnl'),
  ];
  for (const r of manual ?? []) vals.set(r.param_key as string, Number(r.value));

  if (pnlKeys.length) {
    const lines = [...new Set(pnlKeys.map((p) => p.source.line))];
    const { data: pnl } = await supabase.from('computed_pnl').select('line_item, amount').eq('range_id', rangeId).eq('bu_code', buCode).in('line_item', lines);
    const byLine = new Map((pnl ?? []).map((r) => [r.line_item as string, Number(r.amount)]));
    for (const p of pnlKeys) vals.set(p.key, (byLine.get(p.source.line) ?? 0) * 1000);
  }

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
