import { supabase } from '../supabaseClient';
import { TRUCKING_CODES } from '../pnl/buConfig';
import { TRUCKS } from '../pnl/truckConfig';
import { deriveRanges } from '../pnl/deriveRanges';
import { excelSerial, type ParsedDashboard } from './parseTruckingDashboard';
import { monthLabel } from '../format';

// Persist one month from the TRUCKING DASHBOARD:
//  - per-truck income  -> monthly_truck_income
//  - per-BU allocation -> monthly_trucking (auto-fills what used to be typed by
//    hand), then re-derive ranges so the main P&L's trucking updates.
export interface DashboardPersistArgs {
  year: number;
  month: number;
  parsed: ParsedDashboard;
  fileName: string;
  userId: string;
}

export async function persistTruckingDashboard(args: DashboardPersistArgs): Promise<{ trucks: number; bus: number }> {
  const { year, month, parsed, fileName, userId } = args;
  const serial = excelSerial(year, month);
  const income = parsed.truckIncome.get(serial) ?? {};
  const alloc = parsed.buAlloc.get(serial) ?? {};

  const { data: batch } = await supabase.from('import_batches').insert({
    source_report: 'BR', filename: fileName, storage_path: null, uploaded_by: userId, row_count: 0, status: 'confirmed',
  }).select('id').single();

  // Ensure the month exists (the dashboard may be imported before that month's P&L).
  const { data: existing } = await supabase.from('pnl_months').select('id').eq('year', year).eq('month', month).maybeSingle();
  let monthId: string;
  if (existing) {
    monthId = existing.id;
  } else {
    const { data: created, error } = await supabase.from('pnl_months').insert({
      year, month, label: monthLabel(year, month), import_batch_id: batch?.id ?? null, uploaded_by: userId,
    }).select('id').single();
    if (error) throw error;
    monthId = created.id;
  }

  // Per-truck income (authoritative trip-based income). "Sales per Truck" is in
  // full pesos; the app stores everything in ₱'000 to match the per-truck
  // expenses (which come from the QB pivot ÷ 1000). "Sales per BU" is already in
  // ₱'000, and only its ratio matters for the allocation, so it's stored as-is.
  await supabase.from('monthly_truck_income').delete().eq('month_id', monthId);
  const truckRows = TRUCKS
    .filter((t) => income[t.code] != null)
    .map((t) => ({ month_id: monthId, truck_code: t.code, plate: t.plate, income: income[t.code] / 1000 }));
  if (truckRows.length) {
    const { error } = await supabase.from('monthly_truck_income').insert(truckRows);
    if (error) throw error;
  }

  // Auto-fill the per-BU trucking allocation (replaces manual entry for the month).
  await supabase.from('monthly_trucking').delete().eq('month_id', monthId);
  const buRows = TRUCKING_CODES
    .map((code) => ({ month_id: monthId, trucking_code: code, amount: alloc[code] ?? 0 }))
    .filter((r) => r.amount !== 0);
  if (buRows.length) {
    const { error } = await supabase.from('monthly_trucking').insert(buRows);
    if (error) throw error;
  }

  // Refresh the derived ranges so the main P&L trucking allocation updates.
  await deriveRanges(supabase, year);

  return { trucks: truckRows.length, bus: buRows.length };
}
