import * as XLSX from 'xlsx';
import { gffcAccount } from '../gffc/gffcExpenseConfig';

// GFFC Expense Report + Sales by Qty parsers (Phase 2). Both read from the same
// GFFC QuickBooks workbook the P&L comes from.

type Cell = string | number;
const serialToYm = (n: number) => {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
};

// ---- Expenses: "QB Exp Details" transactions -> per (year, month, account) ---
export interface GffcExpenseRow { year: number; month: number; account: string; section: string; controllable: boolean; amount: number }

// Locate the GFFC expense-transaction sheet by name ("QB Exp Details") or, for
// a standalone export, by its columns (Account + Amount). GFFC uses a single
// "Amount" column (not the POLCAS Debit/Credit split).
export function findGffcExpenseSheet(wb: XLSX.WorkBook): string | null {
  if (wb.SheetNames.includes('QB Exp Details')) return 'QB Exp Details';
  for (const name of wb.SheetNames) {
    const d = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' });
    for (let r = 0; r < Math.min(6, d.length); r++) {
      const row = (d[r] ?? []).map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''));
      if (row.includes('account') && row.includes('amount') && !row.includes('debit')) return name;
    }
  }
  return null;
}

// A standalone GFFC expense export: has the expense sheet AND its Class column
// references GFFC (Chickboy / a GFFC branch), distinguishing it from POLCAS.
export function isGffcExpenseWorkbook(wb: XLSX.WorkBook): boolean {
  const name = findGffcExpenseSheet(wb);
  if (!name) return false;
  const rows = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' });
  return rows.some((r) => (r ?? []).some((v) => typeof v === 'string' && /chickboy|calamanade|savemart|meat cutting/i.test(v)));
}

export function parseGffcExpense(wb: XLSX.WorkBook): GffcExpenseRow[] {
  const sheet = findGffcExpenseSheet(wb);
  const ws = sheet ? wb.Sheets[sheet] : undefined;
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: '' });

  // Locate the header row and the Date / Account / Amount columns.
  let hr = -1, dateCol = -1, acctCol = -1, amtCol = -1;
  for (let r = 0; r < Math.min(6, rows.length); r++) {
    const row = rows[r] ?? [];
    const find = (label: string) => row.findIndex((v) => typeof v === 'string' && v.trim().toLowerCase() === label);
    const d = find('date'), a = find('account'), m = find('amount');
    if (d >= 0 && a >= 0 && m >= 0) { hr = r; dateCol = d; acctCol = a; amtCol = m; break; }
  }
  if (hr === -1) return [];

  const agg = new Map<string, GffcExpenseRow>(); // year-month-account
  for (let r = hr + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const date = row[dateCol], account = row[acctCol], amount = row[amtCol];
    if (typeof date !== 'number' || typeof account !== 'string' || typeof amount !== 'number') continue;
    const acct = account.trim();
    if (!acct) continue;
    const { year, month } = serialToYm(date);
    const key = `${year}-${month}-${acct.toLowerCase()}`;
    const e = agg.get(key);
    if (e) { e.amount += amount; }
    else { const def = gffcAccount(acct); agg.set(key, { year, month, account: acct, section: def.section, controllable: def.controllable, amount }); }
  }
  return [...agg.values()];
}

// ---- Sales: "Sales by QTY" -> per (year, month, item) qty --------------------
export interface GffcSalesRow { year: number; month: number; category: string; item: string; uom: string; qty: number }

// Strip QuickBooks' duplicated "(…)" suffix from an item/category name.
const cleanName = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, '').trim();

export function parseGffcSales(wb: XLSX.WorkBook): GffcSalesRow[] {
  const ws = wb.Sheets['Sales by QTY'];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: '' });

  // Find the row of month date serials -> value columns.
  let monthCols: { col: number; year: number; month: number }[] = [];
  for (let r = 0; r < Math.min(8, rows.length); r++) {
    const cc: { col: number; year: number; month: number }[] = [];
    (rows[r] ?? []).forEach((v, c) => { if (typeof v === 'number' && v >= 20000 && v <= 80000) cc.push({ col: c, ...serialToYm(v) }); });
    if (cc.length > monthCols.length) monthCols = cc;
  }
  if (monthCols.length === 0) return [];
  const dataStart = Math.max(...monthCols.map(() => 0), 0);

  // Category -> U/M (from the "Total <category>" rows, col C = index 2).
  const uomByCat = new Map<string, string>();
  let cat = '';
  for (const row of rows) {
    const a = typeof row?.[0] === 'string' ? (row[0] as string).trim() : '';
    if (a && /^total\b/i.test(a)) {
      const uom = typeof row?.[2] === 'string' ? (row[2] as string).trim() : '';
      if (uom) uomByCat.set(cleanName(a.replace(/^total\s+/i, '')).toLowerCase(), uom);
    } else if (a) {
      cat = cleanName(a);
    }
  }

  const out: GffcSalesRow[] = [];
  cat = '';
  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const a = typeof row[0] === 'string' ? (row[0] as string).trim() : '';
    const b = typeof row[1] === 'string' ? (row[1] as string).trim() : '';
    if (a) { if (!/^total\b/i.test(a)) cat = cleanName(a); continue; }
    if (!b) continue; // not an item row
    const item = cleanName(b);
    const uom = uomByCat.get(cat.toLowerCase()) ?? '';
    for (const { col, year, month } of monthCols) {
      const q = row[col];
      if (typeof q === 'number') out.push({ year, month, category: cat, item, uom, qty: q });
    }
  }
  return out;
}
