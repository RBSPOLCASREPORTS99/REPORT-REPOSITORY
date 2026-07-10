import { supabase } from '../supabaseClient';
import { GFFC_INPUTS } from '../gffc/gffcConfig';
import type { GffcMonthInputs } from './parseGffcPnl';

// Store GFFC's monthly Total-P&L inputs. Upsert by (year, month, line_key) so
// re-importing (or the Jan-26 overlap between P&L 2025 and P&L 2026) just
// replaces, never duplicates.
export async function persistGffcPnl(months: GffcMonthInputs[], fileName: string, userId: string): Promise<{ months: number }> {
  await supabase.from('import_batches').insert({
    source_report: 'BR', filename: fileName, storage_path: null, uploaded_by: userId, row_count: 0, status: 'confirmed',
  });

  const rows = months.flatMap((m) => GFFC_INPUTS.map((inp) => ({
    year: m.year, month: m.month, line_key: inp.key, amount: m.lines[inp.key] ?? 0,
  })));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('gffc_monthly_pnl').upsert(rows.slice(i, i + 500), { onConflict: 'year,month,line_key' });
    if (error) throw error;
  }
  return { months: months.length };
}
