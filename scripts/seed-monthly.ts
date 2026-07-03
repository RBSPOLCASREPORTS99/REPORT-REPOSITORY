// Test the monthly-P&L model: clear old data, import April + May 2026 as months
// (extracted from the BR workbook's single-month tabs), and derive ranges.
// Usage: npx tsx scripts/seed-monthly.ts <br-xlsx> <url> <serviceKeyFile>
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { parsePivotSheet } from '../src/lib/importers/parsePivotTab';
import { extractBuInputs, extractPools } from '../src/lib/pnl/computeBuPnl';
import { deriveRanges } from '../src/lib/pnl/deriveRanges';
import { BU_CONFIGS, TRUCKING_CODES } from '../src/lib/pnl/buConfig';

const [, , filePath, url, keyFile] = process.argv;
const db = createClient(url, readFileSync(keyFile, 'utf8').trim(), { auth: { persistSession: false } });

const buf = readFileSync(filePath);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
const wb = XLSX.read(ab, { type: 'array' });

// Clear everything so we test the monthly model cleanly.
for (const t of ['computed_pnl', 'report_ranges', 'support_sim', 'expense_lines', 'sales_qty_lines',
  'monthly_trucking', 'monthly_pnl_inputs', 'monthly_pnl_pools', 'pnl_months']) {
  await db.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
}
console.log('cleared old data');

// Read the company-wide trucking block from a standard finished BU tab (per code).
function readTrucking(tabName: string, col: number): Record<string, number> {
  const d = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[tabName], { header: 1, raw: true, defval: '' });
  const out: Record<string, number> = {};
  for (const row of d) {
    const code = (row[0] ?? '').toString().trim();
    if (TRUCKING_CODES.includes(code) && typeof row[col] === 'number') out[code] = row[col] as number;
  }
  return out;
}

// (tab, year, month, truckingColumn in the BU01&BU02 finished tab)
const monthsToImport = [
  { tab: 'April 2026', year: 2026, month: 4, truckCol: 21 }, // MoM prior col = April
  { tab: 'May 2026', year: 2026, month: 5, truckCol: 15 },   // current month col = May
];

for (const mi of monthsToImport) {
  const pivot = parsePivotSheet(wb.Sheets[mi.tab], mi.tab);
  const trucking = readTrucking('BU01 & BU02 P&L', mi.truckCol);

  const { data: month } = await db.from('pnl_months')
    .insert({ year: mi.year, month: mi.month, label: `${mi.tab}` }).select('id').single();
  const monthId = month!.id;

  const inputRows = BU_CONFIGS.filter((c) => !c.manualEntry).map((cfg) => ({ month_id: monthId, bu_code: cfg.buCode, ...extractBuInputs(pivot, cfg) }));
  await db.from('monthly_pnl_inputs').insert(inputRows);
  await db.from('monthly_pnl_pools').insert({ month_id: monthId, ...extractPools(pivot) });
  const tRows = TRUCKING_CODES.map((code) => ({ month_id: monthId, trucking_code: code, amount: trucking[code] ?? 0 })).filter((r) => r.amount !== 0);
  if (tRows.length) await db.from('monthly_trucking').insert(tRows);
  console.log(`imported ${mi.tab} (${inputRows.length} BU inputs, ${tRows.length} trucking rows)`);
}

const { ranges } = await deriveRanges(db, 2026);
console.log('derived', ranges, 'ranges for 2026');

// Publish all derived ranges + verify.
await db.from('report_ranges').update({ is_published: true }).eq('is_published', false);
const { data: check } = await db.from('report_ranges').select('id, label, kind').order('period_end');
console.log('ranges:', (check ?? []).map((r) => `${r.label} [${r.kind}]`).join(' | '));

for (const label of ['May 2026', 'April 2026']) {
  const r = (check ?? []).find((x) => x.label === label);
  if (!r) continue;
  const { data: ni } = await db.from('computed_pnl').select('amount').eq('range_id', r.id).eq('bu_code', 'BU0102').eq('line_item', 'net_income').single();
  console.log(`  BU0102 ${label} Net Income = ${Number(ni!.amount).toFixed(3)}`);
}
const ytd = (check ?? []).find((x) => x.label === 'YTD May 2026');
if (ytd) {
  const { data: ni } = await db.from('computed_pnl').select('amount').eq('range_id', ytd.id).eq('bu_code', 'BU0102').eq('line_item', 'net_income').single();
  const { data: gs } = await db.from('computed_pnl').select('amount').eq('range_id', ytd.id).eq('bu_code', 'BU0102').eq('line_item', 'gross_sales').single();
  console.log(`  BU0102 YTD May 2026 (Apr+May): Net Income = ${Number(ni!.amount).toFixed(3)}, Gross Sales = ${Number(gs!.amount).toFixed(3)}`);
}
