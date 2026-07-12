// Per-BU operational KPIs ("Parameters"). Each parameter is one of:
//  - manual: a value Finance types per period.
//  - pnl:    sum of the BU's computed P&L lines (₱'000 → ×1000 full pesos).
//  - sum:    sum of other parameters.
//  - ratio:  derived num ÷ den from other parameters (computed per period, so a
//            YTD ratio uses YTD totals, matching the Excel).
export type ParamSource =
  | { kind: 'manual' }
  | { kind: 'pnl'; lines: string[] }
  | { kind: 'sum'; of: string[] }
  | { kind: 'ratio'; num: string; den: string };

export interface ParamDef {
  key: string;
  label: string;
  source: ParamSource;
  hidden?: boolean;   // internal base used by a sum/ratio; not shown as its own row
  decimals?: number;  // display precision
  pct?: boolean;      // render as a percentage
  peso?: boolean;     // render with ₱ prefix
}

export interface BuParamConfig { params: ParamDef[]; }

const M = (key: string, label: string, decimals = 0, extra: Partial<ParamDef> = {}): ParamDef => ({ key, label, source: { kind: 'manual' }, decimals, ...extra });
const PNL = (key: string, lines: string[]): ParamDef => ({ key, label: key, source: { kind: 'pnl', lines }, hidden: true });
const SUM = (key: string, of: string[]): ParamDef => ({ key, label: key, source: { kind: 'sum', of }, hidden: true });
const R = (key: string, label: string, num: string, den: string, decimals = 2, extra: Partial<ParamDef> = {}): ParamDef => ({ key, label, source: { kind: 'ratio', num, den }, decimals, ...extra });

// Only BUs listed here get a Parameters tab. The P&L-line mappings (Labor =
// Salaries & Wages, Ops = Operations + Repairs, etc.) replicate the Excel's
// intent; a few (BU04 overhead, BU09 production cost) are conservative and worth
// verifying against the source workbook.
export const BU_PARAM_CONFIG: Record<string, BuParamConfig> = {
  BU07: {
    params: [
      M('growing_cost_per_kilo', 'Growing Cost per Kilo', 2, { peso: true }),
      M('avg_grower_price', 'Average Grower Hogs Price', 2, { peso: true }),
      PNL('ops_cost', ['operations_expense']),
      R('ops_cost_per_kilo', 'Operations Cost per Kilo', 'ops_cost', 'harvested_kilos', 2, { peso: true }),
      M('feeds_cost_per_kilo', 'Feeds Cost per Hogs Kilo', 2, { peso: true }),
      M('sold_feeds_ppk', 'Sold Feeds PPK', 2, { peso: true }),
      M('adg', 'Average Daily Gain', 3),
      M('fcr', 'Feed Conversion Ratio', 2),
      M('mortality_pct', '% Mortality (harvested pens)', 1, { pct: true }),
      M('harvested_heads', 'Harvested Hogs in Heads', 0),
      M('harvested_kilos', 'Harvested Hogs in Kilos', 0),
      R('avg_weight', 'Average Weight per Hog (kg)', 'harvested_kilos', 'harvested_heads', 1),
    ],
  },
  BU0102: {
    params: [
      PNL('labor_cost', ['salaries_expense']),
      PNL('ops_cost', ['operations_expense', 'repairs_expense']),
      SUM('prod_plus_delivery', ['production_kilo', 'delivered_kilo']),
      SUM('total_cost', ['labor_cost', 'ops_cost']),
      R('prod_kilos_per_manhour', 'Prod Kilos per Man-Hours', 'production_kilo', 'production_hours', 0),
      M('rejection_count', '# Rejection', 0),
      R('kilos_per_bag', 'Kilos per Bag', 'production_kilo', 'sacks', 1),
      R('labor_cpk', 'Labor CPK (Prod + Delivery)', 'labor_cost', 'prod_plus_delivery', 3, { peso: true }),
      R('operating_cpk', 'Operating CPK', 'ops_cost', 'prod_plus_delivery', 3, { peso: true }),
      R('production_cost_per_kilo', 'Production Cost per Kilo', 'total_cost', 'prod_plus_delivery', 3, { peso: true }),
      M('production_kilo', 'Production in Kilo', 0),
      M('delivered_kilo', 'Delivered in Kilo', 0),
      M('production_hours', 'Production Hours', 0),
      M('sacks', 'Sacks', 0),
    ],
  },
  BU04: {
    params: [
      PNL('lumber_cost', ['cogs']),
      PNL('ops_cost', ['operations_expense']),
      PNL('labor_cost', ['salaries_expense']),
      PNL('trucking_cost', ['trucking_expense']),
      R('lumber_cost_per_pallet', 'Lumber Cost per Pallet', 'lumber_cost', 'accepted_delivery', 2, { peso: true }),
      R('operating_cost_per_pallet', 'Operating Cost per Pallet', 'ops_cost', 'accepted_delivery', 2, { peso: true }),
      M('overhead_cost_per_pallet', 'Overhead Cost per Pallet', 2, { peso: true }),
      R('labor_cost_per_pallet', 'Labor Cost per Pallet', 'labor_cost', 'accepted_delivery', 2, { peso: true }),
      R('trucking_cost_per_pallet', 'Trucking Cost per Pallet', 'trucking_cost', 'accepted_delivery', 2, { peso: true }),
      M('cost_per_pallet', 'Cost per Pallet', 2, { peso: true }),
      M('board_foot_per_pallet', 'Board Foot per Pallet', 2),
      M('delivery', 'Delivery (pallets)', 0),
      M('accepted_delivery', 'Accepted Delivery', 0),
      M('rejection_count', '# Rejection', 0),
      R('pct_rejection', '% Rejection', 'rejection_count', 'delivery', 1, { pct: true }),
    ],
  },
  BU09: {
    params: [
      PNL('prod_cost', ['cogs', 'operations_expense', 'salaries_expense']),
      R('hog_feeds_cpk', 'Hog Feeds CPK', 'prod_cost', 'production_kg', 2, { peso: true }),
      M('hog_feeds_gpr', 'Hog Feeds GPR (if sold to LPG)', 2, { peso: true }),
      M('production_kg', 'Hog Feeds Production in KG', 0),
      M('production_bag', 'Hog Feeds Production in Bags', 0),
    ],
  },
  BU11: {
    params: [
      PNL('labor_cost', ['salaries_expense']),
      PNL('ops_cost', ['operations_expense', 'repairs_expense']),
      SUM('total_cost', ['labor_cost', 'ops_cost']),
      R('labor_cost_per_kilo', 'Labor Cost per Kilo', 'labor_cost', 'processed_kilos', 2, { peso: true }),
      R('ops_cost_per_kilo', 'Ops Cost per Kilo', 'ops_cost', 'processed_kilos', 2, { peso: true }),
      R('cost_per_kilo', 'Cost per Kilo', 'total_cost', 'processed_kilos', 2, { peso: true }),
      M('processed_kilos', 'Kilos Processed', 0),
      M('kilos_delivered', 'Kilos Delivered', 0),
    ],
  },
};

export const hasParameters = (buCode?: string): boolean => !!buCode && buCode in BU_PARAM_CONFIG;
