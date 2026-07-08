import { supabase } from '../supabaseClient';
import { TRUCKING_CODES } from '../pnl/buConfig';
import { TRUCKS } from '../pnl/truckConfig';
import { deriveRanges } from '../pnl/deriveRanges';
import { excelSerial, type ParsedDashboard } from './parseTruckingDashboard';
import { monthLabel } from '../format';

// Persist the TRUCKING DASHBOARD:
//  - "Sales per BU": the WHOLE month history is stored in monthly_bu_alloc for
//    future reference, so per-month P&L files imported later auto-pick up their
//    trucking allocation. Any already-imported P&L month is refreshed now.
//  - "Sales per Truck": only the SELECTED month's per-truck income is stored
//    (monthly_truck_income); re-importing the same month updates it.
export interface DashboardPersistArgs {
  year: number;
  month: number;
  parsed: ParsedDashboard;
  fileName: string;
  userId: string;
}

export async function persistTruckingDashboard(args: DashboardPersistArgs): Promise<{ trucks: number; allocMonths: number; refreshed: number }> {
  const { year, month, parsed, fileName, userId } = args;
  const serial = excelSerial(year, month);
  const income = parsed.truckIncome.get(serial) ?? {};

  await supabase.from('import_batches').insert({
    source_report: 'BR', filename: fileName, storage_path: null, uploaded_by: userId, row_count: 0, status: 'confirmed',
  });

  // 1. Store the FULL Sales-per-BU allocation history (all months) for reference.
  const allocRows: { year: number; month: number; bu_code: string; amount: number }[] = [];
  for (const m of parsed.months) {
    const alloc = parsed.buAlloc.get(m.serial) ?? {};
    for (const code of TRUCKING_CODES) {
      const amt = alloc[code] ?? 0;
      if (amt !== 0) allocRows.push({ year: m.year, month: m.month, bu_code: code, amount: amt });
    }
  }
  for (let i = 0; i < allocRows.length; i += 500) {
    const { error } = await supabase.from('monthly_bu_alloc').upsert(allocRows.slice(i, i + 500), { onConflict: 'year,month,bu_code' });
    if (error) throw error;
  }

  // 2. Selected month's per-truck income (₱ full pesos → ₱'000, matching the P&L).
  const { data: existing } = await supabase.from('pnl_months').select('id').eq('year', year).eq('month', month).maybeSingle();
  let monthId: string;
  if (existing) {
    monthId = existing.id as string;
  } else {
    const { data: created, error } = await supabase.from('pnl_months').insert({
      year, month, label: monthLabel(year, month), uploaded_by: userId,
    }).select('id').single();
    if (error) throw error;
    monthId = created.id as string;
  }
  await supabase.from('monthly_truck_income').delete().eq('month_id', monthId);
  const truckRows = TRUCKS
    .filter((t) => income[t.code] != null)
    .map((t) => ({ month_id: monthId, truck_code: t.code, plate: t.plate, income: income[t.code] / 1000 }));
  if (truckRows.length) {
    const { error } = await supabase.from('monthly_truck_income').insert(truckRows);
    if (error) throw error;
  }

  // 3. Refresh trucking allocation for every already-imported P&L month that the
  // dashboard covers, then re-derive those years.
  const { data: pmonths } = await supabase.from('pnl_months').select('id, year, month');
  const affectedYears = new Set<number>();
  let refreshed = 0;
  for (const pm of pmonths ?? []) {
    const alloc = parsed.buAlloc.get(excelSerial(pm.year as number, pm.month as number));
    if (!alloc) continue;
    await supabase.from('monthly_trucking').delete().eq('month_id', pm.id as string);
    const rows = TRUCKING_CODES.map((code) => ({ month_id: pm.id as string, trucking_code: code, amount: alloc[code] ?? 0 })).filter((r) => r.amount !== 0);
    if (rows.length) await supabase.from('monthly_trucking').insert(rows);
    affectedYears.add(pm.year as number);
    refreshed++;
  }
  for (const y of affectedYears) await deriveRanges(supabase, y);

  return { trucks: truckRows.length, allocMonths: parsed.months.length, refreshed };
}
