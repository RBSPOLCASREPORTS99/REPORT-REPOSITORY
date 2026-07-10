import * as XLSX from 'xlsx';
import { GFFC_INPUTS } from '../gffc/gffcConfig';

// Parse GFFC's QuickBooks "P&L 2025" / "P&L 2026" sheets into additive monthly
// inputs. These are standard (non-by-class) QB P&L sheets with month columns:
//   - "P&L 2026": header row 0, months every 2 cols (Jan 26, Feb 26, …), no %.
//   - "P&L 2025": header row 1, months every 4 cols with a "% of Income" column
//     between (ignored), plus a range TOTAL column (ignored).
// We locate the month columns by their "Mon YY" headers and pull each configured
// line by its QuickBooks label.

export interface GffcMonthInputs {
  year: number;
  month: number;
  lines: Record<string, number>; // line_key -> amount
}

const MONTHS3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// "Jan 26", "Aug 25", "Aug '25" -> {year, month}; ranges/labels -> null.
function parseMonthHeader(s: string): { year: number; month: number } | null {
  const m = /^([a-z]{3})\s*'?(\d{2})$/i.exec(s.trim());
  if (!m) return null;
  const mi = MONTHS3.indexOf(m[1].toLowerCase());
  if (mi < 0) return null;
  return { year: 2000 + Number(m[2]), month: mi + 1 };
}

type Cell = string | number;

function parseSheet(ws: XLSX.WorkSheet): GffcMonthInputs[] {
  const rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: '' });

  // Find the header row = the row with the most "Mon YY" cells, and its month cols.
  let headerRow = -1;
  let monthCols: { col: number; year: number; month: number }[] = [];
  for (let r = 0; r < Math.min(6, rows.length); r++) {
    const cols: { col: number; year: number; month: number }[] = [];
    (rows[r] ?? []).forEach((v, c) => {
      if (typeof v === 'string') {
        const ym = parseMonthHeader(v);
        if (ym) cols.push({ col: c, ...ym });
      }
    });
    if (cols.length > monthCols.length) { monthCols = cols; headerRow = r; }
  }
  if (headerRow === -1 || monthCols.length === 0) return [];

  // Index account rows by label (first occurrence) -> its cell values.
  const byLabel = new Map<string, Cell[]>();
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    let label = '';
    for (let c = 0; c <= 6; c++) { const s = typeof row[c] === 'string' ? (row[c] as string).trim() : ''; if (s) { label = s; break; } }
    if (label && !byLabel.has(label.toUpperCase())) byLabel.set(label.toUpperCase(), row);
  }

  const valueAt = (qbLabel: string, col: number): number => {
    const row = byLabel.get(qbLabel.toUpperCase());
    const v = row?.[col];
    return typeof v === 'number' ? v : 0;
  };

  return monthCols.map(({ col, year, month }) => {
    const lines: Record<string, number> = {};
    for (const inp of GFFC_INPUTS) lines[inp.key] = valueAt(inp.qbLabel, col);
    return { year, month, lines };
  });
}

export function isGffcWorkbook(wb: XLSX.WorkBook): boolean {
  const n = wb.SheetNames;
  return n.includes('GFFC TOTAL P&L') || (n.includes('P&L 2026') && n.some((s) => s.startsWith('P&L per CLASS')));
}

// Parse all months from P&L 2025 + P&L 2026 (overlaps deduped by the caller's
// upsert; later-parsed months win).
export function parseGffcPnl(data: ArrayBuffer): GffcMonthInputs[] {
  const wb = XLSX.read(data, { type: 'array' });
  const out: GffcMonthInputs[] = [];
  for (const name of ['P&L 2025', 'P&L 2026']) {
    const ws = wb.Sheets[name];
    if (ws) out.push(...parseSheet(ws));
  }
  return out;
}
