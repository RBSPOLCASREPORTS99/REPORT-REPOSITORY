import { supabase } from '../supabaseClient';
import { FARM_BU_CODE, farmComputedRows, farmItemKeys } from '../pnl/farmDerive';
import { loadFarmInputs } from '../farmEntry';
import { recomputeFarmAggregates } from '../pnl/deriveRanges';
import type { RentMonthRow } from './parseLakatanRent';

// Update the Lakatan Farm's Land Rental expense line from the rent schedule.
// For each month (from minYear on) that has an imported P&L month range, set the
// Farm's land_rental input (the schedule is in full pesos; the Farm P&L is in
// ₱'000, so ÷1000), keeping every other entered Farm figure, then re-roll that
// year's YTD/quarter. Months with no P&L range yet are reported as skipped —
// re-run after importing those months' P&L. Only the regular Farm P&L is touched
// (not the Deferred P&L).
export async function persistLakatanRent(
  rows: RentMonthRow[],
  minYear = 2025,
  maxYear = 9999,
): Promise<{ updated: number; skipped: string[]; applicable: number }> {
  const applicable = rows.filter((r) => r.year >= minYear && r.year <= maxYear);
  if (applicable.length === 0) return { updated: 0, skipped: [], applicable: 0 };

  const { data: ranges } = await supabase.from('report_ranges').select('id, period_start').eq('kind', 'month');
  const idByYm = new Map(
    (ranges ?? []).map((r) => { const [y, m] = String(r.period_start).split('-').map(Number); return [`${y}-${m}`, r.id as string]; }),
  );

  let updated = 0;
  const skipped: string[] = [];
  const years = new Set<number>();
  for (const row of applicable) {
    const rid = idByYm.get(`${row.year}-${row.month}`);
    if (!rid) { skipped.push(`${row.year}-${String(row.month).padStart(2, '0')}`); continue; }
    const inputs = await loadFarmInputs(rid, false);
    inputs.land_rental = row.amount / 1000; // full pesos → ₱'000
    await supabase.from('computed_pnl').delete().eq('range_id', rid).eq('bu_code', FARM_BU_CODE).in('line_item', farmItemKeys(false));
    const { error } = await supabase.from('computed_pnl').insert(farmComputedRows(rid, inputs, false));
    if (error) throw error;
    updated++;
    years.add(row.year);
  }

  for (const y of years) await recomputeFarmAggregates(supabase, y);
  return { updated, skipped, applicable: applicable.length };
}
