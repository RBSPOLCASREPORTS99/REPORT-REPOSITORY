import { supabase } from './supabaseClient';
import { fetchCompanyPnl } from './companyQueries';

// Retained Earnings Allocation — a yearly report. POLCAS's overall Net Income is
// split across funds (each a % of Net Income); each fund is drawn down by line
// items. Everything is editable and stored as one JSON document per year. All
// amounts are FULL PESOS (the company P&L is in ₱'000, so its Net Income is
// ×1000 to seed the basis).

export interface ReItem { id: string; name: string; amount: number }
export interface ReFund { id: string; name: string; pct: number; items: ReItem[] }
export interface ReData {
  netIncomeOverride: number | null; // when set, used instead of the company P&L Net Income (full pesos)
  funds: ReFund[];
}

export const uid = (): string =>
  (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const newItem = (name = '', amount = 0): ReItem => ({ id: uid(), name, amount });
export const newFund = (name = 'New Fund', pct = 0): ReFund => ({ id: uid(), name, pct, items: [] });

// A fresh year starts with POLCAS's standard funds and their % of Net Income.
export const defaultFunds = (): ReFund[] => [
  { id: uid(), name: 'Business Dev Fund', pct: 0.20, items: [] },
  { id: uid(), name: 'Management Fund', pct: 0.05, items: [] },
  { id: uid(), name: 'Employees Dev Fund', pct: 0.10, items: [] },
  { id: uid(), name: 'Contingency Fund', pct: 0.05, items: [] },
];

// POLCAS overall Net Income for a full year, in full pesos (company P&L is ₱'000).
export async function fetchCompanyNetIncomeForYear(year: number): Promise<number> {
  const r = await fetchCompanyPnl({ start: `${year}-01-01`, end: `${year}-12-31` });
  return r.hasData ? r.net * 1000 : 0;
}

function normFund(f: Partial<ReFund>): ReFund {
  return {
    id: f.id || uid(),
    name: typeof f.name === 'string' ? f.name : '',
    pct: Number(f.pct) || 0,
    items: Array.isArray(f.items)
      ? f.items.map((i) => ({ id: i.id || uid(), name: typeof i.name === 'string' ? i.name : '', amount: Number(i.amount) || 0 }))
      : [],
  };
}

export async function loadRetainedEarnings(year: number): Promise<ReData> {
  try {
    const { data, error } = await supabase.from('br_retained_earnings').select('data').eq('year', year).maybeSingle();
    if (error || !data?.data) return { netIncomeOverride: null, funds: defaultFunds() };
    const d = data.data as Partial<ReData>;
    const funds = Array.isArray(d.funds) && d.funds.length > 0 ? d.funds.map(normFund) : defaultFunds();
    return { netIncomeOverride: d.netIncomeOverride == null ? null : Number(d.netIncomeOverride), funds };
  } catch {
    return { netIncomeOverride: null, funds: defaultFunds() };
  }
}

export async function saveRetainedEarnings(year: number, data: ReData): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from('br_retained_earnings')
    .upsert({ year, data, updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() }, { onConflict: 'year' });
  if (error) throw error;
}
