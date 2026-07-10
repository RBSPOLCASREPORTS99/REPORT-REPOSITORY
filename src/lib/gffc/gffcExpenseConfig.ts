// GFFC expense-account classification, from the workbook's "Expense Accounts"
// sheet: each account belongs to a section (Admin/Finance/Operations/Repairs/
// Salaries) and is Controllable (C) or Uncontrollable (UC). The Expense Report
// groups by controllable vs uncontrollable (matching the POLCAS report).

export interface GffcAccountDef { section: string; controllable: boolean }

const UC = false, C = true;
// key = lowercased account name.
export const GFFC_ACCOUNTS: Record<string, GffcAccountDef> = {
  // Admin
  'business licenses and permits': { section: 'Admin', controllable: UC },
  'charitable contributions': { section: 'Admin', controllable: UC },
  'office supplies': { section: 'Admin', controllable: C },
  'admin expense': { section: 'Admin', controllable: C },
  // Finance
  'bank service charges': { section: 'Finance', controllable: UC },
  'interest expense': { section: 'Finance', controllable: UC },
  'taxes - property': { section: 'Finance', controllable: UC },
  'finance expense': { section: 'Finance', controllable: UC },
  // Operations
  'advertising and promotion': { section: 'Operations', controllable: C },
  'bio-security expense': { section: 'Operations', controllable: C },
  'chilling fee': { section: 'Operations', controllable: C },
  'computer and internet expenses': { section: 'Operations', controllable: C },
  'depreciation expense': { section: 'Operations', controllable: C },
  'dues and subscriptions': { section: 'Operations', controllable: C },
  'electric expense': { section: 'Operations', controllable: C },
  'equipment rental': { section: 'Operations', controllable: C },
  'fare expense': { section: 'Operations', controllable: C },
  'fuel expense': { section: 'Operations', controllable: C },
  'insurance expense': { section: 'Operations', controllable: UC },
  'internet expense': { section: 'Operations', controllable: C },
  'load allowance': { section: 'Operations', controllable: C },
  'meals and entertainment': { section: 'Operations', controllable: C },
  'miscellaneous expense': { section: 'Operations', controllable: C },
  'packaging expense': { section: 'Operations', controllable: C },
  'postage and delivery': { section: 'Operations', controllable: C },
  'printing and reproduction': { section: 'Operations', controllable: C },
  'professional fees': { section: 'Operations', controllable: C },
  'raw materials expense': { section: 'Operations', controllable: C },
  'rent expense': { section: 'Operations', controllable: C },
  'representation expense': { section: 'Operations', controllable: C },
  'sanitation expense': { section: 'Operations', controllable: C },
  'slaughterhouse fee': { section: 'Operations', controllable: C },
  'timplados ingredients': { section: 'Operations', controllable: C },
  'travel expense': { section: 'Operations', controllable: C },
  'utilities': { section: 'Operations', controllable: C },
  'water expense': { section: 'Operations', controllable: C },
  'operation expense': { section: 'Operations', controllable: C },
  // Repairs
  'maintenance building': { section: 'Repairs', controllable: C },
  'maintenance equipments/machines': { section: 'Repairs', controllable: C },
  'maintenance service units': { section: 'Repairs', controllable: C },
  // Salaries
  'end year bonus': { section: 'Salaries', controllable: UC },
  'salaries and wages': { section: 'Salaries', controllable: C },
  '13th month pay': { section: 'Salaries', controllable: UC },
};

// Resolve an account to its section + controllable flag, with sensible fallbacks
// for accounts not in the map (so a new QuickBooks account still shows up).
export function gffcAccount(name: string): GffcAccountDef {
  const key = name.trim().toLowerCase();
  const hit = GFFC_ACCOUNTS[key];
  if (hit) return hit;
  if (/salar|wage|bonus|13th/.test(key)) return { section: 'Salaries', controllable: C };
  if (/maintenance|repair/.test(key)) return { section: 'Repairs', controllable: C };
  if (/bank|interest|\btax/.test(key)) return { section: 'Finance', controllable: UC };
  if (/licen|permit|charitable|office suppl/.test(key)) return { section: 'Admin', controllable: UC };
  return { section: 'Operations', controllable: C };
}
