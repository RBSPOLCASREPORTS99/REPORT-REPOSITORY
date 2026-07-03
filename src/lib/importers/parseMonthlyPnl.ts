import * as XLSX from 'xlsx';
import { parsePivotSheet, findColumn, lookupValue, type ParsedPivot } from './parsePivotTab';
import { PULLS } from '../pnl/buConfig';

// Find the QuickBooks "P&L by Class" sheet in an uploaded workbook. A single-
// month export usually has one such sheet; a legacy BR workbook has several
// (we pick the one that looks like a single month, else the first valid one).
// A valid P&L-by-Class sheet has a "TOTAL" column and a "Total Income" row.
export function findPnlSheet(wb: XLSX.WorkBook): ParsedPivot | null {
  let firstValid: ParsedPivot | null = null;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const pivot = parsePivotSheet(ws, name);
    const hasTotal = findColumn(pivot, 'TOTAL') !== null;
    const totalIncome = lookupValue(pivot, PULLS.grossSales.hierCol, PULLS.grossSales.label, 'TOTAL');
    if (hasTotal && totalIncome !== 0) {
      if (!firstValid) firstValid = pivot;
    }
  }
  return firstValid;
}

// Best-effort month detection from a sheet name like "May 2026" (used to
// pre-fill the picker; the user can override).
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
export function detectMonthFromName(name: string): { year: number; month: number } | null {
  const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(name.trim());
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1].toLowerCase());
  if (mi < 0) return null;
  return { year: Number(m[2]), month: mi + 1 };
}
