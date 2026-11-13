import { supabase } from './supabaseClient';

// Support-center allocation computed in-system from each unit's configured method
// + manual inputs (Finance per-#Transaction, HR per-PAX, Management % of Revenue).
// A leaf module (only imports supabase) so both queries.ts and supportQueries.ts
// can use it without an import cycle. All amounts ₱'000.

export type SupportMethod = 'pct' | 'per_txn' | 'per_pax';
export type SupportUnit = 'FINANCE' | 'HR' | 'MANCOM';
export interface SupportOverride { finance: number; hr: number; mancom: number }
export interface SupportConfig { pct: number; exclude: string[]; method: SupportMethod; rate: number }

// The BUs a support unit bills, with their pivot columns (for import) and the
// label shown in the services breakdown.
export const SERVICE_BUS: { code: string; label: string; cols: string[] }[] = [
  { code: 'BU0102', label: 'BU01/BU02', cols: ['BU01 - Bodega 1', 'BU02 - Bodega 2'] },
  { code: 'BU04', label: 'BU04', cols: ['BU04 - Bodega 4 Wooden Pallets'] },
  { code: 'BU05', label: 'BU05', cols: ['BU05 - Trading'] },
  { code: 'BU06', label: 'BU06', cols: ['BU06 - CCG/CPG/PGF'] },
  { code: 'BU07', label: 'BU07', cols: ['BU07 - Hogs Partnership Growing'] },
  { code: 'BU08', label: 'BU08', cols: ['Total BU08 - Lakatan Growing/Trading'] },
  { code: 'BU09', label: 'BU09', cols: ['BU09 - Hog Feeds Production'] },
  { code: 'BU10', label: 'BU10', cols: ['Total BU10 - TRUCK'] },
  { code: 'BU11', label: 'BU11', cols: ['BU11 - Agri-Solutions'] },
];

// Support "service BU" code → the computed BU code used elsewhere. Lakatan
// support bills BU08, attributed to the Packhouse (BU08PH), as before.
const SUPPORT_TO_BU: Record<string, string> = { BU08: 'BU08PH' };

export async function fetchSupportConfig(unit: SupportUnit): Promise<SupportConfig> {
  const { data } = await supabase.from('support_unit_config').select('pct_of_revenue, exclude_bus, method, rate').eq('unit', unit).maybeSingle();
  return {
    pct: data ? Number(data.pct_of_revenue) : 0,
    exclude: (data?.exclude_bus as string[]) ?? [],
    method: (data?.method as SupportMethod) ?? 'pct',
    rate: data ? Number(data.rate) : 0,
  };
}

export const monthsInPeriod = (start: string, end: string) => {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const out: { year: number; month: number }[] = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) { out.push({ year: y, month: m }); m++; if (m > 12) { m = 1; y++; } }
  return out;
};

export async function monthIds(period: { start: string; end: string }): Promise<string[]> {
  const months = monthsInPeriod(period.start, period.end);
  const years = [...new Set(months.map((x) => x.year))];
  const inSet = new Set(months.map((x) => `${x.year}-${x.month}`));
  const { data: pm } = await supabase.from('pnl_months').select('id, year, month').in('year', years);
  return (pm ?? []).filter((r) => inSet.has(`${r.year}-${r.month}`)).map((r) => r.id as string);
}

// Per-BU service basis over a period: revenue (% method) or summed counts.
export async function serviceBasis(period: { start: string; end: string }, unit: SupportUnit, method: SupportMethod): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (method === 'pct') {
    const ids = await monthIds(period);
    if (ids.length === 0) return out;
    const { data } = await supabase.from('monthly_support_bu_revenue').select('bu_code, gross_sales').in('month_id', ids);
    for (const r of data ?? []) out.set(r.bu_code as string, (out.get(r.bu_code as string) ?? 0) + Number(r.gross_sales));
  } else {
    const months = monthsInPeriod(period.start, period.end);
    const years = [...new Set(months.map((x) => x.year))];
    const inSet = new Set(months.map((x) => `${x.year}-${x.month}`));
    const { data } = await supabase.from('support_bu_count').select('year, month, bu_code, count').eq('unit', unit).in('year', years);
    for (const r of data ?? []) if (inSet.has(`${r.year}-${r.month}`)) out.set(r.bu_code as string, (out.get(r.bu_code as string) ?? 0) + Number(r.count));
  }
  return out;
}

// Per-BU support-center allocation for a period (₱'000), keyed by computed BU
// code — the "Simulated" Support Allocation the Home / BU boxes apply to Net
// Income. Available for every month the counts/revenue exist (no import needed).
export async function simulatedSupportByBu(period: { start: string; end: string }): Promise<Map<string, SupportOverride>> {
  const out = new Map<string, SupportOverride>();
  for (const b of SERVICE_BUS) {
    const bu = SUPPORT_TO_BU[b.code] ?? b.code;
    if (!out.has(bu)) out.set(bu, { finance: 0, hr: 0, mancom: 0 });
  }
  const units: { unit: SupportUnit; key: keyof SupportOverride }[] = [
    { unit: 'FINANCE', key: 'finance' }, { unit: 'HR', key: 'hr' }, { unit: 'MANCOM', key: 'mancom' },
  ];
  for (const { unit, key } of units) {
    const cfg = await fetchSupportConfig(unit);
    const basis = await serviceBasis(period, unit, cfg.method);
    const excl = new Set(cfg.exclude);
    for (const b of SERVICE_BUS) {
      if (excl.has(b.code)) continue;
      const v = basis.get(b.code) ?? 0;
      if (v === 0) continue;
      // ₱'000: % → revenue(₱'000) × pct; per-#/per-PAX → count × rate(full) ÷ 1000.
      const amt = cfg.method === 'pct' ? v * cfg.pct : (v * cfg.rate) / 1000;
      out.get(SUPPORT_TO_BU[b.code] ?? b.code)![key] += amt;
    }
  }
  return out;
}

// Whether the support units are configured at all — if so, the Simulated
// allocation is offered on every month.
export async function supportConfigured(): Promise<boolean> {
  const { data } = await supabase.from('support_unit_config').select('unit').limit(1);
  return (data ?? []).length > 0;
}
