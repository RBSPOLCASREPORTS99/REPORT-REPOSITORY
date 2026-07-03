import { readFileSync } from 'node:fs';
import { parseBrPnlWorkbook } from '../src/lib/importers/parseBrPnl';

const path = process.argv[2];
const buf = readFileSync(path);
const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;

const result = parseBrPnlWorkbook(arrayBuffer, path);

console.log('FILE:', result.fileName);
console.log('SKIPPED TABS:', result.skippedTabs.join(', '));
console.log('WARNINGS:');
result.warnings.forEach((w) => console.log(' -', w));
console.log('\nBU RESULTS:', result.buResults.length);
for (const b of result.buResults) {
  console.log(`\n=== ${b.buCode} (${b.buName}) [tab: ${b.sourceTab}] period=${b.period.year}-${b.period.month} ===`);
  console.log(`  YTD label: ${b.ytdLabel.prior} -> ${b.ytdLabel.current}`);
  console.log(`  lines parsed: ${b.lines.length}/22`);
  const netIncome = b.lines.find((l) => l.key === 'net_income');
  if (netIncome) {
    console.log('  NET INCOME blocks:', JSON.stringify(netIncome.blocks, null, 2));
  }
}
