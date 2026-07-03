import type { RangeRow } from './queries';

// A "set month" + comparison type drives every comparison in the app. Given a
// selected month, each comparison type resolves to a current + prior range.
export type CompType = 'ytd' | 'qtr' | 'month';
export type QtrBasis = 'yoy' | 'qoq';

export const COMP_LABELS: Record<CompType, string> = {
  ytd: 'YTD Comp',
  qtr: 'QTR Comp',
  month: 'Month Comp',
};

function ymOf(range: RangeRow): { year: number; month: number } {
  const [y, m] = range.period_end.split('-').map(Number);
  return { year: y, month: m };
}
function lastDay(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}
function isQuarterEndMonth(month: number): boolean {
  return month === 3 || month === 6 || month === 9 || month === 12;
}
export function isQuarterEnd(range: RangeRow): boolean {
  return isQuarterEndMonth(ymOf(range).month);
}

export interface ResolvedComparison {
  currentId?: string;
  priorId?: string;
  currentLabel: string;
  priorLabel: string;
  available: boolean;
}

// Resolve the current + prior range ids for a comparison. Returns available=false
// (and disables the button) when a required range hasn't been imported.
export function resolveComparison(
  ranges: RangeRow[],
  setMonth: RangeRow,
  comp: CompType,
  qtrBasis: QtrBasis = 'yoy',
): ResolvedComparison {
  const { year: y, month: m } = ymOf(setMonth);
  const findMonth = (yy: number, mm: number) => ranges.find((r) => r.kind === 'month' && r.period_end === lastDay(yy, mm));
  const findYtd = (yy: number, mm: number) => ranges.find((r) => r.kind === 'ytd' && r.period_end === lastDay(yy, mm));
  const findQtr = (yy: number, mm: number) => ranges.find((r) => r.kind === 'quarter' && r.period_end === lastDay(yy, mm));

  if (comp === 'month') {
    const pm = m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
    const prior = findMonth(pm.year, pm.month);
    return { currentId: setMonth.id, priorId: prior?.id, currentLabel: setMonth.label, priorLabel: prior?.label ?? '', available: !!prior };
  }

  if (comp === 'ytd') {
    const cur = findYtd(y, m);
    const pri = findYtd(y - 1, m);
    return { currentId: cur?.id, priorId: pri?.id, currentLabel: cur?.label ?? `YTD ${y}`, priorLabel: pri?.label ?? `YTD ${y - 1}`, available: !!cur && !!pri };
  }

  // qtr — only meaningful for quarter-end months and requires quarter ranges.
  if (!isQuarterEndMonth(m)) return { currentLabel: '', priorLabel: '', available: false };
  const cur = findQtr(y, m);
  let pri: RangeRow | undefined;
  if (qtrBasis === 'yoy') {
    pri = findQtr(y - 1, m);
  } else {
    const pq = m - 3 <= 0 ? { year: y - 1, month: m + 9 } : { year: y, month: m - 3 };
    pri = findQtr(pq.year, pq.month);
  }
  return { currentId: cur?.id, priorId: pri?.id, currentLabel: cur?.label ?? '', priorLabel: pri?.label ?? '', available: !!cur && !!pri };
}

// Which Comp buttons are usable for a given set month.
export function availableComps(ranges: RangeRow[], setMonth: RangeRow): Record<CompType, boolean> {
  return {
    ytd: resolveComparison(ranges, setMonth, 'ytd').available,
    month: resolveComparison(ranges, setMonth, 'month').available,
    qtr: isQuarterEnd(setMonth),
  };
}

// Map a comparison type to the sales-report block key. The sales "annual" block
// (Y-1 → Y) is actually the Jan-to-report-month YTD comparison.
export function salesBlockFor(comp: CompType): string {
  if (comp === 'ytd') return 'annual';
  if (comp === 'month') return 'mom';
  return 'q_a';
}
