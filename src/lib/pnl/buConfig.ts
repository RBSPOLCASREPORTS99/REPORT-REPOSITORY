// Configuration that drives the P&L compute engine (src/lib/pnl/computeBuPnl.ts).
// Every value here was reverse-engineered from the XLOOKUP formulas in
// BR per BU MAY 2026 P&L FINAL.xlsx — see the plan file for the derivation.

// How a P&L line is pulled from a raw QB pivot: match `label` in hierarchy
// column `hierCol` (0=A .. 6=G), read the BU column(s), divide by 1000.
export interface LinePull {
  hierCol: number;
  label: string;
}

// Raw-pivot source labels for each pulled line.
export const PULLS = {
  grossSales: { hierCol: 3, label: 'Total Income' } as LinePull,
  cogs: { hierCol: 3, label: 'Total COGS' } as LinePull,
  admin: { hierCol: 4, label: 'Total Admin Expenses' } as LinePull,
  discounting: { hierCol: 4, label: 'Total Finance Expenses' } as LinePull,
  operations: { hierCol: 4, label: 'Total Operations Expenses' } as LinePull,
  repairs: { hierCol: 4, label: 'Total Repairs/Maintenance' } as LinePull,
  salaries: { hierCol: 4, label: 'Total Salaries and Wages' } as LinePull,
  otherIncome: { hierCol: 1, label: 'Net Other Income' } as LinePull,
  netIncome: { hierCol: 0, label: 'Net Income' } as LinePull, // used for BU10 truck total
  classTotalExpense: { hierCol: 3, label: 'Total Expense' } as LinePull, // support-center pools
};

// Pivot column headers of the support / company aggregates.
export const COLS = {
  companyTotal: 'TOTAL',
  admin: 'Admin',
  finance: 'Finance',
  hr: 'Human Resource',
  management: 'Management',
  truckTotal: 'Total BU10 - TRUCK',
};

export type AllocationMethod = 'gross_sales' | 'revenue' | 'per_txn';

export interface BuConfig {
  buCode: string; // canonical code used across the app (matches business_units)
  buName: string;
  // Pivot column header(s) whose values are summed to form this BU's figures.
  memberColumns: string[];
  // Short trucking codes (col A of the trucking block) whose manual trucking
  // inputs are summed for this BU's trucking allocation.
  truckingMembers: string[];
  includeSupportCenters: boolean; // BU04 has no Finance/HR/Management rows
  allocationMethod: AllocationMethod; // all BUs currently use gross_sales
  // If true, this BU is NOT computed from the pivots — it is manually entered
  // (Lakatan Farm's P&L is typed in from the farm's own records).
  manualEntry?: boolean;
}

// The BU tabs that are computed from the raw pivots, keyed by canonical code.
export const BU_CONFIGS: BuConfig[] = [
  {
    buCode: 'BU0102',
    buName: 'Bodega 1 & 2',
    memberColumns: ['BU01 - Bodega 1', 'BU02 - Bodega 2'],
    truckingMembers: ['BU01', 'BU02'],
    includeSupportCenters: true,
    allocationMethod: 'gross_sales',
  },
  {
    buCode: 'BU04',
    buName: 'Bodega 4 – Wooden Pallets',
    memberColumns: ['BU04 - Bodega 4 Wooden Pallets', 'Unclassified'],
    truckingMembers: ['BU04'],
    includeSupportCenters: false,
    allocationMethod: 'gross_sales',
  },
  {
    buCode: 'BU05',
    buName: 'Trading',
    memberColumns: ['BU05 - Trading'],
    truckingMembers: ['BU05'],
    includeSupportCenters: true,
    allocationMethod: 'gross_sales',
  },
  {
    buCode: 'BU07',
    buName: 'Hogs Partnership Growing',
    memberColumns: ['BU07 - Hogs Partnership Growing'],
    truckingMembers: ['BU07'],
    includeSupportCenters: true,
    allocationMethod: 'gross_sales',
  },
  {
    buCode: 'BU08PH',
    buName: 'Lakatan Packhouse',
    memberColumns: ['Total BU08 - Lakatan Growing/Trading'],
    truckingMembers: ['BU08'],
    includeSupportCenters: true,
    allocationMethod: 'gross_sales',
  },
  {
    buCode: 'BU08LF',
    buName: 'Lakatan Farm',
    memberColumns: [],
    truckingMembers: [],
    includeSupportCenters: false,
    allocationMethod: 'gross_sales',
    manualEntry: true,
  },
  {
    buCode: 'BU09',
    buName: 'Hog Feeds Production',
    memberColumns: ['BU09 - Hog Feeds Production'],
    truckingMembers: ['BU09'],
    includeSupportCenters: true,
    allocationMethod: 'gross_sales',
  },
  {
    buCode: 'BU11',
    buName: 'Agri-Solutions',
    memberColumns: ['BU11 - Agri-Solutions'],
    truckingMembers: ['BU11'],
    includeSupportCenters: true,
    allocationMethod: 'gross_sales',
  },
];

// Short BU codes that appear in the trucking allocation block, in order.
export const TRUCKING_CODES = [
  'BU01', 'BU02', 'BU03', 'BU04', 'BU05', 'BU06', 'BU07', 'BU08', 'BU09', 'BU10', 'BU11', 'OT',
];
