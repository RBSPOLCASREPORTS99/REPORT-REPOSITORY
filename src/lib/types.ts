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
  assigned_bu_code: string | null;
  full_name: string | null;
}
