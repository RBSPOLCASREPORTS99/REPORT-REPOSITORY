// One-off script that exercises the exact same parse + write logic as
// src/pages/ImportWizard.tsx's handleConfirm, but driven from Node so we can
// verify the Supabase write path without pushing the whole workbook through
// a browser eval channel. Uses the service_role key (bypasses RLS) purely as
// a local, throwaway testing convenience — never used by the shipped app.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { parseBrPnlWorkbook } from '../src/lib/importers/parseBrPnl';

const [, , filePath, url, serviceKeyPath] = process.argv;
const serviceKey = readFileSync(serviceKeyPath, 'utf8').trim();
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const buf = readFileSync(filePath);
const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
const result = parseBrPnlWorkbook(arrayBuffer, filePath.split(/[\\/]/).pop()!);

console.log(`Parsed ${result.buResults.length} BU tabs, ${result.warnings.length} warnings.`);

const periodIds = new Map<string, number>();
for (const b of result.buResults) {
  const k = `${b.period.year}-${b.period.month}`;
  if (periodIds.has(k)) continue;
  const { data: existing } = await supabase.from('periods').select('id').eq('year', b.period.year).eq('month', b.period.month).maybeSingle();
  if (existing) {
    periodIds.set(k, existing.id);
  } else {
    const { data: created, error } = await supabase.from('periods').insert({ year: b.period.year, month: b.period.month }).select('id').single();
    if (error) throw error;
    periodIds.set(k, created.id);
  }
}

const counts = new Map<string, number>();
for (const b of result.buResults) {
  const k = `${b.period.year}-${b.period.month}`;
  counts.set(k, (counts.get(k) ?? 0) + 1);
}
const majorityKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
const batchPeriodId = periodIds.get(majorityKey)!;

const storagePath = `br/${majorityKey}/${Date.now()}-${result.fileName}`;
const { error: uploadError } = await supabase.storage.from('imports').upload(storagePath, buf, {
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});
if (uploadError) throw uploadError;
console.log('Uploaded to storage:', storagePath);

const totalLines = result.buResults.reduce((sum, b) => sum + b.lines.length, 0);
const { data: batch, error: batchError } = await supabase
  .from('import_batches')
  .insert({
    source_report: 'BR',
    filename: result.fileName,
    storage_path: storagePath,
    period_id: batchPeriodId,
    row_count: totalLines,
    status: 'pending',
    warnings: result.warnings,
  })
  .select('id')
  .single();
if (batchError) throw batchError;

for (const b of result.buResults) {
  const k = `${b.period.year}-${b.period.month}`;
  const periodId = periodIds.get(k)!;

  await supabase.from('pnl_lines').delete().eq('period_id', periodId).eq('bu_code', b.buCode);

  const rows = b.lines.flatMap((line) =>
    Object.entries(line.blocks).map(([pair, v]) => ({
      period_id: periodId,
      bu_code: b.buCode,
      line_item: line.key,
      comparison_pair: pair,
      current_amount: v!.current,
      prior_amount: v!.prior,
      current_pct_of_sales: v!.currentPct,
      prior_pct_of_sales: v!.priorPct,
      diff: v!.diff,
      pct_diff: v!.pctDiff,
      import_batch_id: batch.id,
    })),
  );
  const { error: insertError } = await supabase.from('pnl_lines').insert(rows);
  if (insertError) throw insertError;
  console.log(`  ${b.buCode} (${b.buName}): ${rows.length} rows -> period ${k}`);
}

await supabase.from('import_batches').update({ status: 'confirmed' }).eq('id', batch.id);

// Publish the majority period so bu_head/gm roles can see it too.
await supabase.from('periods').update({ is_published: true }).eq('id', batchPeriodId);

console.log('Done. Batch id:', batch.id);
