import { supabase } from './supabaseClient';
import { TRUCKING_CODES } from './pnl/buConfig';
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

export async function saveMonthTrucking(monthId: string, year: number, trucking: TruckingInputs): Promise<void> {
  await supabase.from('monthly_trucking').delete().eq('month_id', monthId);
  const rows = TRUCKING_CODES.map((code) => ({ month_id: monthId, trucking_code: code, amount: trucking[code] ?? 0 })).filter((r) => r.amount !== 0);
  if (rows.length) {
    const { error } = await supabase.from('monthly_trucking').insert(rows);
    if (error) throw error;
  }
  await deriveRanges(supabase, year); // refresh month + YTD + quarter ranges
}
