import * as XLSX from 'xlsx';

// Compute expenses from the raw "QB Exp Data" transaction tab: sum
// (Debit − Credit) per account per BU per month. The account's section
// (controllable / uncontrollable) and group come from the "List" tab.

export type Section = 'controllable' | 'uncontrollable';

export interface MonthlyExpenseRow {
  year: number;
  month: number;
  buCode: string;
  section: Section;
  groupName: string;
  account: string;
  amount: number; // full pesos
}

export interface ParsedExpenseTx {
  rows: MonthlyExpenseRow[];
  months: { year: number; month: number }[];
  buCodes: string[];
  warnings: string[];
}

// Locate the QuickBooks expense-transaction sheet by name or, failing that, by
// its columns (Account / Class / Debit / Credit) — so a raw single-sheet QB
// export (e.g. named "Sheet1") is still recognised.
export function findExpenseTxSheet(wb: XLSX.WorkBook): string | null {
  if (wb.SheetNames.includes('QB Exp Data')) return 'QB Exp Data';
  for (const name of wb.SheetNames) {
    const d = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' });
    for (let r = 0; r < Math.min(5, d.length); r++) {
      const H = d[r] ?? [];
      if (H.includes('Account') && H.includes('Class') && H.includes('Debit') && H.includes('Credit')) return name;
    }
  }
  return null;
}

export function isExpenseTxWorkbook(wb: XLSX.WorkBook): boolean {
  return findExpenseTxSheet(wb) !== null;
}

// "ProfitCost Center:BU01 - Bodega 1" → BU01 → BU0102; support centers → null.
// The Forklift and Skidsteer (BU10 equipment) belong to Bodega 1&2, so their
// expenses are attributed to BU0102 (matching the finished expense report).
function buFromClass(cls: string): string | null {
  if (/Skidsteer|Forklift/i.test(cls)) return 'BU0102';
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

export type Classification = Map<string, { section: Section; group: string }>;

const SECTION_MARKERS: Record<string, Section> = {
  'CONTROLLABLE EXPENSE': 'controllable',
  'UNCONTROLLABLE EXPENSE': 'uncontrollable',
  'NON-CONTROLLABLE EXPENSE': 'uncontrollable',
};

// The finished per-BU tabs list every expense account under its section
// (Controllable / Non-controllable) and group — and correctly EXCLUDE
// non-expense accounts like COGS. This is the authoritative account universe.
function addFromFinishedTabs(wb: XLSX.WorkBook, map: Classification) {
  for (const name of wb.SheetNames) {
    if (name === 'QB Exp Data' || name === 'Sheet1' || name === 'List') continue;
    const ws = wb.Sheets[name];
    const d = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, raw: true, defval: '' });
    let section: Section | null = null;
    let group = '';
    for (const row of d) {
      const a = (row[0] ?? '').toString().trim();
      const b = (row[1] ?? '').toString().trim();
      const marker = SECTION_MARKERS[a.toUpperCase()] ?? SECTION_MARKERS[b.toUpperCase()];
      if (marker) { section = marker; group = ''; continue; }
      if (/^TOTAL /i.test(a)) continue;      // group / section totals
      if (a && !b) { group = a; continue; }  // group header
      if (b && !a && section && !map.has(b.toUpperCase())) map.set(b.toUpperCase(), { section, group });
    }
  }
}

// The "List" tab adds any accounts the finished tabs didn't happen to show,
// with explicit C / UC flags (col0 group, col1 account, col2 = C, col3 = UC).
function addFromList(wb: XLSX.WorkBook, map: Classification) {
  const ws = wb.Sheets['List'];
  if (!ws) return;
  const d = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, raw: true, defval: '' });
  for (const row of d) {
    const group = (row[0] ?? '').toString().trim();
    const account = (row[1] ?? '').toString().trim();
    if (!account || map.has(account.toUpperCase())) continue;
    const c = (row[2] ?? '').toString().trim().toUpperCase();
    map.set(account.toUpperCase(), { section: c === 'C' ? 'controllable' : 'uncontrollable', group });
  }
}

