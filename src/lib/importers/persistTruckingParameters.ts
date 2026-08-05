import { supabase } from '../supabaseClient';
import { BU10_STD } from '../params/bu10Config';
import type { Bu10MonthParams } from './parseTruckingParameters';

// Store the monthly BU10 base quantities into bu_parameters (bu_code 'BU10'),
// attached to each month's report_range — so the Parameters engine aggregates
// them into any Month / YTD / Quarter comparison exactly like the other BUs.
// Months whose P&L hasn't been imported yet (no report_range) are skipped and
// reported, so re-importing the dashboard after that month's P&L fills them in.
export async function persistTruckingParameters(months: Bu10MonthParams[]): Promise<{ stored: number; skipped: string[] }> {
  if (!months.length) return { stored: 0, skipped: [] };

  const { data: ranges } = await supabase.from('report_ranges').select('id, period_start').eq('kind', 'month');
  const idByYm = new Map(
    (ranges ?? []).map((r) => {
      const [y, m] = String(r.period_start).split('-').map(Number);
      return [`${y}-${m}`, r.id as string];
    }),
  );

  let stored = 0;
  const skipped: string[] = [];
  for (const mo of months) {
    const rid = idByYm.get(`${mo.year}-${mo.month}`);
    if (!rid) { skipped.push(`${mo.year}-${String(mo.month).padStart(2, '0')}`); continue; }
    const rows = Object.entries(mo.values)
      .filter(([, v]) => v != null && !Number.isNaN(v))
      .map(([param_key, value]) => ({ range_id: rid, bu_code: 'BU10', param_key, value }));
    await supabase.from('bu_parameters').delete().eq('range_id', rid).eq('bu_code', 'BU10');
    if (rows.length) {
      const { error } = await supabase.from('bu_parameters').insert(rows);
      if (error) throw error;
    }
    stored++;
  }

  // Seed the STD targets from the dashboard's Parameters sheet (upsert; the sheet
  // is the source of truth for BU10 standards).
  const stdRows = Object.entries(BU10_STD).map(([param_key, value]) => ({ bu_code: 'BU10', param_key, value }));
  const { error: stdErr } = await supabase.from('bu_parameter_std').upsert(stdRows, { onConflict: 'bu_code,param_key' });
  if (stdErr) throw stdErr;

  return { stored, skipped };
}
