import * as XLSX from 'xlsx';

// Parse the "PAC Purchases by BU" workbook: a single sheet with one block per
// Business Unit — the BU name in a header cell and that BU's purchases total two
// columns to its right. Totals rows are skipped. Amounts are in FULL pesos (the
// persist step converts to ₱'000 to match the P&L). Returns the app's BU codes.

export interface ParsedBuPurchases {
  byBu: Record<string, number>; // app BU code -> purchases (full pesos)
  total: number; // grand total across all BU columns (full pesos)
  rawColumns: { name: string; bu: string | null; amount: number }[]; // for preview
}

// Map a purchases-file column header (e.g. "BU01 - Bodega 1") to the app BU code.
// BU01 + BU02 roll up to BU0102 and BU08 to the Packhouse (BU08PH), exactly as
// the P&L compute keys them. BU06 is recognised but excluded from the Cost of
// Money allocation (handled at persist); BU10/BU04 carry no purchases.
export function mapPurchaseColumn(name: string): string | null {
  if (/BU01/.test(name)) return 'BU0102';
  if (/BU02/.test(name)) return 'BU0102';
  if (/BU04/.test(name)) return 'BU04';
  if (/BU05/.test(name)) return 'BU05';
  if (/BU06/.test(name)) return 'BU06';
  if (/BU07/.test(name)) return 'BU07';
  if (/BU08/.test(name)) return 'BU08PH';
  if (/BU09/.test(name)) return 'BU09';
  if (/BU10/.test(name)) return 'BU10';
  if (/BU11/.test(name)) return 'BU11';
  return null;
}

export function parseBuPurchases(buffer: ArrayBuffer): ParsedBuPurchases {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets['Sheet1'] ?? wb.Sheets[wb.SheetNames[0]];
  const r = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: true, defval: '' });
  if (r.length === 0) return { byBu: {}, total: 0, rawColumns: [] };

  // Header row 0: each non-empty BU label sits at column c, its amount at c+2.
  const header = r[0] ?? [];
  const cols: { name: string; col: number }[] = [];
  for (let c = 0; c < header.length; c++) {
    const v = String(header[c] ?? '').trim();
    if (v && /BU\d{2}/i.test(v)) cols.push({ name: v, col: c + 2 });
  }

  // Deepest (most-indented) label in a data row's first few columns, to detect
  // and skip "Total ..." rows the same way the P&L parser does.
  const deepest = (a: (string | number)[]) => {
    for (let c = 3; c >= 1; c--) { const v = String(a[c] ?? '').trim(); if (v) return v; }
    return '';
  };

  const rawByCol: Record<string, number> = {};
  for (const { name } of cols) rawByCol[name] = 0;
  for (let i = 1; i < r.length; i++) {
    const a = r[i] ?? [];
    const lab = deepest(a);
    if (/^total/i.test(lab)) continue; // skip subtotal / grand-total rows
    for (const { name, col } of cols) {
      const val = a[col];
      if (typeof val === 'number' && Number.isFinite(val)) rawByCol[name] += val;
    }
  }

  const byBu: Record<string, number> = {};
  const rawColumns: { name: string; bu: string | null; amount: number }[] = [];
  let total = 0;
  for (const { name } of cols) {
    const amt = rawByCol[name];
    const bu = mapPurchaseColumn(name);
    rawColumns.push({ name, bu, amount: amt });
    total += amt;
    if (bu) byBu[bu] = (byBu[bu] ?? 0) + amt;
  }
  return { byBu, total, rawColumns };
}
