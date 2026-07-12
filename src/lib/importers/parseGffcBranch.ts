import * as XLSX from 'xlsx';

// Parse GFFC's "P&L PER BRANCH" sheet — a pre-formatted per-branch P&L report
// covering Jan–Jun 2026 — into per-branch base P&L lines. The report is a wide
// table: a branch-group header row above a month-serial row, with each month
// followed by a "%" column and DIFF / % DIFF columns per group. QuickBooks
// labels the same branch inconsistently across months, so names are canonicalised
// (Main Branch; Branch 2 = "Branch 1 @ Savemart"; Calamanade; Meat Cutting Plant).
// The all-branches TOTAL group is ignored — the viewer derives the Total.

export interface GffcBranchRow {
  year: number;
  month: number;
  branch: string;
  lineKey: string;
  amount: number; // full pesos
}

const BRANCH_SHEET = 'P&L PER BRANCH';

const findBranchSheet = (wb: XLSX.WorkBook): string | undefined =>
  wb.SheetNames.find((n) => n.trim().toUpperCase() === BRANCH_SHEET);

// A GFFC per-branch workbook is identified by its "P&L PER BRANCH" sheet.
export function hasGffcBranchSheets(wb: XLSX.WorkBook): boolean {
  return findBranchSheet(wb) !== undefined;
}

// Collapse QuickBooks' inconsistent class labels to the canonical branch names.
// Only these four persist; the TOTAL columns (and any unknown label) are skipped.
function canonicalBranch(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s || s.includes('total')) return null;
  if (s.includes('savemart') || s.includes('branch 1')) return 'Branch 2';
  if (s.includes('meat cutting')) return 'Meat Cutting Plant';
  if (s.includes('calaman')) return 'Calamanade';
  if (s.includes('main')) return 'Main Branch';
  return null;
}

// Report row label → base P&L line key. Operations rolls up the allocated MCP
// ops line so each branch's Total Expense reconciles with the sheet.
function lineKeyFor(label: string): string | null {
  const s = label.trim().toLowerCase();
  if (s === 'gross sales') return 'gross_sales';
  if (s === 'cost of goods sold') return 'cogs';
  if (s === 'admin expense') return 'admin';
  if (s === 'finance expense') return 'finance';
  if (s === 'operations expense' || s === 'mcp ops expense - allocated') return 'operations';
  if (s === 'repairs/maint. expense') return 'repairs';
  if (s === 'salaries & wages') return 'salaries';
  return null;
}

const isSerial = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 20000 && v <= 80000;

function ymFromSerial(n: number): { year: number; month: number } {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export function parseGffcBranchPnl(wb: XLSX.WorkBook): GffcBranchRow[] {
  const name = findBranchSheet(wb);
  if (!name) return [];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' });

  // Month row = the row with the most integer date serials; the group-header row
  // is the one directly above it.
  let monthRowIdx = -1, best = 0;
  for (let r = 0; r < Math.min(8, rows.length); r++) {
    const cnt = (rows[r] ?? []).filter(isSerial).length;
    if (cnt > best) { best = cnt; monthRowIdx = r; }
  }
  if (monthRowIdx < 1) return [];
  const monthRow = rows[monthRowIdx] ?? [];
  const groupRow = rows[monthRowIdx - 1] ?? [];

  // Each value column = a month serial under a (carried-forward) branch header.
  const cols: { col: number; branch: string; year: number; month: number }[] = [];
  let curBranch: string | null = null;
  for (let c = 0; c < monthRow.length; c++) {
    const g = groupRow[c];
    if (typeof g === 'string' && g.trim() !== '') curBranch = canonicalBranch(g);
    const v = monthRow[c];
    if (isSerial(v) && curBranch) cols.push({ col: c, branch: curBranch, ...ymFromSerial(v) });
  }
  if (cols.length === 0) return [];

  const agg = new Map<string, GffcBranchRow>();
  for (let r = monthRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const key = lineKeyFor(typeof row[0] === 'string' ? row[0] : '');
    if (!key) continue;
    for (const { col, branch, year, month } of cols) {
      const v = row[col];
      if (typeof v !== 'number' || v === 0) continue;
      const mk = `${branch}|${year}|${month}|${key}`;
      const e = agg.get(mk);
      if (e) e.amount += v;
      else agg.set(mk, { year, month, branch, lineKey: key, amount: v });
    }
  }
  return [...agg.values()];
}
