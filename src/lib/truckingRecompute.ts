import { supabase } from './supabaseClient';
import { TRUCKING_CODES } from './pnl/buConfig';
import { TRUCKS } from './pnl/truckConfig';
import { deriveRanges } from './pnl/deriveRanges';
import type { TruckingInputs } from './pnl/computeBuPnl';

// The standalone Trucking screen edits a month's per-BU trucking cost and
// re-derives the year's ranges so the P&L (month + YTD + quarter) refreshes.

export interface TruckingMonth {
  id: string;
  year: number;
  month: number;
  label: string;
}

export async function listTruckingMonths(): Promise<TruckingMonth[]> {
  const { data, error } = await supabase
    .from('pnl_months').select('id, year, month, label')
    .order('year', { ascending: false }).order('month', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TruckingMonth[];
}

// Existing trucking for a year+month if that month was already imported — used
// to pre-fill the import wizard when re-importing/updating a month.
export async function loadTruckingByYearMonth(year: number, month: number): Promise<TruckingInputs | null> {
  const { data } = await supabase.from('pnl_months').select('id').eq('year', year).eq('month', month).maybeSingle();
  if (!data) return null;
  return loadMonthTrucking(data.id as string);
}

export async function loadMonthTrucking(monthId: string): Promise<TruckingInputs> {
  const { data, error } = await supabase.from('monthly_trucking').select('trucking_code, amount').eq('month_id', monthId);
  if (error) throw error;
  const out: TruckingInputs = {};
  for (const r of data ?? []) out[r.trucking_code as string] = r.amount as number;
  return out;
}

// The per-BU trucking allocation stored for a calendar month (from the TRUCKING
// DASHBOARD "Sales per BU" history) — used to preview the P&L on import.
export async function loadStoredAlloc(year: number, month: number): Promise<TruckingInputs> {
  const { data } = await supabase.from('monthly_bu_alloc').select('bu_code, amount').eq('year', year).eq('month', month);
  const out: TruckingInputs = {};
  for (const r of data ?? []) out[r.bu_code as string] = r.amount as number;
  return out;
}

// Existing manual per-truck Salaries & Wages for a month, to pre-fill the grid.
export async function loadTruckSalaries(year: number, month: number): Promise<Record<string, number>> {
  const { data: pm } = await supabase.from('pnl_months').select('id').eq('year', year).eq('month', month).maybeSingle();
  if (!pm) return {};
  const { data } = await supabase.from('monthly_truck_salary').select('truck_code, amount').eq('month_id', pm.id as string);
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.truck_code as string] = r.amount as number;
  return out;
}

// Whether per-truck income has already been imported for a month (dashboard notif).
export async function truckIncomeExists(year: number, month: number): Promise<boolean> {
  const { data: pm } = await supabase.from('pnl_months').select('id').eq('year', year).eq('month', month).maybeSingle();
  if (!pm) return false;
  const { count } = await supabase.from('monthly_truck_income').select('month_id', { count: 'exact', head: true }).eq('month_id', pm.id as string);
  return (count ?? 0) > 0;
}

// Per-truck Salaries & Wages for a month (edited on the Truck Salaries screen).
export async function loadMonthSalaries(monthId: string): Promise<Record<string, number>> {
  const { data } = await supabase.from('monthly_truck_salary').select('truck_code, amount').eq('month_id', monthId);
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.truck_code as string] = r.amount as number;
  return out;
}

// Data for reconciling the manual per-truck salaries to the QuickBooks BU10
// total: the authoritative "Total BU10 - TRUCK" Salaries and Wages for the month
// (null when the month was imported before this was captured — re-import to fill)
// plus each truck's Gross Income (Trucking Income − COGS, ₱ '000) used as the
// proration weight for the variance.
export interface TruckReconcile {
  bu10Total: number | null;
  grossByTruck: Record<string, number>;
}

export async function loadTruckReconcile(monthId: string): Promise<TruckReconcile> {
  const [salRes, incRes, inpRes] = await Promise.all([
    supabase.from('monthly_bu10_salary').select('amount').eq('month_id', monthId).maybeSingle(),
    supabase.from('monthly_truck_income').select('truck_code, income').eq('month_id', monthId),
    supabase.from('monthly_truck_inputs').select('truck_code, cogs').eq('month_id', monthId),
  ]);
  const bu10Total = salRes.data ? Number(salRes.data.amount) : null;
  const gross: Record<string, number> = {};
  for (const r of incRes.data ?? []) gross[r.truck_code as string] = (gross[r.truck_code as string] ?? 0) + Number(r.income);
  for (const r of inpRes.data ?? []) gross[r.truck_code as string] = (gross[r.truck_code as string] ?? 0) - Number(r.cogs);
  return { bu10Total, grossByTruck: gross };
}

export async function saveMonthSalaries(monthId: string, salaries: Record<string, number>): Promise<void> {
  await supabase.from('monthly_truck_salary').delete().eq('month_id', monthId);
  const rows = TRUCKS.map((t) => ({ month_id: monthId, truck_code: t.code, amount: salaries[t.code] ?? 0 })).filter((r) => r.amount !== 0);
  if (rows.length) {
    const { error } = await supabase.from('monthly_truck_salary').insert(rows);
    if (error) throw error;
  }
}

export async function saveMonthTrucking(monthId: string, year: number, trucking: TruckingInputs): Promise<void> {
  await supabase.from('monthly_trucking').delete().eq('month_id', monthId);
  const rows = TRUCKING_CODES.map((code) => ({ month_id: monthId, trucking_code: code, amount: trucking[code] ?? 0 })).filter((r) => r.amount !== 0);
  if (rows.length) {
    const { error } = await supabase.from('monthly_trucking').insert(rows);
    if (error) throw error;
  }
  await deriveRanges(supabase, year); // refresh month + YTD + quarter ranges
}
