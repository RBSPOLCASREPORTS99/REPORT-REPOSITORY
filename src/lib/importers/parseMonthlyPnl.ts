import * as XLSX from 'xlsx';
import { parsePivotSheet, lookupValue, type ParsedPivot } from './parsePivotTab';
import { PULLS } from '../pnl/buConfig';

// Find the QuickBooks "P&L by Class" sheet in an uploaded workbook. A single-
// month export usually has one such sheet; a legacy BR workbook has several
// (we pick the one that looks like a single month, else the first valid one).
// A valid P&L-by-Class sheet has BU columns and a non-zero company "Total
// Income". Newer exports omit the literal "TOTAL" column, so we accept a
// company total summed from the top-level (ProfitCost Center) columns
// (lookupValue handles that fallback).
export function findPnlSheet(wb: XLSX.WorkBook): ParsedPivot | null {
  let firstValid: ParsedPivot | null = null;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const pivot = parsePivotSheet(ws, name);
    const totalIncome = lookupValue(pivot, PULLS.grossSales.hierCol, PULLS.grossSales.label, 'TOTAL');
    if (totalIncome !== 0 && !firstValid) firstValid = pivot;
  }
  return firstValid;
}

// Best-effort month detection from a sheet/file name — finds a month name (full
// or 3-letter abbreviation) and a 4-digit year anywhere in the string, e.g.
// "May 2026", "Jan 2026 P&L", "P&L by Class Jan 2026". Used to pre-fill the
// picker; the user can override.
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
export function detectMonthFromName(name: string): { year: number; month: number } | null {
  const s = name.toLowerCase();
  const yr = /\b(20\d{2})\b/.exec(s);
  if (!yr) return null;
  for (let i = 0; i < 12; i++) {
    const full = MONTHS[i];
    if (new RegExp(`\\b(${full}|${full.slice(0, 3)})\\b`).test(s)) {
      return { year: Number(yr[1]), month: i + 1 };
    }
  }
  return null;
}
