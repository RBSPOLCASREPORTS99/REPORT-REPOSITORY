import { supabase } from '../supabaseClient';
import type { ParsedSupport, SupportPeriod } from './parseSupportWorkbook';

// Persist imported support-center allocations (% revenue / per-transaction)
// against the matching report_ranges created by the BR import. Each period
// (ytd / current month / prior month) maps to an existing range by end date.
export interface SupportPersistArgs {
  fileName: string;
  fileBuffer: ArrayBuffer;
  parsed: ParsedSupport;
  userId: string;
}

function lastDay(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export interface SupportPersistResult {
  stored: number;
  missingRanges: SupportPeriod[];
}

export async function persistSupportImport(args: SupportPersistArgs): Promise<SupportPersistResult> {
  const { parsed, fileName, userId } = args;
  const { currentMonth, prevMonth } = parsed;

  // Resolve each support period to a report_range id.
  const curEnd = lastDay(currentMonth.year, currentMonth.month);
  const prevEnd = lastDay(prevMonth.year, prevMonth.month);

  async function findRange(periodEnd: string, kind: 'ytd' | 'month'): Promise<string | null> {
    const { data } = await supabase
      .from('report_ranges').select('id').eq('period_end', periodEnd).eq('kind', kind).maybeSingle();
    return data?.id ?? null;
  }

  const rangeByPeriod: Record<SupportPeriod, string | null> = {
    ytd: await findRange(curEnd, 'ytd'),
    month: await findRange(curEnd, 'month'),
    prevMonth: await findRange(prevEnd, 'month'),
  };
  const missingRanges = (Object.keys(rangeByPeriod) as SupportPeriod[]).filter((p) => !rangeByPeriod[p]);

  // Audit record only — the raw workbook is not stored (data is extracted into
  // support_sim below and covered by the weekly backup).
  const { data: batch } = await supabase.from('import_batches').insert({
    source_report: 'SUPPORT', filename: fileName, storage_path: null, uploaded_by: userId,
    row_count: parsed.values.length, status: 'pending', warnings: parsed.warnings,
  }).select('id').single();
  const batchId = batch!.id as string;

  // Group values by (range, bu) so we can replace cleanly on re-import.
  const touched = new Set<string>();
  const rows = parsed.values
    .map((v) => {
      const rangeId = rangeByPeriod[v.period];
      if (!rangeId) return null;
      touched.add(`${rangeId}::${v.buCode}`);
      return { range_id: rangeId, bu_code: v.buCode, center: v.center, method: v.method, amount: v.amount, import_batch_id: batchId };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  for (const key of touched) {
    const [rangeId, buCode] = key.split('::');
    await supabase.from('support_sim').delete().eq('range_id', rangeId).eq('bu_code', buCode);
  }
  if (rows.length) {
    const { error } = await supabase.from('support_sim').insert(rows);
    if (error) throw error;
  }

  await supabase.from('import_batches').update({ status: 'confirmed' }).eq('id', batchId);
  return { stored: rows.length, missingRanges };
}
