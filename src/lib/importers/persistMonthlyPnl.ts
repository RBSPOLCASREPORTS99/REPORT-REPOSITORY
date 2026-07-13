import { supabase } from '../supabaseClient';
import type { ParsedPivot } from './parsePivotTab';
import { TRUCKING_CODES } from '../pnl/buConfig';
import { loadBuConfigs } from '../pnl/loadBuConfigs';
import { TRUCKS, truckPivotColumn, extractTruckAccounts } from '../pnl/truckConfig';
import { extractBuInputs, extractPools, extractBu10Salaries, extractCogsVariance, type TruckingInputs } from '../pnl/computeBuPnl';
import { COLS } from '../pnl/buConfig';
import { SERVICE_BUS } from '../supportQueries';
import { deriveRanges } from '../pnl/deriveRanges';
import { monthLabel } from '../format';

// Persist one month's P&L: store the compact additive inputs + pools + trucking,
// then re-derive all ranges for that year. Re-importing a month replaces it.
// Per-truck Salaries & Wages are NOT touched here — they're edited on the
// separate Truck Salaries screen so they survive P&L re-imports.
export interface MonthlyPersistArgs {
  year: number;
  month: number;
  pivot: ParsedPivot;
  trucking: TruckingInputs; // per-BU trucking cost (₱ '000), pre-filled from the dashboard
  fileName: string;
  fileBuffer: ArrayBuffer;
  userId: string;
}

export async function persistMonthlyPnl(args: MonthlyPersistArgs): Promise<{ monthId: string; ranges: number }> {
  const { year, month, pivot, trucking, fileName, userId } = args;

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
  const inputRows = configs.filter((c) => !c.manualEntry).map((cfg) => ({ month_id: monthId, bu_code: cfg.buCode, ...extractBuInputs(pivot, cfg), cogs_variance: extractCogsVariance(pivot, cfg) }));
  const { error: inErr } = await supabase.from('monthly_pnl_inputs').insert(inputRows);
  if (inErr) throw inErr;

  const pools = extractPools(pivot);
  await supabase.from('monthly_pnl_pools').delete().eq('month_id', monthId);
  const { error: poolErr } = await supabase.from('monthly_pnl_pools').insert({ month_id: monthId, ...pools });
  if (poolErr) throw poolErr;

  // Per-BU trucking cost from the import grid (pre-filled from the dashboard's
  // Sales per BU, editable). Drives each BU's trucking allocation.
  await supabase.from('monthly_trucking').delete().eq('month_id', monthId);
  const truckRows = TRUCKING_CODES.map((code) => ({ month_id: monthId, trucking_code: code, amount: trucking[code] ?? 0 })).filter((r) => r.amount !== 0);
  if (truckRows.length) {
    const { error: tErr } = await supabase.from('monthly_trucking').insert(truckRows);
    if (tErr) throw tErr;
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

  // 4d. QB "Total BU10 - TRUCK" total Salaries and Wages — the authoritative BU10
  // driver-salary total, reconciled against the manual per-truck split on the
  // Salaries screen (variance prorated by each truck's Gross Income).
  const bu10Salaries = extractBu10Salaries(pivot);
  await supabase.from('monthly_bu10_salary').delete().eq('month_id', monthId);
  await supabase.from('monthly_bu10_salary').insert({ month_id: monthId, amount: bu10Salaries });

  // 4e. Company-wide Total P&L (POLCAS AGRI TRADE CORP.) — the QuickBooks
  // grand-total ("TOTAL") column, no allocations. Additive across months.
  const company = extractBuInputs(pivot, { memberColumns: [COLS.companyTotal] });
  await supabase.from('monthly_company_pnl').delete().eq('month_id', monthId);
  await supabase.from('monthly_company_pnl').insert({ month_id: monthId, ...company });

  // 4f. Support-unit P&L (Finance / HR / Management) — their actual expenses,
  // pulled from the matching class columns for the Simulated Support-Unit P&L.
  await supabase.from('monthly_support_pnl').delete().eq('month_id', monthId);
  const supportUnits = [
    { unit: 'FINANCE', col: COLS.finance },
    { unit: 'HR', col: COLS.hr },
    { unit: 'MANCOM', col: COLS.management },
  ];
  const supportRows = supportUnits.map((s) => ({ month_id: monthId, unit: s.unit, ...extractBuInputs(pivot, { memberColumns: [s.col] }) }));
  const { error: supErr } = await supabase.from('monthly_support_pnl').insert(supportRows);
  if (supErr) throw supErr;

  // 4f-2. per-account expense detail for the support units (their Expenses tab).
  await supabase.from('monthly_support_expense').delete().eq('month_id', monthId);
  const supExpRows = supportUnits.flatMap((s) =>
    extractTruckAccounts(pivot, s.col).filter((a) => a.section !== 'Cost of Goods Sold').map((a) => ({ month_id: monthId, unit: s.unit, section: a.section, account: a.account, amount: a.amount })),
  );
  for (let i = 0; i < supExpRows.length; i += 500) {
    const { error: seErr } = await supabase.from('monthly_support_expense').insert(supExpRows.slice(i, i + 500));
    if (seErr) throw seErr;
  }

  // 4g. per-BU revenue for the support-unit services breakdown (% method).
  await supabase.from('monthly_support_bu_revenue').delete().eq('month_id', monthId);
  const buRevRows = SERVICE_BUS.map((b) => ({ month_id: monthId, bu_code: b.code, gross_sales: extractBuInputs(pivot, { memberColumns: b.cols }).gross_sales }));
  const { error: brErr } = await supabase.from('monthly_support_bu_revenue').insert(buRevRows);
  if (brErr) throw brErr;

  await supabase.from('import_batches').update({ status: 'confirmed' }).eq('id', batch.id);

  // 5. re-derive all ranges for the year
  const { ranges } = await deriveRanges(supabase, year);
  return { monthId, ranges };
}
