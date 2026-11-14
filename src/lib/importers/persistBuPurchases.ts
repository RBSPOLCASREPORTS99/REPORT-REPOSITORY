import { supabase } from '../supabaseClient';
import { deriveRanges } from '../pnl/deriveRanges';
import { monthLabel } from '../format';
import { COST_OF_MONEY_BUS } from '../pnl/buConfig';
import type { ParsedBuPurchases } from './parseBuPurchases';

// Persist one month's per-BU PURCHASES (₱'000) into br_bu_purchases, then
// re-derive the year so the Cost of Money allocation switches to the
// Purchases + Expenses basis. The month's P&L must already be imported (the
// purchases supplement it); only the BUs that share the Cost of Money pool are
// stored (BU06 / BU10 / Farm are excluded from the allocation).
export interface BuPurchasesPersistArgs {
  year: number;
  month: number;
  parsed: ParsedBuPurchases;
  fileName: string;
  userId: string;
}

export async function persistBuPurchases(args: BuPurchasesPersistArgs): Promise<{ monthId: string; ranges: number; stored: number }> {
  const { year, month, parsed, fileName, userId } = args;

  const { data: existing } = await supabase.from('pnl_months').select('id').eq('year', year).eq('month', month).maybeSingle();
  if (!existing) throw new Error(`No P&L imported for ${monthLabel(year, month)} yet — import that month's P&L first, then the purchases.`);
  const monthId = existing.id as string;

  await supabase.from('import_batches').insert({
    source_report: 'BR', filename: fileName, storage_path: null, uploaded_by: userId, row_count: 0, status: 'confirmed',
  });

  await supabase.from('br_bu_purchases').delete().eq('month_id', monthId);
  const rows = Object.entries(parsed.byBu)
    .filter(([bu, amt]) => COST_OF_MONEY_BUS.includes(bu) && amt !== 0)
    .map(([bu, amt]) => ({ month_id: monthId, bu_code: bu, amount: amt / 1000 })); // store ₱'000
  if (rows.length) {
    const { error } = await supabase.from('br_bu_purchases').insert(rows);
    if (error) throw error;
  }

  const { ranges } = await deriveRanges(supabase, year);
  return { monthId, ranges, stored: rows.length };
}
