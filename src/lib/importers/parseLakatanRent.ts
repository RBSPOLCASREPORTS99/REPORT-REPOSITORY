import * as XLSX from 'xlsx';

// Parse the Lakatan "Rent Schedule" workbook's "Rent by Month" sheet — a
// year × month matrix of land rent in FULL PESOS (a Year row, then Jan…Dec
// columns, a Year Total, and an "All Years" footer we ignore). Each cell becomes
// one month's land-rent amount for the Lakatan Farm's Land Rental expense line.

export interface RentMonthRow { year: number; month: number; amount: number } // full pesos

const SHEET = 'rent by month';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const findSheet = (wb: XLSX.WorkBook): string | undefined =>
  wb.SheetNames.find((n) => n.trim().toLowerCase() === SHEET);

export function hasLakatanRentSheet(wb: XLSX.WorkBook): boolean {
  return findSheet(wb) !== undefined;
}

export function parseLakatanRent(wb: XLSX.WorkBook): RentMonthRow[] {
  const name = findSheet(wb);
  if (!name) return [];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' });

  // The header row has "Year" and the month names.
  let hdr = -1;
  for (let r = 0; r < Math.min(12, rows.length); r++) {
    const cells = (rows[r] ?? []).map((c) => String(c).trim().toLowerCase());
    if (cells.includes('year') && cells.includes('jan')) { hdr = r; break; }
  }
  if (hdr < 0) return [];
  const H = (rows[hdr] ?? []).map((c) => String(c).trim().toLowerCase());
  const yearCol = H.indexOf('year');
  const monthCols = MONTHS.map((m) => H.indexOf(m));

  const out: RentMonthRow[] = [];
  for (let r = hdr + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const y = row[yearCol];
    if (typeof y !== 'number' || y < 2000 || y > 2100) continue; // skips the "All Years" footer
    for (let m = 0; m < 12; m++) {
      const c = monthCols[m];
      if (c < 0) continue;
      const v = row[c];
      // Empty cells come through as the string "null"; only real numbers count.
      if (typeof v !== 'number' || !isFinite(v) || v === 0) continue;
      out.push({ year: y, month: m + 1, amount: v });
    }
  }
  return out.sort((a, b) => a.year - b.year || a.month - b.month);
}
