import { findColumn, type ParsedPivot } from '../importers/parsePivotTab';

// The BU10 - TRUCKING fleet shown in the Simulated P&L per Truck. Each truck is
// identified across three sources by its PLATE number:
//   - QuickBooks "P&L by Class" column: "BU10 - <plate> <code>" (expenses)
//   - TRUCKING DASHBOARD "Sales per Truck" row: keyed by plate (income)
//   - the finished SIM P&L sheet: keyed by code (WV01… / CT01…)
export interface TruckDef {
  code: string;  // short code used as the display/label (WV01, CT01, …)
  plate: string; // plate number — the universal join key across sources
}

export const TRUCKS: TruckDef[] = [
  { code: 'WV01', plate: 'CAD8043' },
  { code: 'WV02', plate: 'CAY4926' },
  { code: 'WV03', plate: 'CBN4192' },
  { code: 'WV04', plate: 'MAM1345' },
  { code: 'WV05', plate: 'MAU6759' },
  { code: 'WV06', plate: 'CBS4170' },
  { code: 'CT01', plate: 'CCE3645' },
  { code: 'CT02', plate: 'JAD6951' },
  { code: 'CT03', plate: 'CBR9033' },
];

const byPlate = new Map(TRUCKS.map((t) => [t.plate.toUpperCase(), t]));
export function truckByPlate(plate: string): TruckDef | undefined {
  return byPlate.get(plate.trim().toUpperCase());
}

// Find the QB pivot column header for a truck. QB headers embed the plate, e.g.
// "BU10 - CAD8043 WV1" or "BU10 - CT01 CCE3645", so we match on the plate.
export function truckPivotColumn(pivot: ParsedPivot, plate: string): string | null {
  const p = plate.trim().toUpperCase();
  const col = pivot.columns.find((c) => c.header.toUpperCase().includes(p));
  return col ? col.header : null;
}

// The expense sections of a QB "P&L by Class" pivot, in display order. COGS sits
// above Gross Profit; the rest are grouped under Total Expense.
export const TRUCK_SECTIONS = [
  'Cost of Goods Sold', 'Admin Expenses', 'Finance Expenses',
  'Operations Expenses', 'Repairs/Maintenance', 'Salaries and Wages',
] as const;

export interface TruckAccount { section: string; account: string; amount: number }

// Walk a QB pivot and pull one truck column's LEAF expense accounts (grouped by
// section, ₱'000). Income is excluded (it comes from the dashboard). Section
// headers and "Total …" subtotals are skipped; the remaining leaves sum back to
// each section total (verified: Operations leaves = 24,666.57 for WV01 May).
export function extractTruckAccounts(pivot: ParsedPivot, columnHeader: string): TruckAccount[] {
  const colIndex = findColumn(pivot, columnHeader);
  if (colIndex === null) return [];
  const isTotal = (s: string) => /^total\b/i.test(s.trim());
  const out: TruckAccount[] = [];
  let section: string | null = null;
  let sectionHier = 99;
  let inExpense = false;

  for (const row of pivot.rows) {
    const label = row.label.trim();
    const h = row.hierCol;
    const val = row.values.get(colIndex) ?? 0;

    if (h === 3) { // top-level: Income / Cost of Goods Sold / Expense / totals
      if (isTotal(label)) section = null;
      else if (/^income$/i.test(label)) { section = null; inExpense = false; }
      else if (/^cost of goods sold$/i.test(label)) { section = 'Cost of Goods Sold'; sectionHier = 3; inExpense = false; }
      else if (/^expense$/i.test(label)) { inExpense = true; section = null; }
      else section = null;
      continue;
    }
    if (h === 4 && inExpense) { // expense sub-section header or its total
      section = isTotal(label) ? null : label;
      sectionHier = 4;
      continue;
    }
    if (h === 4 && section === 'Cost of Goods Sold') { // COGS leaf accounts (at E)
      if (isTotal(label)) { section = null; continue; }
      if (val !== 0) out.push({ section, account: label, amount: val / 1000 });
      continue;
    }
    // Leaf accounts within an expense section (deeper than the section header).
    if (section && inExpense && h > sectionHier && !isTotal(label) && val !== 0) {
      out.push({ section, account: label, amount: val / 1000 });
    }
  }
  return out;
}
