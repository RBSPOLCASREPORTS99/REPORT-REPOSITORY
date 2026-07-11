// GFFC - Chickboy Meating Place Total P&L configuration. The company P&L is
// built from the QuickBooks "P&L 2025" / "P&L 2026" sheets: 11 sales categories
// plus 6 additive groups (COGS + the 5 expense groups). Everything is additive
// across months, so a range = sum of its months (no allocations).

export interface GffcInputLine {
  key: string;      // stored line_key
  qbLabel: string;  // the QuickBooks P&L row label to pull
  label: string;    // display label
}

export const GFFC_CATEGORIES: GffcInputLine[] = [
  { key: 'beef', qbLabel: 'Beef Meat Sales', label: 'Beef Meat Sales' },
  { key: 'calamanade', qbLabel: 'Calamanade Sales', label: 'Calamanade Sales' },
  { key: 'chicken', qbLabel: 'Chicken Meat Sales', label: 'Chicken Meat Sales' },
  { key: 'dairy', qbLabel: 'Dairy Products Sales', label: 'Dairy Products Sales' },
  { key: 'frozen', qbLabel: 'Frozen Items Sales', label: 'Frozen Items Sales' },
  { key: 'fruits_veg', qbLabel: 'Fruits and Vegetables Sales', label: 'Fruits and Vegetables Sales' },
  { key: 'grocery', qbLabel: 'Grocery Items Sales', label: 'Grocery Items Sales' },
  { key: 'highland', qbLabel: 'Highland Lakatan Sales', label: 'Highland Lakatan Sales' },
  { key: 'pork', qbLabel: 'Pork Meat Sales', label: 'Pork Meat Sales' },
  { key: 'seafoods', qbLabel: 'Seafoods Sales', label: 'Seafoods Sales' },
  { key: 'sales_other', qbLabel: 'Sales - Other', label: 'Sales - Other' },
];

// COGS + the 5 expense groups (pulled from the QB "Total …" aggregate rows).
export const GFFC_GROUPS: GffcInputLine[] = [
  { key: 'cogs', qbLabel: 'Total COGS', label: 'Cost of Goods Sold' },
  { key: 'admin', qbLabel: 'Total Admin Expense', label: 'Admin Expense' },
  { key: 'finance', qbLabel: 'Total Finance Expense', label: 'Finance Expense' },
  { key: 'operations', qbLabel: 'Total Operation Expense', label: 'Operations Expense' },
  { key: 'repairs', qbLabel: 'Total Repairs and Maintenance', label: 'Repairs/Maint. Expense' },
  { key: 'salaries', qbLabel: 'Total Salaries and Wages', label: 'Salaries & Wages' },
];

// Other Income (QB "Net Other Income") — added into Net Income after expenses.
export const GFFC_OTHER_INCOME: GffcInputLine = { key: 'other_income', qbLabel: 'Net Other Income', label: 'Other Income' };

export const GFFC_INPUTS: GffcInputLine[] = [...GFFC_CATEGORIES, ...GFFC_GROUPS, GFFC_OTHER_INCOME];
// The 5 expense groups that sum into Total Expense.
export const GFFC_EXPENSE_KEYS = ['admin', 'finance', 'operations', 'repairs', 'salaries'];
export const GFFC_LABEL = 'GFFC - Chickboy Meating Place';
