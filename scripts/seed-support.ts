// Seed support_sim (alternative allocation methods) from the support workbook,
// matching periods to existing report_ranges. Usage:
//   npx tsx scripts/seed-support.ts <xlsx> <url> <serviceKeyFile>
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { parseSupportWorkbook, type SupportPeriod } from '../src/lib/importers/parseSupportWorkbook';

const [, , filePath, url, keyFile] = process.argv;
const supabase = createClient(url, readFileSync(keyFile, 'utf8').trim(), { auth: { persistSession: false } });

const buf = readFileSync(filePath);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
const parsed = parseSupportWorkbook(ab);
console.log('current', parsed.currentMonth, 'prev', parsed.prevMonth);

const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
const curEnd = lastDay(parsed.currentMonth.year, parsed.currentMonth.month);
const prevEnd = lastDay(parsed.prevMonth.year, parsed.prevMonth.month);

async function findRange(periodEnd: string, kind: string) {
  const { data } = await supabase.from('report_ranges').select('id, label').eq('period_end', periodEnd).eq('kind', kind).maybeSingle();
  return data;
}
const rangeByPeriod: Record<SupportPeriod, { id: string; label: string } | null> = {
  ytd: await findRange(curEnd, 'ytd'),
  month: await findRange(curEnd, 'month'),
  prevMonth: await findRange(prevEnd, 'month'),
};
console.log('range mapping:', Object.fromEntries(Object.entries(rangeByPeriod).map(([k, v]) => [k, v?.label ?? 'MISSING'])));

const rows = parsed.values.map((v) => {
  const r = rangeByPeriod[v.period];
  return r ? { range_id: r.id, bu_code: v.buCode, center: v.center, method: v.method, amount: v.amount } : null;
}).filter((r): r is NonNullable<typeof r> => r !== null);

// replace per (range,bu)
const touched = new Set(rows.map((r) => `${r.range_id}::${r.bu_code}`));
for (const key of touched) {
  const [rangeId, buCode] = key.split('::');
  await supabase.from('support_sim').delete().eq('range_id', rangeId).eq('bu_code', buCode);
}
const { error } = await supabase.from('support_sim').insert(rows);
if (error) throw error;
console.log('inserted', rows.length, 'support_sim rows');
