// Per-BU operational KPIs ("Parameters"). Each parameter is one of:
//  - manual: a value Finance types per period.
//  - pnl:    sum of the BU's computed P&L lines (₱'000 → ×1000 full pesos).
//  - sum:    sum of other parameters.
//  - ratio:  derived num ÷ den from other parameters (computed per period, so a
//            YTD ratio uses YTD totals, matching the Excel).
//  - divide: another parameter ÷ a constant (e.g. bags = kilos ÷ 50).
//  - external: value computed outside this engine (e.g. GFFC avg sales/day); only
//              its STD is entered here.
export type ParamSource =
  | { kind: 'manual' }
  | { kind: 'pnl'; lines: string[] }
  | { kind: 'sum'; of: string[] }
  | { kind: 'ratio'; num: string; den: string }
  | { kind: 'divide'; of: string; by: number }
  | { kind: 'external' };

export interface ParamDef {
  key: string;
  label: string;
  source: ParamSource;
  hidden?: boolean;   // internal base used by a sum/ratio; not shown as its own row
  decimals?: number;  // display precision
  pct?: boolean;      // render as a percentage
  peso?: boolean;     // render with ₱ prefix
  cost?: boolean;     // a cost: an increase is unfavourable (%DIFF shown red)
  group?: string;     // section header this row sits under (e.g. per feed type)
  groupTotal?: boolean; // the group's Total row (shown on the header when collapsed)
  // Manual params only: how to combine the monthly entries into a YTD/quarter
  // value. Additive quantities 'sum' (default); rates/averages 'avg'.
  aggregate?: 'sum' | 'avg';
}

export interface BuParamConfig { params: ParamDef[]; noStd?: boolean; }

const M = (key: string, label: string, decimals = 0, extra: Partial<ParamDef> = {}): ParamDef => ({ key, label, source: { kind: 'manual' }, decimals, ...extra });
const PNL = (key: string, lines: string[]): ParamDef => ({ key, label: key, source: { kind: 'pnl', lines }, hidden: true });
const SUM = (key: string, of: string[]): ParamDef => ({ key, label: key, source: { kind: 'sum', of }, hidden: true });
const R = (key: string, label: string, num: string, den: string, decimals = 2, extra: Partial<ParamDef> = {}): ParamDef => ({ key, label, source: { kind: 'ratio', num, den }, decimals, ...extra });
const D = (key: string, label: string, of: string, by: number, decimals = 0, extra: Partial<ParamDef> = {}): ParamDef => ({ key, label, source: { kind: 'divide', of, by }, decimals, ...extra });
// Visible sum of other params (a shown "Total" row, unlike the hidden SUM helper).
const SUMV = (key: string, label: string, of: string[], decimals = 0, extra: Partial<ParamDef> = {}): ParamDef => ({ key, label, source: { kind: 'sum', of }, decimals, ...extra });
// Externally-computed param whose STD (target) is still entered here.
const E = (key: string, label: string, decimals = 0, extra: Partial<ParamDef> = {}): ParamDef => ({ key, label, source: { kind: 'external' }, decimals, ...extra });
// Manual rate/average params combine across months by averaging (not summing).
const AVG: Partial<ParamDef> = { aggregate: 'avg' };

