import type { SupabaseClient } from '@supabase/supabase-js';
import { BU_CONFIGS, TRUCKING_CODES, type BuConfig } from './buConfig';
import type { ParsedPivot } from '../importers/parsePivotTab';

// Codes that already have a hardcoded, Excel-validated config. User-added BUs
// never override these, so a member class (e.g. BU08, folded into BU08PH) can't
// be double-counted even if someone re-adds it.
const KNOWN = new Set(BU_CONFIGS.map((c) => c.buCode));

// Find the pivot column(s) that belong to a BU by matching its code against the
// column header. QuickBooks "P&L by Class" headers are "BUxx - Name" (or a
// rolled-up "Total BUxx - Name"), so a new unit added with the same code it
// carries in QuickBooks is picked up automatically — no code change needed.
export function autoMemberColumns(pivot: ParsedPivot, code: string): string[] {
  const cu = code.trim().toUpperCase();
  if (!cu) return [];
  const bare = (h: string) => h.replace(/^total\s+/i, '').toUpperCase();
  const isMatch = (h: string) => {
    const b = bare(h);
    return b === cu || b.startsWith(`${cu} `) || b.startsWith(`${cu}-`);
  };
  const cands = pivot.columns.filter((c) => isMatch(c.header));
  if (cands.length === 0) return [];
  // Prefer the rolled-up "Total <code>" column (it already sums the BU's
  // sub-classes); otherwise a top-level class column; otherwise the first hit.
  const total = cands.find((c) => /^total\s/i.test(c.header));
  if (total) return [total.header];
  const top = cands.find((c) => c.topLevel);
  return [(top ?? cands[0]).header];
}

// Build a compute config for a user-added BU. Figures come from the matched
// pivot column; defaults mirror a standard profit center (shares in the
// support-center + admin/cost-of-money pools by gross-sales pro-rata).
export function autoBuConfig(code: string, name: string, pivot?: ParsedPivot | null): BuConfig {
  return {
    buCode: code,
    buName: name,
    memberColumns: pivot ? autoMemberColumns(pivot, code) : [],
    truckingMembers: TRUCKING_CODES.includes(code) ? [code] : [],
    includeSupportCenters: true,
    allocationMethod: 'gross_sales',
  };
}

// The full compute list = hardcoded validated BUs + any user-added BUs flagged
// `auto_compute`. Pass the pivot at import time so the added BUs' columns are
// resolved; omit it for re-derivation (which works from already-stored inputs
// and doesn't need memberColumns).
export async function loadBuConfigs(db: SupabaseClient, pivot?: ParsedPivot | null): Promise<BuConfig[]> {
  const { data } = await db
    .from('business_units')
    .select('code, name, auto_compute')
    .eq('auto_compute', true)
    .order('sort_order');
  const extras = (data ?? [])
    .filter((b) => !KNOWN.has(b.code as string))
    .map((b) => autoBuConfig(b.code as string, b.name as string, pivot));
  return [...BU_CONFIGS, ...extras];
}
