// Ground-truth gate: compute each BU's P&L from the RAW pivot tabs and assert
// it matches the FINISHED per-BU tab (parsed with the legacy parseBrPnl) to the
// peso, across all three comparison blocks. Run:
//   npx tsx scripts/validate-compute.ts "<path to BR per BU ....xlsx>"
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { parsePivotSheet } from '../src/lib/importers/parsePivotTab';
import { parseBrPnlWorkbook } from '../src/lib/importers/parseBrPnl';
import { computeSide, combineSides, type TruckingInputs } from '../src/lib/pnl/computeBuPnl';
import { BU_CONFIGS, TRUCKING_CODES } from '../src/lib/pnl/buConfig';

const path = process.argv[2];
const buf = readFileSync(path);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
const wb = XLSX.read(ab, { type: 'array' });

// Raw pivots feeding each of the 5 period columns.
const pivots = {
  ytdPrior: parsePivotSheet(wb.Sheets['2025'], '2025'),
  ytdCurrent: parsePivotSheet(wb.Sheets['2026'], '2026'),
  yoyPrior: parsePivotSheet(wb.Sheets['May 2025'], 'May 2025'),
  monthCurrent: parsePivotSheet(wb.Sheets['May 2026'], 'May 2026'),
  momPrior: parsePivotSheet(wb.Sheets['April 2026'], 'April 2026'),
};

// Finished values (expected) from the legacy parser.
const finished = parseBrPnlWorkbook(ab, path);
const finishedByCode = new Map(finished.buResults.map((b) => [b.buCode, b]));

// Read the manual trucking inputs from a finished BU tab's trucking block
// (rows ~58-70). Columns: F(idx5)=YTD prior, H(7)=YTD current, N(13)=YoY prior,
// P(15)=month current, V(21)=MoM prior. Returns one map per period column.
function readTruckingInputs(sheetName: string) {
  const ws = wb.Sheets[sheetName];
  const d = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, raw: true, defval: '' });
  const cols = { ytdPrior: 5, ytdCurrent: 7, yoyPrior: 13, monthCurrent: 15, momPrior: 21 };
  const out: Record<keyof typeof cols, TruckingInputs> = {
    ytdPrior: {}, ytdCurrent: {}, yoyPrior: {}, monthCurrent: {}, momPrior: {},
  };
  for (let r = 0; r < d.length; r++) {
    const code = (d[r][0] ?? '').toString().trim();
    if (!TRUCKING_CODES.includes(code)) continue;
    for (const key of Object.keys(cols) as (keyof typeof cols)[]) {
      const v = d[r][cols[key]];
      if (typeof v === 'number') out[key][code] = v;
    }
  }
  return out;
}

const COMPARISONS = [
  { name: 'YTD', current: 'ytdCurrent', prior: 'ytdPrior', tCur: 'ytdCurrent', tPri: 'ytdPrior' },
  { name: 'YOY_MONTH', current: 'monthCurrent', prior: 'yoyPrior', tCur: 'monthCurrent', tPri: 'yoyPrior' },
  { name: 'MOM', current: 'monthCurrent', prior: 'momPrior', tCur: 'monthCurrent', tPri: 'momPrior' },
] as const;

const TOL = 0.01; // ₱ '000 (i.e. ₱10). Excel carries more precision on allocations.
let failures = 0;
let checks = 0;

for (const cfg of BU_CONFIGS) {
  if (cfg.manualEntry) {
    console.log(`\n### ${cfg.buCode} (${cfg.buName}) — manual entry, skipped`);
    continue;
  }
  const exp = finishedByCode.get(cfg.buCode);
  if (!exp) {
    console.log(`\n### ${cfg.buCode} — no finished tab found, skipped`);
    continue;
  }
  // BU04 runs a month behind in the finished file (different period columns),
  // so it can't be validated against these 5 standard pivots.
  if (cfg.buCode === 'BU04') {
    console.log(`\n### ${cfg.buCode} — month-behind in source, skipped from peso-check`);
    continue;
  }

  const trucking = readTruckingInputs(exp.sourceTab);
  console.log(`\n### ${cfg.buCode} (${cfg.buName})`);
  for (const cmp of COMPARISONS) {
    const cur = computeSide(pivots[cmp.current], cfg, trucking[cmp.tCur]);
    const pri = computeSide(pivots[cmp.prior], cfg, trucking[cmp.tPri]);
    const computed = combineSides(cur, pri);
    const expLines = new Map(exp.lines.map((l) => [l.key, l]));

    for (const line of computed) {
      const e = expLines.get(line.key);
      if (!e) continue;
      const eBlock = e.blocks[cmp.name as 'YTD' | 'YOY_MONTH' | 'MOM'];
      if (!eBlock) continue;
      const c = line.blocks.SINGLE!;
      for (const field of ['current', 'prior', 'diff'] as const) {
        checks++;
        const delta = Math.abs((c[field] ?? 0) - (eBlock[field] ?? 0));
        if (delta > TOL) {
          failures++;
          console.log(
            `  MISMATCH ${cmp.name} ${line.key}.${field}: computed=${c[field].toFixed(4)} expected=${eBlock[field].toFixed(4)} Δ=${delta.toFixed(4)}`,
          );
        }
      }
    }
  }
  console.log(`  ...checked`);
}

console.log(`\n==== ${checks} checks, ${failures} mismatches ====`);
process.exit(failures > 0 ? 1 : 0);