// Only BUs listed here get a Parameters tab. The P&L-line mappings (Labor =
// Salaries & Wages, Ops = Operations + Repairs, etc.) replicate the Excel's
// intent; a few (BU04 overhead, BU09 production cost) are conservative and worth
// verifying against the source workbook.
export const BU_PARAM_CONFIG: Record<string, BuParamConfig> = {
  BU07: {
    params: [
      M('growing_cost_per_kilo', 'Growing Cost per Kilo', 2, { peso: true, cost: true, ...AVG }),
      M('avg_grower_price', 'Average Grower Hogs Price', 2, { peso: true, ...AVG }),
      // Operations Cost = Operations + allocated Trucking Services + Salaries & Wages.
      PNL('ops_cost', ['operations_expense', 'trucking_expense', 'salaries_expense']),
      R('ops_cost_per_kilo', 'Operations Cost per Kilo', 'ops_cost', 'harvested_kilos', 2, { peso: true, cost: true }),
      M('feeds_cost_per_kilo', 'Feeds Cost per Hogs Kilo', 2, { peso: true, cost: true, ...AVG }),
      M('sold_feeds_ppk', 'Sold Feeds PPK', 2, { peso: true, ...AVG }),
      M('adg', 'Average Daily Gain', 3, AVG),
      M('fcr', 'Feed Conversion Ratio', 2, AVG),
      M('mortality_pct', '% Mortality (harvested pens)', 1, { pct: true, ...AVG }),
      M('harvested_heads', 'Harvested Hogs in Heads', 0),
      M('harvested_kilos', 'Harvested Hogs in Kilos', 0),
      R('avg_weight', 'Average Weight per Hog (kg)', 'harvested_kilos', 'harvested_heads', 1),
    ],
  },
  BU0102: {
    params: [
      PNL('labor_cost', ['salaries_expense']),
      // Operating cost includes allocated Trucking Services alongside Operations
      // and Repairs, so Operating CPK (and Production Cost per Kilo) reflect it.
      PNL('ops_cost', ['operations_expense', 'repairs_expense', 'trucking_expense']),
      SUM('prod_plus_delivery', ['production_kilo', 'delivered_kilo']),
      SUM('total_cost', ['labor_cost', 'ops_cost']),
      M('prod_kilos_per_manhour', 'Prod Kilos per Man-Hours', 0, AVG), // entered manually, not derived
      M('rejection_count', '# Rejection', 0),
      M('kilos_per_bag', 'Kilos per Bag', 1, AVG), // manual (avg kg per bag), not derived
      R('labor_cpk', 'Labor CPK (Prod + Delivery)', 'labor_cost', 'prod_plus_delivery', 2, { peso: true, cost: true }),
      R('operating_cpk', 'Operating CPK', 'ops_cost', 'prod_plus_delivery', 2, { peso: true, cost: true }),
      R('production_cost_per_kilo', 'Production Cost per Kilo', 'total_cost', 'prod_plus_delivery', 2, { peso: true, cost: true }),
      M('production_kilo', 'Production in Kilo', 0),
      M('delivered_kilo', 'Delivered in Kilo', 0),
      M('production_hours', 'Production Hours', 0),
    ],
  },
  BU04: {
    params: [
      PNL('lumber_cost', ['cogs']),
      PNL('ops_cost', ['operations_expense']),
      PNL('labor_cost', ['salaries_expense']),
      PNL('trucking_cost', ['trucking_expense']),
      R('lumber_cost_per_pallet', 'Lumber Cost per Pallet', 'lumber_cost', 'accepted_delivery', 2, { peso: true, cost: true }),
      R('operating_cost_per_pallet', 'Operating Cost per Pallet', 'ops_cost', 'accepted_delivery', 2, { peso: true, cost: true }),
      M('overhead_cost_per_pallet', 'Overhead Cost per Pallet', 2, { peso: true, cost: true, ...AVG }),
      R('labor_cost_per_pallet', 'Labor Cost per Pallet', 'labor_cost', 'accepted_delivery', 2, { peso: true, cost: true }),
      R('trucking_cost_per_pallet', 'Trucking Cost per Pallet', 'trucking_cost', 'accepted_delivery', 2, { peso: true, cost: true }),
      M('cost_per_pallet', 'Cost per Pallet', 2, { peso: true, cost: true, ...AVG }),
      M('board_foot_per_pallet', 'Board Foot per Pallet', 2, AVG),
      M('delivery', 'Delivery (pallets)', 0),
      M('accepted_delivery', 'Accepted Delivery', 0),
      M('rejection_count', '# Rejection', 0),
      R('pct_rejection', '% Rejection', 'rejection_count', 'delivery', 1, { pct: true }),
    ],
  },
  // BU09 parameters are tracked per Hog Feeds Type (HSP / HGP / HFP): each type's
  // CPK, GPR, Production in KG and (derived) Production in Bags, plus a Total.
  // No standards column (the source sheet has no STD for the per-type KPIs).
  BU09: {
    noStd: true,
    params: [
      M('hsp_cpk', 'HSP', 2, { peso: true, cost: true, group: 'Hog Feeds CPK', ...AVG }),
      M('hgp_cpk', 'HGP', 2, { peso: true, cost: true, group: 'Hog Feeds CPK', ...AVG }),
      M('hfp_cpk', 'HFP', 2, { peso: true, cost: true, group: 'Hog Feeds CPK', ...AVG }),
      M('hsp_gpr', 'HSP', 1, { pct: true, group: 'Hog Feeds GPR (if sold to LPG)', ...AVG }),
      M('hgp_gpr', 'HGP', 1, { pct: true, group: 'Hog Feeds GPR (if sold to LPG)', ...AVG }),
      M('hfp_gpr', 'HFP', 1, { pct: true, group: 'Hog Feeds GPR (if sold to LPG)', ...AVG }),
      M('hsp_prod_kg', 'HSP', 0, { group: 'Hog Feeds Production in KG' }),
      M('hgp_prod_kg', 'HGP', 0, { group: 'Hog Feeds Production in KG' }),
      M('hfp_prod_kg', 'HFP', 0, { group: 'Hog Feeds Production in KG' }),
      SUMV('total_prod_kg', 'Total', ['hsp_prod_kg', 'hgp_prod_kg', 'hfp_prod_kg'], 0, { group: 'Hog Feeds Production in KG', groupTotal: true }),
      D('hsp_prod_bag', 'HSP', 'hsp_prod_kg', 50, 0, { group: 'Hog Feeds Production in Bags' }),
      D('hgp_prod_bag', 'HGP', 'hgp_prod_kg', 50, 0, { group: 'Hog Feeds Production in Bags' }),
      D('hfp_prod_bag', 'HFP', 'hfp_prod_kg', 50, 0, { group: 'Hog Feeds Production in Bags' }),
      D('total_prod_bag', 'Total', 'total_prod_kg', 50, 0, { group: 'Hog Feeds Production in Bags', groupTotal: true }),
    ],
  },
  // GFFC (Chickboy Meating Place) — manual operational KPIs only; the auto
  // parameters (avg selling price per category, avg sales/day per branch) are
  // computed from GFFC data in gffcQueries, not this engine.
  GFFC: {
    params: [
      M('carcass_recovery', '% Carcass Recovery', 1, { pct: true }),
      M('mcp_recovery', '% MCP Recovery', 1, { pct: true }),
      M('mcp_kilos_per_manhr', 'MCP Kilos per Man-Hr', 2),
      // Avg Sales/Day is computed per branch in the GFFC tab; only its STD (target)
      // is entered here (keys match the salesday_<branch> display rows).
      E('salesday_Main Branch', 'Avg Sales/Day — Main Branch', 0, { peso: true }),
      E('salesday_Branch 2', 'Avg Sales/Day — Branch 2', 0, { peso: true }),
    ],
  },
  BU11: {
    noStd: true, // the source sheet has no STD column
    params: [
      PNL('labor_cost', ['salaries_expense']),
      PNL('ops_cost', ['operations_expense', 'repairs_expense']),
      SUM('total_cost', ['labor_cost', 'ops_cost']),
      R('labor_cost_per_kilo', 'Labor Cost per Kilo', 'labor_cost', 'processed_kilos', 2, { peso: true, cost: true }),
      R('ops_cost_per_kilo', 'Ops Cost per Kilo', 'ops_cost', 'processed_kilos', 2, { peso: true, cost: true }),
      R('cost_per_kilo', 'Cost per Kilo', 'total_cost', 'processed_kilos', 2, { peso: true, cost: true }),
      // Kilos Processed (dried at MFBD) — per product, summed into the total.
      M('proc_banana', 'Banana', 0, { group: 'Kilos Processed' }),
      M('proc_cassava', 'Cassava', 0, { group: 'Kilos Processed' }),
      M('proc_yellow_corn', 'Yellow Corn', 0, { group: 'Kilos Processed' }),
      M('proc_anungal', 'Anungal', 0, { group: 'Kilos Processed' }),
      M('proc_palay', 'Palay', 0, { group: 'Kilos Processed' }),
      SUMV('processed_kilos', 'Total', ['proc_banana', 'proc_cassava', 'proc_yellow_corn', 'proc_anungal', 'proc_palay'], 0, { group: 'Kilos Processed', groupTotal: true }),
      // Kilos Delivered — per product, summed into the total.
      M('del_yellow_corn', 'Yellow Corn', 0, { group: 'Kilos Delivered' }),
      M('del_rice_bran', 'Rice Bran D1', 0, { group: 'Kilos Delivered' }),
      SUMV('kilos_delivered', 'Total', ['del_yellow_corn', 'del_rice_bran'], 0, { group: 'Kilos Delivered', groupTotal: true }),
    ],
  },
};

export const hasParameters = (buCode?: string): boolean => !!buCode && buCode in BU_PARAM_CONFIG;
// Whether a BU shows the STD (standards) column at all.
export const hasStdColumn = (buCode?: string): boolean => !!buCode && !!BU_PARAM_CONFIG[buCode] && !BU_PARAM_CONFIG[buCode].noStd;
