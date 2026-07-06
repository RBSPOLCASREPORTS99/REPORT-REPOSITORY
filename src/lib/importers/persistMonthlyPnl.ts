import { supabase } from '../supabaseClient';
import type { ParsedPivot } from './parsePivotTab';
import { TRUCKING_CODES } from '../pnl/buConfig';
import { loadBuConfigs } from '../pnl/loadBuConfigs';
import { extractBuInputs, extractPools, type TruckingInputs } from '../pnl/computeBuPnl';
import { deriveRanges } from '../pnl/deriveRanges';
import { monthLabel } from '../format';

// Persist one month's P&L: store the compact additive inputs + pools + trucking,
// then re-derive all ranges for that year. Re-importing a month replaces it.
export interface MonthlyPersistArgs {
  year: number;
  month: number;
  pivot: ParsedPivot;
  trucking: TruckingInputs; // this month's per-BU trucking cost (₱ '000)
  fileName: string;
  fileBuffer: ArrayBuffer;
  userId: string;
}

export async function persistMonthlyPnl(args: MonthlyPersistArgs): Promise<{ monthId: string; ranges: number }> {
  const { year, month, pivot, trucking, fileName, userId } = args;

  // 1. audit record only — the raw file is NOT stored (its data is fully
  // extracted into the DB below and captured by the weekly backup).
  const { data: batch, error: batchErr } = await supabase.from('import_batches').insert({
    source_report: 'BR', filename: fileName, storage_path: null, uploaded_by: userId, row_count: 0, status: 'pending',
  }).select('id').single();
  if (batchErr) throw batchErr;

  // 3. upsert the month (replace on re-import)
  const { data: existing } = await supabase.from('pnl_months').select('id').eq('year', year).eq('month', month).maybeSingle();
  let monthId: string;
  if (existing) {
    monthId = existing.id;
    await supabase.from('pnl_months').update({ import_batch_id: batch.id, uploaded_by: userId }).eq('id', monthId);
  } else {
    const { data: created, error } = await supabase.from('pnl_months').insert({
      year, month, label: monthLabel(year, month), import_batch_id: batch.id, uploaded_by: userId,
    }).select('id').single();
    if (error) throw error;
    monthId = created.id;
  }

  // 4. replace inputs / pools / trucking
  await supabase.from('monthly_pnl_inputs').delete().eq('month_id', monthId);
  const configs = await loadBuConfigs(supabase, pivot);
  const inputRows = configs.filter((c) => !c.manualEntry).map((cfg) => ({ month_id: monthId, bu_code: cfg.buCode, ...extractBuInputs(pivot, cfg) }));
  const { error: inErr } = await supabase.from('monthly_pnl_inputs').insert(inputRows);
  if (inErr) throw inErr;

  const pools = extractPools(pivot);
  await supabase.from('monthly_pnl_pools').delete().eq('month_id', monthId);
  const { error: poolErr } = await supabase.from('monthly_pnl_pools').insert({ month_id: monthId, ...pools });
  if (poolErr) throw poolErr;

  await supabase.from('monthly_trucking').delete().eq('month_id', monthId);
  const truckRows = TRUCKING_CODES.map((code) => ({ month_id: monthId, trucking_code: code, amount: trucking[code] ?? 0 })).filter((r) => r.amount !== 0);
  if (truckRows.length) {
    const { error: tErr } = await supabase.from('monthly_trucking').insert(truckRows);
    if (tErr) throw tErr;
  }

  await supabase.from('import_batches').update({ status: 'confirmed' }).eq('id', batch.id);

  // 5. re-derive all ranges for the year
  const { ranges } = await deriveRanges(supabase, year);
  return { monthId, ranges };
}
