import { supabase } from '../supabaseClient';
import type { GffcExpenseRow, GffcSalesRow } from './parseGffcData';
import type { GffcBranchRow } from './parseGffcBranch';

// Replace the months present in the file (QB Exp Details / Sales by QTY are
// cumulative, so a re-import replaces those months without duplicating).
async function replaceMonths(table: string, monthKeys: string[]) {
  for (const ym of monthKeys) {
    const [y, m] = ym.split('-').map(Number);
    await supabase.from(table).delete().eq('year', y).eq('month', m);
  }
}

export async function persistGffcExpense(rows: GffcExpenseRow[]): Promise<void> {
  if (rows.length === 0) return;
  await replaceMonths('gffc_monthly_expense', [...new Set(rows.map((r) => `${r.year}-${r.month}`))]);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('gffc_monthly_expense').insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
}

export async function persistGffcBranch(rows: GffcBranchRow[]): Promise<void> {
  if (rows.length === 0) return;
  await replaceMonths('gffc_branch_pnl', [...new Set(rows.map((r) => `${r.year}-${r.month}`))]);
  const payload = rows.map((r) => ({ year: r.year, month: r.month, branch: r.branch, line_key: r.lineKey, amount: r.amount }));
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await supabase.from('gffc_branch_pnl').insert(payload.slice(i, i + 500));
    if (error) throw error;
  }
}

export async function persistGffcSales(rows: GffcSalesRow[]): Promise<void> {
  if (rows.length === 0) return;
  await replaceMonths('gffc_monthly_sales', [...new Set(rows.map((r) => `${r.year}-${r.month}`))]);
  // Collapse to one row per (year, month, category, item) — the table's key —
  // summing any duplicates, so a repeated item never breaks the insert.
  const agg = new Map<string, GffcSalesRow>();
  for (const r of rows) {
    if (r.qty === 0) continue;
    const k = `${r.year}|${r.month}|${r.category}|${r.item}`;
    const e = agg.get(k);
    if (e) e.qty += r.qty; else agg.set(k, { ...r });
  }
  const payload = [...agg.values()];
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await supabase.from('gffc_monthly_sales').insert(payload.slice(i, i + 500));
    if (error) throw error;
  }
}
