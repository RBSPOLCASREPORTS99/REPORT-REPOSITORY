import { supabase } from '../supabaseClient';
import { deriveRanges } from '../pnl/deriveRanges';
import type { ParsedExpenseTx } from './parseExpenseTransactions';
import type { ParsedSalesTx } from './parseSalesTransactions';

// Store the monthly aggregates from a raw QB Exp/Sales transaction file, then
// re-derive the affected years so every range (month/YTD/quarter) picks up the
// new expense/sales figures. Requires the P&L for those months to be imported
// (ranges come from the P&L).

// The raw file is not stored — its data is fully extracted into the DB tables
// (and covered by the weekly backup), so we only keep an audit record.
async function newBatch(source: 'EXPENSE' | 'SALES', fileName: string, userId: string, rowCount: number): Promise<string> {
  const { data } = await supabase.from('import_batches').insert({
    source_report: source, filename: fileName, storage_path: null, uploaded_by: userId, row_count: rowCount, status: 'pending',
  }).select('id').single();
  return data!.id as string;
}

export async function persistExpenseTx(parsed: ParsedExpenseTx, fileName: string, _fileBuffer: ArrayBuffer, userId: string): Promise<{ ranges: number }> {
  const batchId = await newBatch('EXPENSE', fileName, userId, parsed.rows.length);

  // Replace the covered months' aggregates.
  for (const ym of parsed.months) {
    await supabase.from('monthly_expense').delete().eq('year', ym.year).eq('month', ym.month);
  }
  for (let i = 0; i < parsed.rows.length; i += 500) {
    const chunk = parsed.rows.slice(i, i + 500).map((r) => ({
      year: r.year, month: r.month, bu_code: r.buCode, section: r.section, group_name: r.groupName, account: r.account, amount: r.amount,
    }));
    const { error } = await supabase.from('monthly_expense').insert(chunk);
    if (error) throw error;
  }

  await supabase.from('import_batches').update({ status: 'confirmed' }).eq('id', batchId);

  let ranges = 0;
  for (const year of [...new Set(parsed.months.map((m) => m.year))]) {
    ranges += (await deriveRanges(supabase, year)).ranges;
  }
  return { ranges };
}

export async function persistSalesTx(parsed: ParsedSalesTx, fileName: string, _fileBuffer: ArrayBuffer, userId: string): Promise<{ ranges: number }> {
  const batchId = await newBatch('SALES', fileName, userId, parsed.rows.length);

  for (const ym of parsed.months) {
    await supabase.from('monthly_sales').delete().eq('year', ym.year).eq('month', ym.month);
  }
  for (let i = 0; i < parsed.rows.length; i += 500) {
    const chunk = parsed.rows.slice(i, i + 500).map((r) => ({
      year: r.year, month: r.month, bu_code: r.buCode, item: r.item, uom: r.uom, qty: r.qty,
    }));
    const { error } = await supabase.from('monthly_sales').insert(chunk);
    if (error) throw error;
  }

  await supabase.from('import_batches').update({ status: 'confirmed' }).eq('id', batchId);

  let ranges = 0;
  for (const year of [...new Set(parsed.months.map((m) => m.year))]) {
    ranges += (await deriveRanges(supabase, year)).ranges;
  }
  return { ranges };
}