// Account → {section, group}. Accounts NOT in this map are not expense-report
// accounts (COGS, income tax, etc.) and are excluded.
function buildClassification(wb: XLSX.WorkBook): Classification {
  const map: Classification = new Map();
  addFromFinishedTabs(wb, map);
  addFromList(wb, map);
  return map;
}

export function parseExpenseTransactions(data: ArrayBuffer, fallback?: Classification): ParsedExpenseTx {
  const wb = XLSX.read(data, { type: 'array' });
  const classification = buildClassification(wb);
  // Supplement with a stored classification (from prior imports) for accounts the
  // workbook itself doesn't classify — needed when only the raw QB transaction
  // sheet is provided (no List / finished tabs).
  if (fallback) for (const [k, v] of fallback) if (!classification.has(k)) classification.set(k, v);
  const warnings: string[] = [];

  const sheetName = findExpenseTxSheet(wb);
  if (!sheetName) return { rows: [], months: [], buCodes: [], warnings: ['No QuickBooks expense transaction sheet (Account / Class / Debit / Credit columns) found.'] };
  const qb = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' });
  // header row has Account / Class / Debit / Credit
  let hdr = 0;
  for (let r = 0; r < 5; r++) { if ((qb[r] ?? []).includes('Account') && (qb[r] ?? []).includes('Class')) { hdr = r; break; } }
  const H = qb[hdr] ?? [];
  const cDate = H.indexOf('Date'), cAccount = H.indexOf('Account'), cClass = H.indexOf('Class'), cDebit = H.indexOf('Debit'), cCredit = H.indexOf('Credit');

  // aggregate: key = year|month|bu|account
  const agg = new Map<string, MonthlyExpenseRow>();
  const buSet = new Set<string>();
  const monthSet = new Set<string>();
  const unmappedAccounts = new Set<string>();

  for (let r = hdr + 1; r < qb.length; r++) {
    const row = qb[r];
    const date = row[cDate];
    const account = (row[cAccount] ?? '').toString().trim();
    const cls = (row[cClass] ?? '').toString().trim();
    if (typeof date !== 'number' || !account) continue;
    const bu = buFromClass(cls);
    if (!bu) continue; // support centers / unclassified — not per-BU detail
    const debit = typeof row[cDebit] === 'number' ? (row[cDebit] as number) : 0;
    const credit = typeof row[cCredit] === 'number' ? (row[cCredit] as number) : 0;
    const amount = debit - credit;
    if (amount === 0) continue;

    const cl = classification.get(account.toUpperCase());
    if (!cl) { unmappedAccounts.add(account); continue; } // not a known expense-report account (COGS, tax, or new) — exclude
    const { section, group } = cl;

    const { year, month } = ymFromSerial(date);
    const key = `${year}|${month}|${bu}|${section}|${group}|${account}`;
    const existing = agg.get(key);
    if (existing) existing.amount += amount;
    else agg.set(key, { year, month, buCode: bu, section, groupName: group, account, amount });

    buSet.add(bu);
    monthSet.add(`${year}-${month}`);
  }

  if (unmappedAccounts.size > 0) {
    warnings.push(`${unmappedAccounts.size} account(s) weren't in the known expense classification and were excluded (COGS/taxes, or new accounts): ${[...unmappedAccounts].sort().join(', ')}. To include a new expense account, import a full expense workbook (with the classification tabs) once.`);
  }

  const months = [...monthSet].map((s) => { const [y, m] = s.split('-').map(Number); return { year: y, month: m }; })
    .sort((a, b) => a.year - b.year || a.month - b.month);

  return { rows: [...agg.values()].filter((r) => r.amount !== 0), months, buCodes: [...buSet], warnings };
}
