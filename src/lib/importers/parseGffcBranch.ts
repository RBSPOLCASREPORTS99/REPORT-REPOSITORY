import * as XLSX from 'xlsx';

// Parse GFFC's "P&L per CLASS <month>" sheets (one per month) into per-branch
// base P&L lines. Branches are the class columns (Calamanade, Main Branch, Meat
// Cutting Plant, Savemart Branch, Chickboy Meating Place); Total/Finance columns
// are excluded (the viewer derives the Total as the sum of branches).

export interface GffcBranchRow {
  year: number;
  month: number;
  branch: string;
  lineKey: string;
  amount: number; // full pesos
}

// line_key → the QuickBooks "Total …" row label to pull for each branch column.
const BRANCH_LINES: { key: string; qb: string }[] = [
  { key: 'gross_sales', qb: 'total income' },
  { key: 'cogs', qb: 'total cogs' },
  { key: 'admin', qb: 'total admin expense' },
  { key: 'finance', qb: 'total finance expense' },
  { key: 'operations', qb: 'total operation expense' },
  { key: 'repairs', qb: 'total repairs and maintenance' },
  { key: 'salaries', qb: 'total salaries and wages' },
  { key: 'other_income', qb: 'net other income' },
];

const MONTHS3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function monthFromSheetName(name: string): { year: number; month: number } | null {
  const m = /P&L per CLASS\s+([A-Za-z]+)\s+(\d{4})/i.exec(name);
  if (!m) return null;
  const mi = MONTHS3.indexOf(m[1].toLowerCase().slice(0, 3));
  if (mi < 0) return null;
  return { year: Number(m[2]), month: mi + 1 };
}

export function parseGffcBranchPnl(wb: XLSX.WorkBook): GffcBranchRow[] {
  const out: GffcBranchRow[] = [];
  for (const name of wb.SheetNames) {
    const ym = monthFromSheetName(name);
    if (!ym) continue;
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' });
    if (rows.length === 0) continue;

    // Branch columns = header (row 0) cells that name a class, excluding the
    // Total / Finance / grand-total columns.
    const header = rows[0] ?? [];
    const branchCols: { col: number; branch: string }[] = [];
    header.forEach((v, c) => {
      const s = typeof v === 'string' ? v.trim() : '';
      if (s && !/^total\b|finance/i.test(s) && !/^total$/i.test(s)) branchCols.push({ col: c, branch: s });
    });
    if (branchCols.length === 0) continue;

    for (const row of rows) {
      let label = '';
      for (let c = 0; c <= 6; c++) { const s = typeof row[c] === 'string' ? (row[c] as string).trim() : ''; if (s) { label = s; break; } }
      const def = BRANCH_LINES.find((d) => label.toLowerCase() === d.qb);
      if (!def) continue;
      for (const { col, branch } of branchCols) {
        const v = row[col];
        if (typeof v === 'number' && v !== 0) out.push({ year: ym.year, month: ym.month, branch, lineKey: def.key, amount: v });
      }
    }
  }
  return out;
}
