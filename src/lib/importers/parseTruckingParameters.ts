import * as XLSX from 'xlsx';
import { BU10_TRUCKS, bu10KmplKey } from '../params/bu10Config';

// Parse the TRUCKING DASHBOARD "Parameters Data" sheet into monthly BU10 base
// quantities. The sheet holds a dated weekly series (week-start / week-end in
// rows 3 & 4); we aggregate each week into the month its week-END falls in:
//   sums   — Kilos Delivered, Fuel/Maint/Payroll cost, Trips, KM Run, Weeks
//   means  — weekly km/L per truck, Average Trips/Truck/Week
// Verified against the sheet's own computed monthly columns.

export interface Bu10MonthParams { year: number; month: number; values: Record<string, number> }

const excelMonth = (serial: number) => {
  const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
};

type Grid = (string | number)[][];

// Row of an aggregate metric = one whose col A (truck#) is blank and col B label matches.
function findAggRow(rows: Grid, label: string): number {
  const want = label.trim().toUpperCase();
  return rows.findIndex((r) => String(r?.[0] ?? '').trim() === '' && String(r?.[1] ?? '').trim().toUpperCase() === want);
}
const numAt = (rows: Grid, r: number, c: number): number | null => {
  const v = r >= 0 ? rows[r]?.[c] : undefined;
  return typeof v === 'number' ? v : null;
};

export function parseTruckingParameters(wb: XLSX.WorkBook): Bu10MonthParams[] {
  const ws = wb.Sheets['Parameters Data'];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, raw: true, defval: '' });
  if (rows.length < 7) return [];

  const rPayroll = findAggRow(rows, 'PAYROLL');
  const rFuel = findAggRow(rows, 'FUEL');
  const rMaint = findAggRow(rows, 'MAINT');
  const rDel = findAggRow(rows, 'DEL');
  const rAveTrips = findAggRow(rows, 'Ave Trips');
  const rTrips = findAggRow(rows, 'Trips');
  const rKmRun = findAggRow(rows, 'KM RUN'); // aggregate total (blank col A)
  const rKmpl = new Map(BU10_TRUCKS.map((t) => [t.code, findAggRow(rows, t.data)]));
  if (rDel < 0 && rTrips < 0) return [];

  // The dated weekly columns: any column with a week-END date in row 4 (index 3).
  const weekEnd = rows[3] ?? [];
  const width = Math.max(...rows.map((r) => r.length));
  const byMonth = new Map<string, { cols: number[]; ym: { year: number; month: number } }>();
  for (let c = 0; c < width; c++) {
    const we = weekEnd[c];
    if (typeof we !== 'number' || we < 40000 || we > 80000) continue;
    // Only weeks that actually have data (delivered kilos or trips present).
    if (numAt(rows, rDel, c) == null && numAt(rows, rTrips, c) == null) continue;
    const ym = excelMonth(we);
    const key = `${ym.year}-${ym.month}`;
    if (!byMonth.has(key)) byMonth.set(key, { cols: [], ym });
    byMonth.get(key)!.cols.push(c);
  }

  const sum = (r: number, cols: number[]) => cols.reduce((s, c) => s + (numAt(rows, r, c) ?? 0), 0);
  const mean = (r: number, cols: number[]) => {
    const vals = cols.map((c) => numAt(rows, r, c)).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  };

  const out: Bu10MonthParams[] = [];
  for (const { cols, ym } of byMonth.values()) {
    const values: Record<string, number> = {
      del_kilos: sum(rDel, cols),
      fuel_cost: sum(rFuel, cols),
      maint_cost: sum(rMaint, cols),
      payroll: sum(rPayroll, cols),
      trips: sum(rTrips, cols),
      km_run: sum(rKmRun, cols),
      weeks: cols.length,
      ave_trips_wk: mean(rAveTrips, cols),
    };
    for (const t of BU10_TRUCKS) {
      const rr = rKmpl.get(t.code) ?? -1;
      if (rr >= 0) values[bu10KmplKey(t.code)] = mean(rr, cols);
    }
    out.push({ year: ym.year, month: ym.month, values });
  }
  return out.sort((a, b) => a.year - b.year || a.month - b.month);
}
