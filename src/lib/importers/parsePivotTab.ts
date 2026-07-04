import * as XLSX from 'xlsx';

// A parsed QuickBooks "P&L by Class" pivot tab (e.g. the `2025`, `2026`,
// `May 2025`, `May 2026`, `April 2026` tabs in the BR workbook).
//
// Layout (confirmed by inspecting the real files):
//   row 0  -> column headers: BU / class names ("BU01 - Bodega 1",
//             "Total BU10 - TRUCK", "Admin", "Finance", "Human Resource",
//             "Management", "Total Support Cost Centers", "TOTAL", ...).
//   row 1  -> "(ProfitCost Center)" style subtitles (ignored).
//   row 2+ -> account rows. The account label sits in one of the hierarchy
//             columns A..G (0..6) depending on its depth:
//               col 0 (A): "Net Income"
//               col 1 (B): "Net Other Income", "Gross Profit"
//               col 3 (D): "Total Income", "Total COGS", "Total Expense"
//               col 4 (E): "Total Admin Expenses", "Total Finance Expenses", ...
//             Value columns start at H (index 7) and appear every other column.
//
// Money in these tabs is in FULL pesos (not thousands). Callers divide by 1000.

export interface PivotColumn {
  colIndex: number;
  header: string; // verbatim, e.g. "BU01 - Bodega 1" or "Total BU10 - TRUCK"
  subtitle: string; // row-1 marker, e.g. "(ProfitCost Center)" or "(BU01 - Bodega 1)"
  topLevel: boolean; // a top-level class column (ProfitCost Center), not a sub-account
}

export interface PivotRow {
  rowIndex: number;
  hierCol: number; // which of columns 0..6 holds the label
  label: string;
  values: Map<number, number>; // colIndex -> amount (full pesos)
}

export interface ParsedPivot {
  sheetName: string;
  columns: PivotColumn[];
  rows: PivotRow[];
  // fast lookup keyed by `${hierCol}::${label.toUpperCase()}`
  private_index: Map<string, PivotRow>;
}

type Cell = string | number;

function cellStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function parsePivotSheet(ws: XLSX.WorkSheet, sheetName: string): ParsedPivot {
  const data = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: '' });

  const header = data[0] ?? [];
  const subtitles = data[1] ?? []; // "(ProfitCost Center)" vs "(BU01 - Bodega 1)" (sub-account)
  const width = Math.max(header.length, subtitles.length);
  const columns: PivotColumn[] = [];
  for (let c = 0; c < width; c++) {
    const h0 = cellStr(header[c]);
    const subtitle = cellStr(subtitles[c]);
    // Grand-total / aggregate columns ("TOTAL", "Total ProfitCost Center",
    // "Total Support Cost Centers", "Unclassified") carry their label in the
    // subtitle row with a blank header cell — fall back to the subtitle.
    const h = h0 || subtitle;
    if (!h) continue;
    // A per-BU top-level class column is marked "(ProfitCost Center)" (in
    // parens) — distinct from the "Total ProfitCost Center" aggregate.
    const topLevel = subtitle.startsWith('(') && /profit.?cost.?center/i.test(subtitle);
    columns.push({ colIndex: c, header: h, subtitle, topLevel });
  }

  const rows: PivotRow[] = [];
  const index = new Map<string, PivotRow>();
  for (let r = 2; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;
    let hierCol = -1;
    let label = '';
    for (let c = 0; c <= 6; c++) {
      const s = cellStr(row[c]);
      if (s) {
        hierCol = c;
        label = s;
        break;
      }
    }
    if (hierCol === -1) continue;

    const values = new Map<number, number>();
    for (const col of columns) {
      const v = row[col.colIndex];
      if (typeof v === 'number') values.set(col.colIndex, v);
    }
    const pr: PivotRow = { rowIndex: r, hierCol, label, values };
    rows.push(pr);
    // Keep the first occurrence of each (hierCol,label) — matches XLOOKUP's
    // "first match" behavior used throughout the BR workbook.
    const key = `${hierCol}::${label.toUpperCase()}`;
    if (!index.has(key)) index.set(key, pr);
  }

  return { sheetName, columns, rows, private_index: index };
}

export function parsePivotWorkbookTabs(
  data: ArrayBuffer,
  tabNames: string[],
): Record<string, ParsedPivot> {
  const wb = XLSX.read(data, { type: 'array' });
  const out: Record<string, ParsedPivot> = {};
  for (const name of tabNames) {
    const ws = wb.Sheets[name];
    if (ws) out[name] = parsePivotSheet(ws, name);
  }
  return out;
}

// Resolve a column index from a header name. Exact (case-insensitive) first;
// then tolerate the newer QuickBooks export that rolls a BU's sub-accounts into
// a "Total <name>" column — so a requested "BU01 - Bodega 1" also resolves from
// "Total BU01 - Bodega 1" (and vice-versa), WITHOUT matching a "… - Other"
// sub-account (we only accept the exact with/without-"Total" variant).
export function findColumn(pivot: ParsedPivot, header: string): number | null {
  const up = header.toUpperCase();
  const exact = pivot.columns.find((c) => c.header.toUpperCase() === up);
  if (exact) return exact.colIndex;

  let variant: string | null = null;
  if (/^total\s/i.test(header)) variant = header.replace(/^total\s+/i, '');
  else variant = 'Total ' + header;
  const vUp = variant.toUpperCase();
  const m = pivot.columns.find((c) => c.header.toUpperCase() === vUp);
  return m ? m.colIndex : null;
}

// Look up a raw peso value at (hierCol, label, columnHeader). Missing -> 0.
// Special case: some exports omit the company-wide "TOTAL" column — for it we
// sum the value across the top-level (ProfitCost Center) columns instead.
export function lookupValue(
  pivot: ParsedPivot,
  hierCol: number,
  label: string,
  columnHeader: string,
): number {
  const row = pivot.private_index.get(`${hierCol}::${label.toUpperCase()}`);
  if (!row) return 0;
  const colIndex = findColumn(pivot, columnHeader);
  if (colIndex !== null) return row.values.get(colIndex) ?? 0;
  if (columnHeader.trim().toUpperCase() === 'TOTAL') {
    let sum = 0;
    for (const col of pivot.columns) if (col.topLevel) sum += row.values.get(col.colIndex) ?? 0;
    return sum;
  }
  return 0;
}
