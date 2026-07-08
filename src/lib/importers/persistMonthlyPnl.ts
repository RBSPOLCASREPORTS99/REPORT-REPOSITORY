import { supabase } from '../supabaseClient';
import type { ParsedPivot } from './parsePivotTab';
import { loadBuConfigs } from '../pnl/loadBuConfigs';
import { TRUCKS, truckPivotColumn, extractTruckAccounts } from '../pnl/truckConfig';
import { extractBuInputs, extractPools } from '../pnl/computeBuPnl';
import { deriveRanges } from '../pnl/deriveRanges';
import { monthLabel } from '../format';

// Persist one month's P&L: store the compact additive inputs + pools, apply the
// stored trucking allocation, then re-derive all ranges for that year.
// Re-importing a month replaces it.
export interface MonthlyPersistArgs {
  year: number;
  month: number;
  pivot: ParsedPivot;
  truckSalaries: Record<string, number>; // manual per-truck Salaries & Wages (₱ '000)
  fileName: string;
  fileBuffer: ArrayBuffer;
  userId: string;
}

export async function persistMonthlyPnl(args: MonthlyPersistArgs): Promise<{ monthId: string; ranges: number }> {
  const { year, month, pivot, truckSalaries, fileName, userId } = args;

  // 1. audit record only — the raw file is NOT stored (its data is fully
  // extracted into the DB below and captured by the weekly backup).
  const { data: batch, error: batchErr } = await supabase.from('import_batches').insert({
    source_report: 'BR', filename: fileName, storage_path: null, uploaded_by: userId, row_count: 0, status: 'pending',
  }).select('id').single();
  if (batchErr) throw batchErr;

  // 3. upsert the month (replace on re-import)
  const { data: existing } = await supabase.from('pnl_months').select('id').eq('year', year).eq('month', month).maybeSingle();
  let monthId: string;
  if (existing) {
    monthId = existing.id;
    await supabase.from('pnl_months').update({ import_batch_id: batch.id, uploaded_by: userId }).eq('id', monthId);
  } else {
    const { data: created, error } = await supabase.from('pnl_months').insert({
      year, month, label: monthLabel(year, month), import_batch_id: batch.id, uploaded_by: userId,
    }).select('id').single();
    if (error) throw error;
    monthId = created.id;
  }

  // 4. replace inputs / pools / trucking
  await supabase.from('monthly_pnl_inputs').delete().eq('month_id', monthId);
  const configs = await loadBuConfigs(supabase, pivot);
  const inputRows = configs.filter((c) => !c.manualEntry).map((cfg) => ({ month_id: monthId, bu_code: cfg.buCode, ...extractBuInputs(pivot, cfg) }));
  const { error: inErr } = await supabase.from('monthly_pnl_inputs').insert(inputRows);
  if (inErr) throw inErr;

  const pools = extractPools(pivot);
  await supabase.from('monthly_pnl_pools').delete().eq('month_id', monthId);
  const { error: poolErr } = await supabase.from('monthly_pnl_pools').insert({ month_id: monthId, ...pools });
  if (poolErr) throw poolErr;

  // Trucking allocation comes from the stored dashboard "Sales per BU" history
  // (monthly_bu_alloc) for this month. Left untouched if the dashboard hasn't
  // been imported for this month yet, so an existing allocation isn't wiped.
  const { data: alloc } = await supabase.from('monthly_bu_alloc').select('bu_code, amount').eq('year', year).eq('month', month);
  if (alloc && alloc.length) {
    await supabase.from('monthly_trucking').delete().eq('month_id', monthId);
    const truckRows = alloc.filter((a) => a.amount !== 0).map((a) => ({ month_id: monthId, trucking_code: a.bu_code as string, amount: a.amount as number }));
    if (truckRows.length) {
      const { error: tErr } = await supabase.from('monthly_trucking').insert(truckRows);
      if (tErr) throw tErr;
    }
  }

  // 4b. per-truck raw P&L lines for the Simulated P&L per Truck — pulled from the
  // QB per-truck columns ("BU10 - <plate> <code>"). Additive, separate table, so
  // this never affects the validated per-BU compute above.
  await supabase.from('monthly_truck_inputs').delete().eq('month_id', monthId);
  const presentTrucks = TRUCKS
    .map((t) => ({ truck: t, col: truckPivotColumn(pivot, t.plate) }))
    .filter((x): x is { truck: typeof TRUCKS[number]; col: string } => !!x.col);
  const truckInputRows = presentTrucks.map((x) => ({ month_id: monthId, truck_code: x.truck.code, ...extractBuInputs(pivot, { memberColumns: [x.col] }) }));
  if (truckInputRows.length) {
    const { error: tiErr } = await supabase.from('monthly_truck_inputs').insert(truckInputRows);
    if (tiErr) throw tiErr;
  }

  // 4c. per-truck expenses BY ACCOUNT (leaf accounts under each section).
  await supabase.from('monthly_truck_expense').delete().eq('month_id', monthId);
  const truckExpenseRows = presentTrucks.flatMap((x) =>
    extractTruckAccounts(pivot, x.col).map((a) => ({ month_id: monthId, truck_code: x.truck.code, section: a.section, account: a.account, amount: a.amount })),
  );
  for (let i = 0; i < truckExpenseRows.length; i += 500) {
    const { error: teErr } = await supabase.from('monthly_truck_expense').insert(truckExpenseRows.slice(i, i + 500));
    if (teErr) throw teErr;
  }

  // 4d. manual per-truck Salaries & Wages — overrides the QB salaries in the
  // per-truck P&L (QuickBooks posts BU10 salaries in total, not per truck).
  await supabase.from('monthly_truck_salary').delete().eq('month_id', monthId);
  const salaryRows = TRUCKS.map((t) => ({ month_id: monthId, truck_code: t.code, amount: truckSalaries[t.code] ?? 0 })).filter((r) => r.amount !== 0);
  if (salaryRows.length) {
    const { error: sErr } = await supabase.from('monthly_truck_salary').insert(salaryRows);
    if (sErr) throw sErr;
  }

  await supabase.from('import_batches').update({ status: 'confirmed' }).eq('id', batch.id);

  // 5. re-derive all ranges for the year
  const { ranges } = await deriveRanges(supabase, year);
  return { monthId, ranges };
}
