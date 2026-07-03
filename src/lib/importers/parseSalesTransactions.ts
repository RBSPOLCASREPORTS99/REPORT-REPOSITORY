import * as XLSX from 'xlsx';

// Compute sales volume from the raw "QB Sales Data" transaction tab: sum Qty per
// display item per BU per month. The QB item → display-item + U/M mapping comes
// from the workbook: helper tab "1" gives QB-item → code, and the finished
// per-BU tabs give code → display item + unit of measure.

export interface MonthlySalesRow {
  year: number;
  month: number;
  buCode: string;
  item: string;
  uom: string;
  qty: number;
}

export interface ParsedSalesTx {
  rows: MonthlySalesRow[];
  months: { year: number; month: number }[];
  buCodes: string[];
  warnings: string[];
}

export function isSalesTxWorkbook(wb: XLSX.WorkBook): boolean {
  return wb.SheetNames.includes('QB Sales Data');
}

function buFromClass(cls: string): string | null {
  const m = /BU\s?(\d{2})/i.exec(cls);
  if (!m) return null;
  const n = m[1];
  if (n === '01' || n === '02') return 'BU0102';
  if (n === '08') return 'BU08PH';
  return 'BU' + n;
}
function ymFromSerial(serial: number): { year: number; month: number } {
  const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}
function cleanItem(qbItem: string): string {
  // "AGRI CROPS:Cassava Granules (Granules Only)" → "Cassava Granules"
  const afterColon = qbItem.includes(':') ? qbItem.slice(qbItem.lastIndexOf(':') + 1) : qbItem;
  return afterColon.replace(/\s*\(.*\)\s*$/, '').trim() || qbItem;
}

// QB item → code, from helper tab "1" (col0 item, col1 code).
function buildItemToCode(wb: XLSX.WorkBook): Map<string, string> {
  const map = new Map<string, string>();
  const ws = wb.Sheets['1'];
  if (!ws) return map;
  const d = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, raw: true, defval: '' });
  for (let r = 2; r < d.length; r++) {
    const item = (d[r][0] ?? '').toString().trim();
    const code = d[r][1];
    if (item && code !== '' && code != null) map.set(item, String(code));
  }
  return map;
}

// code → {display item, uom}, from the finished per-BU tabs (union). Each row:
// display item col0, codes col1-3, U/M col4.
function buildCodeToDisplay(wb: XLSX.WorkBook): Map<string, { item: string; uom: string }> {
  const map = new Map<string, { item: string; uom: string }>();
  for (const name of wb.SheetNames) {
    if (name === 'QB Sales Data' || /^\d/.test(name)) continue; // skip raw + helper pivots
    const ws = wb.Sheets[name];
    const d = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, raw: true, defval: '' });
    // per-BU tabs have the ITEM header around row 5; scan generously
    for (let r = 5; r < d.length; r++) {
      const disp = (d[r][0] ?? '').toString().trim();
      if (!disp || disp.toUpperCase() === 'TOTAL' || disp.toUpperCase() === 'ITEM') continue;
      const uom = (d[r][4] ?? '').toString().trim();
      for (const c of [d[r][1], d[r][2], d[r][3]]) {
        if (c !== '' && c != null && !map.has(String(c))) map.set(String(c), { item: disp, uom });
      }
    }
  }
  return map;
}

export function parseSalesTransactions(data: ArrayBuffer): ParsedSalesTx {
  const wb = XLSX.read(data, { type: 'array' });
  const itemToCode = buildItemToCode(wb);
  const codeToDisplay = buildCodeToDisplay(wb);
  const warnings: string[] = [];

  const qb = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets['QB Sales Data'], { header: 1, raw: true, defval: '' });
  let hdr = 0;
  for (let r = 0; r < 5; r++) { if ((qb[r] ?? []).includes('Item') && (qb[r] ?? []).includes('Qty')) { hdr = r; break; } }
  const H = qb[hdr] ?? [];
  const cDate = H.indexOf('Date'), cItem = H.indexOf('Item'), cClass = H.indexOf('Class'), cQty = H.indexOf('Qty');

  const agg = new Map<string, MonthlySalesRow>();
  const buSet = new Set<string>();
  const monthSet = new Set<string>();

  for (let r = hdr + 1; r < qb.length; r++) {
    const row = qb[r];
    const date = row[cDate];
    const qbItem = (row[cItem] ?? '').toString().trim();
    const cls = (row[cClass] ?? '').toString().trim();
    const qty = row[cQty];
    if (typeof date !== 'number' || !qbItem || typeof qty !== 'number' || qty === 0) continue;
    const bu = buFromClass(cls);
    if (!bu) continue;

    const code = itemToCode.get(qbItem);
    const disp = code ? codeToDisplay.get(code) : undefined;
    const item = disp?.item ?? cleanItem(qbItem);
    const uom = disp?.uom ?? '';

    const { year, month } = ymFromSerial(date);
    const key = `${year}|${month}|${bu}|${item}`;
    const existing = agg.get(key);
    if (existing) existing.qty += qty;
    else agg.set(key, { year, month, buCode: bu, item, uom, qty });

    buSet.add(bu);
    monthSet.add(`${year}-${month}`);
  }

  const months = [...monthSet].map((s) => { const [y, m] = s.split('-').map(Number); return { year: y, month: m }; })
    .sort((a, b) => a.year - b.year || a.month - b.month);

  return { rows: [...agg.values()].filter((r) => r.qty !== 0), months, buCodes: [...buSet], warnings };
}
