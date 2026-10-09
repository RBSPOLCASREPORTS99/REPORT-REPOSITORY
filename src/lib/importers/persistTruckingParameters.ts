import { supabase } from '../supabaseClient';
import { BU10_STD } from '../params/bu10Config';
import { materializeTruckParams } from '../pnl/deriveRanges';
import type { Bu10MonthParams } from './parseTruckingParameters';

// Store the monthly BU10 base quantities from the TRUCKING DASHBOARD.
//
// They go first into br_truck_params (keyed by calendar month, independent of
// whether that month's P&L range exists) — the whole-history source of truth —
// then are materialized into bu_parameters for the months whose report_range
// exists, so the Parameters engine aggregates them into any Month / YTD / Quarter
// comparison like the other BUs. Months whose P&L hasn't been imported yet are
// reported as `skipped`; they fill in automatically on that month's next P&L
// import (deriveRanges re-materializes from br_truck_params), so a re-import of
// the dashboard is no longer required.
export async function persistTruckingParameters(months: Bu10MonthParams[]): Promise<{ stored: number; skipped: string[] }> {
  if (!months.length) return { stored: 0, skipped: [] };

  // 1. Persist the raw monthly params (replace the covered months).
  for (const mo of months) {
    await supabase.from('br_truck_params').delete().eq('year', mo.year).eq('month', mo.month);
    const rows = Object.entries(mo.values)
      .filter(([, v]) => v != null && !Number.isNaN(v))
      .map(([param_key, value]) => ({ year: mo.year, month: mo.month, param_key, value }));
    if (rows.length) { const { error } = await supabase.from('br_truck_params').insert(rows); if (error) throw error; }
  }

  // 2. Materialize into bu_parameters for every covered year.
  for (const year of [...new Set(months.map((m) => m.year))]) {
    await materializeTruckParams(supabase, year);
  }

  // 3. Report which months have no P&L range yet (so they weren't materialized).
  const { data: ranges } = await supabase.from('report_ranges').select('period_start').eq('kind', 'month');
  const haveYm = new Set((ranges ?? []).map((r) => { const [y, m] = String(r.period_start).split('-').map(Number); return `${y}-${m}`; }));
  const skipped: string[] = [];
  for (const mo of months) {
    if (!haveYm.has(`${mo.year}-${mo.month}`)) skipped.push(`${mo.year}-${String(mo.month).padStart(2, '0')}`);
  }

  // 4. Seed the STD targets from the dashboard's Parameters sheet (upsert; the
  //    sheet is the source of truth for BU10 standards).
  const stdRows = Object.entries(BU10_STD).map(([param_key, value]) => ({ bu_code: 'BU10', param_key, value }));
  const { error: stdErr } = await supabase.from('bu_parameter_std').upsert(stdRows, { onConflict: 'bu_code,param_key' });
  if (stdErr) throw stdErr;

  return { stored: months.length - skipped.length, skipped };
}
