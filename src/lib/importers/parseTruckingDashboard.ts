import * as XLSX from 'xlsx';
import { truckByPlate } from '../pnl/truckConfig';

// The TRUCKING DASHBOARD workbook holds long monthly time-series per truck and
// per BU. We read two sheets:
//   "Sales per Truck" — trucking income per truck (rows keyed by plate)
//   "Sales per BU"    — trucking allocation per BU (rows keyed by BU code)
// Both share the same layout: row index 3 (Excel row 4) holds each month's
// start-date serial across the columns; data rows carry the key in column A.

const HEADER_ROW = 3; // 0-based: the row of month start-date serials
const KEY_COL = 0;    // column A holds the plate / BU code

export interface DashboardMonth { year: number; month: number; serial: number }

export interface ParsedDashboard {
  months: DashboardMonth[];
  // serial -> { truckCode|buCode -> amount }
  truckIncome: Map<number, Record<string, number>>;
  buAlloc: Map<number, Record<string, number>>;
}

export function isTruckingDashboard(wb: XLSX.WorkBook): boolean {
  return wb.SheetNames.includes('Sales per Truck') && wb.SheetNames.includes('Sales per BU');
}

export function excelSerial(year: number, month: number): number {
  return Math.round((Date.UTC(year, month - 1, 1) - Date.UTC(1899, 11, 30)) / 86400000);
}

function serialToYm(serial: number): DashboardMonth | null {
  const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  if (d.getUTCDate() !== 1) return null; // only month-start columns
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, serial };
}

// Columns whose header (row 3) is a month-start date serial.
function monthColumns(rows: (string | number)[][]): { col: number; ym: DashboardMonth }[] {
  const header = rows[HEADER_ROW] ?? [];
  const out: { col: number; ym: DashboardMonth }[] = [];
  for (let c = 0; c < header.length; c++) {
    const v = header[c];
    if (typeof v === 'number') {
      const ym = serialToYm(Math.round(v));
      if (ym) out.push({ col: c, ym });
    }
  }
  return out;
}

// Read a sheet into `serial -> { key -> amount }`, mapping each data row's
// column-A key via `keyOf` (returns the canonical code, or null to skip).
function readSheet(
  ws: XLSX.WorkSheet,
  keyOf: (raw: string) => string | null,
): { months: DashboardMonth[]; bySerial: Map<number, Record<string, number>> } {
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, raw: true, defval: '' });
  const cols = monthColumns(rows);
  const bySerial = new Map<number, Record<string, number>>();
  for (const { ym } of cols) bySerial.set(ym.serial, {});
  for (let r = HEADER_ROW + 1; r < rows.length; r++) {
    const raw = rows[r]?.[KEY_COL];
    if (typeof raw !== 'string') continue;
    const key = keyOf(raw.trim());
    if (!key) continue;
    for (const { col, ym } of cols) {
      const v = rows[r][col];
      if (typeof v === 'number' && v !== 0) bySerial.get(ym.serial)![key] = (bySerial.get(ym.serial)![key] ?? 0) + v;
    }
  }
  return { months: cols.map((c) => c.ym), bySerial };
}

const BU_CODE = /^(BU\d{2}|OT)$/i;

export function parseTruckingDashboard(data: ArrayBuffer): ParsedDashboard {
  const wb = XLSX.read(data, { type: 'array' });
  const truck = readSheet(wb.Sheets['Sales per Truck'], (raw) => truckByPlate(raw)?.code ?? null);
  const bu = readSheet(wb.Sheets['Sales per BU'], (raw) => (BU_CODE.test(raw) ? raw.toUpperCase() : null));
  // Union of months present in either sheet, newest first.
  const bySerial = new Map<number, DashboardMonth>();
  for (const m of [...truck.months, ...bu.months]) bySerial.set(m.serial, m);
  const months = [...bySerial.values()].sort((a, b) => b.serial - a.serial);
  return { months, truckIncome: truck.bySerial, buAlloc: bu.bySerial };
}
