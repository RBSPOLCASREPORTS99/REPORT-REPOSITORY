import * as XLSX from 'xlsx';

// Parse the FINANCE/HR/MANCOM "SIMULATED SUPPORT UNIT" tabs to extract each
// BU's support-center allocation under the two alternative methods
// (% revenue, per-transaction), for the three periods (YTD, current month,
// prior month). Column positions were mapped from the BR workbook's external
// cell references; HR & MANCOM share a layout, FINANCE is shifted +2 columns.

export type Center = 'finance' | 'hr' | 'mancom';
export type AltMethod = 'revenue' | 'per_txn';
export type SupportPeriod = 'ytd' | 'month' | 'prevMonth';

// column index per center → method → period
const COLUMN_MAP: Record<Center, Record<AltMethod, Record<SupportPeriod, number>>> = {
  finance: {
    revenue: { ytd: 6, prevMonth: 30, month: 32 },
    per_txn: { ytd: 27, prevMonth: 35, month: 37 },
  },
  hr: {
    revenue: { ytd: 4, prevMonth: 28, month: 30 },
    per_txn: { ytd: 25, prevMonth: 33, month: 35 },
  },
  mancom: {
    revenue: { ytd: 4, prevMonth: 28, month: 30 },
    per_txn: { ytd: 25, prevMonth: 33, month: 35 },
  },
};

const CENTER_TABS: Record<Center, string> = {
  finance: 'FINANCE P&L',
  hr: 'HR P&L',
  mancom: 'MANCOM P&L',
};

// "SERVICES: BUxx" row label → canonical BU code used across the app.
function serviceLabelToBu(label: string): string | null {
  const m = /^SERVICES:\s*(.+)$/i.exec(label.trim());
  if (!m) return null;
  const key = m[1].replace(/\s+/g, '').toUpperCase();
  if (key === 'BU01/BU02' || key === 'BU01&BU02') return 'BU0102';
  if (key === 'BU08') return 'BU08PH'; // Packhouse is the computed BU08 tab
  if (/^BU\d{2}$/.test(key)) return key;
  return null;
}

export interface SupportValue {
  buCode: string;
  center: Center;
  method: AltMethod;
  period: SupportPeriod;
  amount: number; // ₱ thousands
}

export interface ParsedSupport {
  values: SupportValue[];
  currentMonth: { year: number; month: number };
  prevMonth: { year: number; month: number };
  buCodes: string[];
  warnings: string[];
}

function excelToYm(serial: number): { year: number; month: number } {
  const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export function isSupportWorkbook(wb: XLSX.WorkBook): boolean {
  return wb.SheetNames.includes('FINANCE P&L') && wb.SheetNames.includes('HR P&L');
}

export function parseSupportWorkbook(data: ArrayBuffer): ParsedSupport {
  const wb = XLSX.read(data, { type: 'array' });
  const warnings: string[] = [];
  const values: SupportValue[] = [];
  const buCodes = new Set<string>();

  // Detect current & prior month from FINANCE header row 6, month %rev columns.
  let currentMonth = { year: 0, month: 0 };
  let prevMonth = { year: 0, month: 0 };
  const finWs = wb.Sheets['FINANCE P&L'];
  if (finWs) {
    const fin = XLSX.utils.sheet_to_json<(string | number)[]>(finWs, { header: 1, raw: true, defval: '' });
    const hdr = fin[6] ?? []; // period-header row (0-indexed 6)
    const monthCol = COLUMN_MAP.finance.revenue.month;
    const prevCol = COLUMN_MAP.finance.revenue.prevMonth;
    if (typeof hdr[monthCol] === 'number') currentMonth = excelToYm(hdr[monthCol] as number);
    if (typeof hdr[prevCol] === 'number') prevMonth = excelToYm(hdr[prevCol] as number);
  }

  for (const center of Object.keys(CENTER_TABS) as Center[]) {
    const ws = wb.Sheets[CENTER_TABS[center]];
    if (!ws) {
      warnings.push(`Tab "${CENTER_TABS[center]}" not found — ${center} allocations skipped.`);
      continue;
    }
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, raw: true, defval: '' });
    for (const row of rows) {
      const label = typeof row[0] === 'string' ? row[0] : '';
      const buCode = serviceLabelToBu(label);
      if (!buCode) continue;
      buCodes.add(buCode);
      for (const method of ['revenue', 'per_txn'] as AltMethod[]) {
        for (const period of ['ytd', 'month', 'prevMonth'] as SupportPeriod[]) {
          const col = COLUMN_MAP[center][method][period];
          const v = row[col];
          const amount = typeof v === 'number' ? v : 0;
          values.push({ buCode, center, method, period, amount });
        }
      }
    }
  }

  return { values, currentMonth, prevMonth, buCodes: [...buCodes], warnings };
}
