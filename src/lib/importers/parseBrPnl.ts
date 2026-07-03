import * as XLSX from 'xlsx';
import { BUSINESS_UNITS, PNL_LINE_ITEMS } from '../constants';
import type { ComparisonPair } from '../constants';
import type { ComparisonValues, ParseBrPnlResult, ParsedBuPnl, PnlLineRow } from '../types';

const CANONICAL_BU_NAMES = new Map(BUSINESS_UNITS.map((bu) => [bu.code, bu.name]));

type Row = (string | number)[];

const MONTH_RANGE_RE = /^([A-Z]{3})-([A-Z]{3})\s(\d{2})$/i;
const EXCEL_DATE_MIN = 30000; // ~1982, generous lower bound for a P&L period column
const EXCEL_DATE_MAX = 60000; // ~2064

function cellStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function cellNum(row: Row, idx: number): number {
  const v = row[idx];
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

// Excel serial date -> {year, month} (1-indexed month), using the standard
// 1899-12-30 epoch (matches how Excel/QuickBooks exports store dates).
function periodFromSerial(serial: number): { year: number; month: number } {
  const epoch = Date.UTC(1899, 11, 30);
  const d = new Date(epoch + serial * 86400000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

interface HeaderInfo {
  rowIndex: number;
  ytdPriorCol: number;
  ytdCurrentCol: number;
  yoyPriorCol: number;
  yoyCurrentCol: number;
  momPriorCol: number;
  momCurrentCol: number;
  ytdDiffCol: number;
  ytdPctDiffCol: number;
  yoyDiffCol: number;
  yoyPctDiffCol: number;
  momDiffCol: number;
  momPctDiffCol: number;
  ytdPriorLabel: string;
  ytdCurrentLabel: string;
}

function findHeaderRow(rows: Row[]): { header: HeaderInfo; warnings: string[] } | null {
  const warnings: string[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const monthLabelCols: number[] = [];
    for (let c = 0; c < row.length; c++) {
      if (MONTH_RANGE_RE.test(cellStr(row[c]))) monthLabelCols.push(c);
    }
    if (monthLabelCols.length < 2) continue;

    const dateSerialCols: number[] = [];
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (typeof v === 'number' && v > EXCEL_DATE_MIN && v < EXCEL_DATE_MAX) dateSerialCols.push(c);
    }
    const diffCols: number[] = [];
    const pctDiffCols: number[] = [];
    for (let c = 0; c < row.length; c++) {
      const s = cellStr(row[c]).toUpperCase();
      if (s === 'DIFF') diffCols.push(c);
      if (s === '% DIFF') pctDiffCols.push(c);
    }

    if (dateSerialCols.length < 4) {
      warnings.push(`Header row ${r + 1}: expected 4 date-serial columns (YoY + MoM blocks), found ${dateSerialCols.length}.`);
      continue;
    }
    if (diffCols.length < 3 || pctDiffCols.length < 3) {
      warnings.push(`Header row ${r + 1}: expected 3 DIFF/% DIFF column pairs, found ${diffCols.length}/${pctDiffCols.length}.`);
      continue;
    }

    const [ytdPriorCol, ytdCurrentCol] = monthLabelCols;
    const [yoyPriorCol, yoyCurrentCol, momPriorCol, momCurrentCol] = dateSerialCols;
    const [ytdDiffCol, yoyDiffCol, momDiffCol] = diffCols;
    const [ytdPctDiffCol, yoyPctDiffCol, momPctDiffCol] = pctDiffCols;

    return {
      warnings,
      header: {
        rowIndex: r,
        ytdPriorCol,
        ytdCurrentCol,
        yoyPriorCol,
        yoyCurrentCol,
        momPriorCol,
        momCurrentCol,
        ytdDiffCol,
        ytdPctDiffCol,
        yoyDiffCol,
        yoyPctDiffCol,
        momDiffCol,
        momPctDiffCol,
        ytdPriorLabel: cellStr(row[ytdPriorCol]),
        ytdCurrentLabel: cellStr(row[ytdCurrentCol]),
      },
    };
  }
  return null;
}

function readBlock(row: Row, priorCol: number, currentCol: number, diffCol: number, pctDiffCol: number): ComparisonValues {
  return {
    prior: cellNum(row, priorCol),
    priorPct: cellNum(row, priorCol + 1),
    current: cellNum(row, currentCol),
    currentPct: cellNum(row, currentCol + 1),
    diff: cellNum(row, diffCol),
    pctDiff: cellNum(row, pctDiffCol),
  };
}

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface BuIdentity {
  buCode: string;
  buName: string;
  titleRows: number[]; // rows consumed by the title block, so line-item scan starts after them
}

function deriveBuIdentity(sheetName: string, rows: Row[]): BuIdentity | null {
  const name = sheetName.trim();

  // Scan the first ~10 rows for title cells like "BU05 - TRADING" or "BU04 - WOODEN PALLETS".
  // Keep only the first occurrence per BU number — the same "BU01 - Bodega 1"
  // style text also shows up again as a sub-label inside the GROSS SALES data
  // row, which would otherwise double-count the title.
  const seenNums = new Set<string>();
  const titleCandidates: { row: number; col: number; text: string; num: string }[] = [];
  for (let r = 0; r < Math.min(10, rows.length); r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const s = cellStr(rows[r][c]);
      const m = /^BU\s?(\d{2})\s*-\s*(.+)$/i.exec(s);
      if (m && !seenNums.has(m[1])) {
        seenNums.add(m[1]);
        titleCandidates.push({ row: r, col: c, text: m[2].trim(), num: m[1] });
      }
    }
  }

  const combined = /^BU\s?(\d{2})\s*&\s*BU\s?(\d{2})\s*P&L$/i.exec(name);
  if (combined) {
    const nums = [combined[1], combined[2]].sort();
    const code = `BU${nums[0]}${nums[1]}`;
    const parts = titleCandidates
      .filter((t) => nums.includes(t.num))
      .map((t) => toTitleCase(t.text));
    const buName = parts.length ? parts.join(' & ') : `BU${nums[0]} & BU${nums[1]}`;
    return { buCode: code, buName, titleRows: titleCandidates.map((t) => t.row) };
  }

  const child = /^BU\s?(\d{2})\s+(PH|LF)\s*P&L$/i.exec(name);
  if (child) {
    const num = child[1];
    const suffix = child[2].toUpperCase();
    const code = `BU${num}${suffix}`;
    const title = titleCandidates.find((t) => t.num === num);
    const buName = title ? toTitleCase(title.text) : `BU${num} ${suffix}`;
    return { buCode: code, buName, titleRows: title ? [title.row] : [] };
  }

  const single = /^BU\s?(\d{2})\s*P&L$/i.exec(name);
  if (single) {
    const num = single[1];
    const code = `BU${num}`;
    const title = titleCandidates.find((t) => t.num === num);
    const buName = title ? toTitleCase(title.text) : `BU${num}`;
    return { buCode: code, buName, titleRows: title ? [title.row] : [] };
  }

  return null;
}

function parseSheet(sheetName: string, ws: XLSX.WorkSheet): { result?: ParsedBuPnl; skip?: boolean; warning?: string } {
  const rows = XLSX.utils.sheet_to_json<Row>(ws, { header: 1, raw: true, defval: '' });

  const identity = deriveBuIdentity(sheetName, rows);
  if (!identity) {
    return { skip: true, warning: `Tab "${sheetName}" looks like a P&L tab but its BU code could not be determined from the tab name — skipped.` };
  }

  const found = findHeaderRow(rows);
  if (!found) {
    return { skip: true, warning: `Tab "${sheetName}": could not locate the comparison-period header row — skipped.` };
  }
  const { header, warnings } = found;

  const currentFromMom = periodFromSerial(header.momCurrentCol >= 0 ? cellNum(rows[header.rowIndex], header.momCurrentCol) : 0);
  const currentFromYoy = periodFromSerial(cellNum(rows[header.rowIndex], header.yoyCurrentCol));
  if (currentFromMom.year !== currentFromYoy.year || currentFromMom.month !== currentFromYoy.month) {
    warnings.push(
      `Tab "${sheetName}": same-month-last-year and month-over-month blocks disagree on the "current" period (${currentFromYoy.year}-${currentFromYoy.month} vs ${currentFromMom.year}-${currentFromMom.month}). Using ${currentFromMom.year}-${currentFromMom.month}.`,
    );
  }
  const period = currentFromMom;
  const priorMonthPeriod = periodFromSerial(cellNum(rows[header.rowIndex], header.momPriorCol));
  const priorYearPeriod = periodFromSerial(cellNum(rows[header.rowIndex], header.yoyPriorCol));

  const lines: PnlLineRow[] = [];
  let cursor = header.rowIndex + 1;
  for (const item of PNL_LINE_ITEMS) {
    let matchedRow = -1;
    for (let r = cursor; r < rows.length; r++) {
      const col0 = cellStr(rows[r][0]).toUpperCase();
      const col1 = cellStr(rows[r][1]).toUpperCase();
      if (item.matches.includes(col0) || item.matches.includes(col1)) {
        matchedRow = r;
        break;
      }
    }
    if (matchedRow === -1) {
      warnings.push(`Tab "${sheetName}": line item "${item.label}" not found.`);
      continue;
    }
    cursor = matchedRow + 1;
    const row = rows[matchedRow];
    const blocks: Partial<Record<ComparisonPair, ComparisonValues>> = {
      YTD: readBlock(row, header.ytdPriorCol, header.ytdCurrentCol, header.ytdDiffCol, header.ytdPctDiffCol),
      YOY_MONTH: readBlock(row, header.yoyPriorCol, header.yoyCurrentCol, header.yoyDiffCol, header.yoyPctDiffCol),
      MOM: readBlock(row, header.momPriorCol, header.momCurrentCol, header.momDiffCol, header.momPctDiffCol),
    };
    lines.push({ key: item.key, label: item.label, blocks });
  }

  return {
    result: {
      buCode: identity.buCode,
      buName: CANONICAL_BU_NAMES.get(identity.buCode) ?? identity.buName,
      sourceTab: sheetName,
      period,
      priorMonthPeriod,
      priorYearPeriod,
      ytdLabel: { prior: header.ytdPriorLabel, current: header.ytdCurrentLabel },
      lines,
      warnings,
    },
  };
}

export function parseBrPnlWorkbook(data: ArrayBuffer, fileName: string): ParseBrPnlResult {
  const wb = XLSX.read(data, { type: 'array' });
  const buResults: ParsedBuPnl[] = [];
  const skippedTabs: string[] = [];
  const warnings: string[] = [];

  for (const sheetName of wb.SheetNames) {
    if (!/P&L/i.test(sheetName)) {
      skippedTabs.push(sheetName);
      continue;
    }
    const ws = wb.Sheets[sheetName];
    const { result, skip, warning } = parseSheet(sheetName, ws);
    if (skip) {
      skippedTabs.push(sheetName);
      if (warning) warnings.push(warning);
      continue;
    }
    if (result) {
      buResults.push(result);
      warnings.push(...result.warnings);
    }
  }

  // Flag any BU tab whose detected period differs from the majority — this is
  // exactly the real-world case where one tab (e.g. BU04) lags behind because
  // Finance hasn't refreshed it for the current month yet.
  if (buResults.length > 1) {
    const counts = new Map<string, number>();
    for (const b of buResults) {
      const k = `${b.period.year}-${b.period.month}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    for (const b of buResults) {
      const k = `${b.period.year}-${b.period.month}`;
      if (k !== majority) {
        warnings.push(
          `"${b.sourceTab}" (${b.buName}) reports period ${k}, but most other tabs report ${majority}. This tab may not have been updated for the current month yet.`,
        );
      }
    }
  }

  return { fileName, buResults, skippedTabs, warnings };
}
