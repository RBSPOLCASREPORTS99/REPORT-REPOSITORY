// Canonical business unit list. Codes match what the importer derives from the
// BR per BU workbook's tab names/titles (see src/lib/importers/parseBrPnl.ts).
export interface BusinessUnitDef {
  code: string;
  name: string;
  isProfitCenter: boolean;
  parentCode?: string;
}

export const BUSINESS_UNITS: BusinessUnitDef[] = [
  { code: 'BU0102', name: 'Bodega 1 & 2', isProfitCenter: true },
  { code: 'BU03', name: 'Bodega 3 Sumilao', isProfitCenter: true },
  { code: 'BU04', name: 'Bodega 4 – Wooden Pallets', isProfitCenter: true },
  { code: 'BU05', name: 'Trading', isProfitCenter: true },
  { code: 'BU06', name: 'CCG/CPG/PGF', isProfitCenter: true },
  { code: 'BU07', name: 'Hogs Partnership Growing', isProfitCenter: true },
  { code: 'BU08', name: 'Lakatan Growing/Trading', isProfitCenter: true },
  { code: 'BU08LF', name: 'Lakatan Farm', isProfitCenter: true, parentCode: 'BU08' },
  { code: 'BU08PH', name: 'Lakatan Packhouse', isProfitCenter: true, parentCode: 'BU08' },
  { code: 'BU09', name: 'Hog Feeds Production', isProfitCenter: true },
  { code: 'BU10', name: 'Truck', isProfitCenter: false },
  { code: 'BU11', name: 'Agri-Solutions', isProfitCenter: true },
  { code: 'ADMIN', name: 'Admin', isProfitCenter: false },
  { code: 'FINANCE', name: 'Finance', isProfitCenter: false },
  { code: 'HR', name: 'Human Resource', isProfitCenter: false },
  { code: 'MANAGEMENT', name: 'Management', isProfitCenter: false },
];

export type ComparisonPair = 'YTD' | 'YOY_MONTH' | 'MOM';

export const COMPARISON_PAIR_LABELS: Record<ComparisonPair, string> = {
  YTD: 'YTD',
  YOY_MONTH: 'Same month last year',
  MOM: 'vs Last month',
};

// Ordered canonical P&L line items, in the order they appear on the source
// tabs. `matches` lists the exact (trimmed, case-insensitive) label text seen
// in the workbook that identifies this line.
export interface PnlLineItemDef {
  key: string;
  label: string;
  matches: string[];
  isPercent?: boolean; // NET INCOME FROM OPS % / NET INCOME % rows (single value, no prior/current pair structure difference)
  isSectionHeader?: boolean;
}

// Some BU tabs (e.g. farm/agri units like BU08 LF) rename column-A labels to
// unit-specific terms ("FERTILIZER/CHEMICAL EXPENSE", "LAND PREP EXPENSE"...)
// but keep the standard QuickBooks account-group name in column B ("Total
// Admin Expenses", "Total Repairs/Maintenance"...). We match on either.
export const PNL_LINE_ITEMS: PnlLineItemDef[] = [
  { key: 'gross_sales', label: 'Gross Sales', matches: ['GROSS SALES', 'TOTAL INCOME'] },
  { key: 'cogs', label: 'Cost of Goods Sold', matches: ['COST OF GOODS SOLD', 'TOTAL COGS'] },
  { key: 'gross_income', label: 'Gross Income', matches: ['GROSS INCOME'] },
  { key: 'admin_expense', label: 'Admin Expense', matches: ['ADMIN EXPENSE', 'TOTAL ADMIN EXPENSES'] },
  { key: 'discounting_expense', label: 'Discounting Expense', matches: ['DISCOUNTING EXPENSE', 'TOTAL FINANCE EXPENSES'] },
  { key: 'operations_expense', label: 'Operations Expense', matches: ['OPERATIONS EXPENSE', 'TOTAL OPERATIONS EXPENSES'] },
  { key: 'repairs_expense', label: 'Repairs & Maintenance Expense', matches: ['REPAIRS/MAINT. EXPENSE', 'REPAIRS/MAINT EXPENSE', 'TOTAL REPAIRS/MAINTENANCE'] },
  { key: 'salaries_expense', label: 'Salaries & Wages', matches: ['SALARIES & WAGES', 'TOTAL SALARIES AND WAGES'] },
  { key: 'trucking_expense', label: 'Trucking Services (allocated)', matches: ['TRUCKING SERVICES - ALLOCATED', 'TRUCKING SERVICES -ALLOCATED', 'TRUCKING SERVICES – ALLOCATED'] },
  { key: 'total_expense', label: 'Total Expense', matches: ['TOTAL EXPENSE'] },
  { key: 'other_income', label: 'Other Income', matches: ['OTHER INCOME', 'NET OTHER INCOME'] },
  { key: 'net_income_ops', label: 'Net Income from Operations', matches: ['NET INCOME FROM OPS'] },
  { key: 'admin_allocated', label: 'Admin Expense (allocated)', matches: ['ADMIN EXPENSE - ALLOCATED', 'ADMIN EXPENSE -ALLOCATED', 'ADMIN EXPENSE – ALLOCATED'] },
  { key: 'cost_of_money_allocated', label: 'Cost of Money (allocated)', matches: ['COST OF MONEY - ALLOCATED', 'COST OF MONEY -ALLOCATED', 'COST OF MONEY – ALLOCATED'] },
  { key: 'total_allocated_expense', label: 'Total Allocated Expense', matches: ['TOTAL ALLOCATED EXPENSE'] },
  { key: 'support_finance', label: 'Support: Finance', matches: ['FINANCE'] },
  { key: 'support_hr', label: 'Support: Human Resource', matches: ['HUMAN RESOURCE'] },
  { key: 'support_management', label: 'Support: Management', matches: ['MANAGEMENT'] },
  { key: 'total_support_centers', label: 'Total Support Centers', matches: ['TOTAL SUPPORT CENTERS'] },
  { key: 'net_income', label: 'Net Income', matches: ['NET INCOME'] },
  { key: 'net_income_ops_pct', label: 'Net Income from Ops %', matches: ['NET INCOME FROM OPS %'], isPercent: true },
  { key: 'net_income_pct', label: 'Net Income %', matches: ['NET INCOME %'], isPercent: true },
];

// Rows whose label text should only start matching support-center lines
// (FINANCE / HUMAN RESOURCE / MANAGEMENT) once seen, to avoid false matches
// against unrelated cells earlier in the sheet.
export const SUPPORT_CENTERS_HEADER_MATCH = 'SUPPORT CENTERS';

// BUs whose P&L breaks the COGS leaf "Reclass or Adjusted Variance" out below
// Cost of Goods Sold (with a Total), and the label each uses for that line.
export const COGS_VARIANCE_LABELS: Record<string, string> = {
  BU07: 'Live Hogs Price Adjustment',
  BU09: 'Hog Feeds Price Adjustment',
  BU08PH: 'Reclass or Adjusted Variance',
};
