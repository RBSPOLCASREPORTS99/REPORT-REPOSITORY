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
  const nonZero = rows.filter((r) => r.qty !== 0);
  for (let i = 0; i < nonZero.length; i += 500) {
    const { error } = await supabase.from('gffc_monthly_sales').insert(nonZero.slice(i, i + 500));
    if (error) throw error;
  }
}
