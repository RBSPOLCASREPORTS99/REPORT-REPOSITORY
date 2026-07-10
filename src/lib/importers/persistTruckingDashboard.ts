import { supabase } from '../supabaseClient';
import { TRUCKING_CODES } from '../pnl/buConfig';
import { TRUCKS } from '../pnl/truckConfig';
import { deriveRanges } from '../pnl/deriveRanges';
import { excelSerial, type ParsedDashboard } from './parseTruckingDashboard';

// Persist the TRUCKING DASHBOARD as a one-time full-history upload:
//  - "Sales per BU": the whole month history -> monthly_bu_alloc (trucking
//    allocation for the main P&L).
//  - "Sales per Truck": per-truck income for EVERY month the dashboard covers
//    that has an imported P&L month -> monthly_truck_income (so the Truck P&L
//    has income for all months, not just the one imported "for").
// Re-importing replaces the months present.
export interface DashboardPersistArgs {
  year: number;
  month: number;
  parsed: ParsedDashboard;
  fileName: string;
  userId: string;
}

export async function persistTruckingDashboard(args: DashboardPersistArgs): Promise<{ truckMonths: number; allocMonths: number }> {
  const { parsed, fileName, userId } = args;

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

  // 2. For every imported P&L month the dashboard covers: store per-truck income
  // AND refresh the per-BU trucking allocation, then re-derive those years.
  const { data: pmonths } = await supabase.from('pnl_months').select('id, year, month');
  const affectedYears = new Set<number>();
  let truckMonths = 0;
  for (const pm of pmonths ?? []) {
    const serial = excelSerial(pm.year as number, pm.month as number);
    const income = parsed.truckIncome.get(serial);
    const alloc = parsed.buAlloc.get(serial);
    if (!income && !alloc) continue;
    const monthId = pm.id as string;

    if (income) {
      await supabase.from('monthly_truck_income').delete().eq('month_id', monthId);
      const rows = TRUCKS.filter((t) => income[t.code] != null).map((t) => ({ month_id: monthId, truck_code: t.code, plate: t.plate, income: income[t.code] / 1000 }));
      if (rows.length) { const { error } = await supabase.from('monthly_truck_income').insert(rows); if (error) throw error; truckMonths++; }
    }
    if (alloc) {
      await supabase.from('monthly_trucking').delete().eq('month_id', monthId);
      const rows = TRUCKING_CODES.map((code) => ({ month_id: monthId, trucking_code: code, amount: alloc[code] ?? 0 })).filter((r) => r.amount !== 0);
      if (rows.length) await supabase.from('monthly_trucking').insert(rows);
    }
    affectedYears.add(pm.year as number);
  }
  for (const y of affectedYears) await deriveRanges(supabase, y);

  return { truckMonths, allocMonths: parsed.months.length };
}
