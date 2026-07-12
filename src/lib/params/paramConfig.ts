// Per-BU operational KPIs ("Parameters"). Each parameter is one of:
//  - manual: a value Finance types per period.
//  - pnl:    pulled from the BU's computed P&L line (₱'000 → ×1000 full pesos).
//  - ratio:  derived num ÷ den from other parameters (computed per period, so a
//            YTD ratio uses YTD totals, matching the Excel).
export type ParamSource =
  | { kind: 'manual' }
  | { kind: 'pnl'; line: string }
  | { kind: 'ratio'; num: string; den: string };

export interface ParamDef {
  key: string;
  label: string;
  source: ParamSource;
  hidden?: boolean;   // internal base used by a ratio; not shown as its own row
  decimals?: number;  // display precision
  pct?: boolean;      // render as a percentage
  peso?: boolean;     // render with ₱ prefix
}

export interface BuParamConfig {
  params: ParamDef[];
}

// Only BUs listed here get a Parameters tab. BU07 first (fully mapped); the
// others are added as their configs are confirmed.
export const BU_PARAM_CONFIG: Record<string, BuParamConfig> = {
  BU07: {
    params: [
      { key: 'growing_cost_per_kilo', label: 'Growing Cost per Kilo', source: { kind: 'manual' }, decimals: 2, peso: true },
      { key: 'avg_grower_price', label: 'Average Grower Hogs Price', source: { kind: 'manual' }, decimals: 2, peso: true },
      // Operations Cost (₱) pulled from the P&L, used to derive the per-kilo rate.
      { key: 'ops_cost', label: 'Operations Cost', source: { kind: 'pnl', line: 'operations_expense' }, hidden: true },
      { key: 'ops_cost_per_kilo', label: 'Operations Cost per Kilo', source: { kind: 'ratio', num: 'ops_cost', den: 'harvested_kilos' }, decimals: 2, peso: true },
      { key: 'feeds_cost_per_kilo', label: 'Feeds Cost per Hogs Kilo', source: { kind: 'manual' }, decimals: 2, peso: true },
      { key: 'sold_feeds_ppk', label: 'Sold Feeds PPK', source: { kind: 'manual' }, decimals: 2, peso: true },
      { key: 'adg', label: 'Average Daily Gain', source: { kind: 'manual' }, decimals: 3 },
      { key: 'fcr', label: 'Feed Conversion Ratio', source: { kind: 'manual' }, decimals: 2 },
      { key: 'mortality_pct', label: '% Mortality (harvested pens)', source: { kind: 'manual' }, pct: true, decimals: 1 },
      { key: 'harvested_heads', label: 'Harvested Hogs in Heads', source: { kind: 'manual' }, decimals: 0 },
      { key: 'harvested_kilos', label: 'Harvested Hogs in Kilos', source: { kind: 'manual' }, decimals: 0 },
      { key: 'avg_weight', label: 'Average Weight per Hog (kg)', source: { kind: 'ratio', num: 'harvested_kilos', den: 'harvested_heads' }, decimals: 1 },
    ],
  },
};

export const hasParameters = (buCode?: string): boolean => !!buCode && buCode in BU_PARAM_CONFIG;
