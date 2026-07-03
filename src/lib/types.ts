import type { ComparisonPair } from './constants';

export interface ComparisonValues {
  prior: number;
  current: number;
  priorPct: number;
  currentPct: number;
  diff: number;
  pctDiff: number;
}

export interface PnlLineRow {
  key: string;
  label: string;
  blocks: Partial<Record<ComparisonPair, ComparisonValues>>;
}

export interface ParsedBuPnl {
  buCode: string;
  buName: string;
  sourceTab: string;
  period: { year: number; month: number }; // "current" period this tab reports
  priorMonthPeriod: { year: number; month: number };
  priorYearPeriod: { year: number; month: number };
  ytdLabel: { prior: string; current: string };
  lines: PnlLineRow[];
  warnings: string[];
}

export interface ParseBrPnlResult {
  fileName: string;
  buResults: ParsedBuPnl[];
  skippedTabs: string[];
  warnings: string[];
}

export type UserRole = 'finance' | 'bu_head' | 'gm';

export interface Profile {
  user_id: string;
  role: UserRole;
  full_name: string | null;
  bus: string[]; // BU codes this user may see (bu_head); empty for finance/gm
}

// A Finance-authorized user on the allowlist (may or may not have registered yet).
export interface AllowedUser {
  email: string;
  role: UserRole;
  full_name: string | null;
  registered_at: string | null;
  bus: string[]; // BU codes assigned (only meaningful for bu_head)
}
