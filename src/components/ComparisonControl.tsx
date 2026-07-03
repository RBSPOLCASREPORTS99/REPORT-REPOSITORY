import { useEffect, useState } from 'react';
import type { RangeRow } from '../lib/queries';
import {
  COMP_LABELS, availableComps, resolveComparison,
  type CompType, type QtrBasis, type ResolvedComparison,
} from '../lib/comparison';

export interface ComparisonState extends ResolvedComparison {
  setMonthId: string;
  comp: CompType;
}

const COMP_ORDER: CompType[] = ['ytd', 'qtr', 'month'];

// Set-month selector + YTD / QTR / Month comparison buttons. Replaces the old
// "current vs prior" dropdowns. Emits the resolved current/prior ranges.
export default function ComparisonControl({
  ranges,
  onChange,
}: {
  ranges: RangeRow[];
  onChange: (s: ComparisonState) => void;
}) {
  const monthRanges = ranges.filter((r) => r.kind === 'month');
  const [setMonthId, setSetMonthId] = useState<string>('');
  const [comp, setComp] = useState<CompType>('ytd');
  const [qtrBasis, setQtrBasis] = useState<QtrBasis>('yoy');

  // Default the set month to the latest month range.
  useEffect(() => {
    if (!setMonthId && monthRanges.length > 0) setSetMonthId(monthRanges[0].id);
  }, [monthRanges, setMonthId]);

  const setMonth = ranges.find((r) => r.id === setMonthId);
  const avail = setMonth ? availableComps(ranges, setMonth) : { ytd: false, qtr: false, month: false };

  // If the chosen comparison isn't available for this month, fall back.
  useEffect(() => {
    if (!setMonth) return;
    if (!avail[comp]) {
      const next = COMP_ORDER.find((c) => avail[c]);
      if (next && next !== comp) setComp(next);
    }
  }, [setMonthId, avail, comp, setMonth]);

  // Emit the resolved comparison whenever inputs change.
  useEffect(() => {
    if (!setMonth) return;
    const resolved = resolveComparison(ranges, setMonth, comp, qtrBasis);
    onChange({ ...resolved, setMonthId, comp });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMonthId, comp, qtrBasis, ranges]);

  if (monthRanges.length === 0) return null;

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Set month</span>
        <select
          value={setMonthId}
          onChange={(e) => setSetMonthId(e.target.value)}
          aria-label="Set month"
          className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-slate-900 dark:text-slate-100"
        >
          {monthRanges.map((r) => (
            <option key={r.id} value={r.id}>{r.label}{!r.is_published ? ' (draft)' : ''}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="flex gap-1 rounded-xl bg-slate-100 dark:bg-slate-700 p-1">
          {COMP_ORDER.map((c) => (
            <button
              key={c}
              onClick={() => setComp(c)}
              disabled={!avail[c]}
              title={!avail[c] ? (c === 'qtr' ? 'Only for quarter-end months with quarter data imported' : 'No matching period imported') : ''}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-30 ${
                comp === c ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {COMP_LABELS[c]}
            </button>
          ))}
        </div>

        {comp === 'qtr' && (
          <div className="flex gap-1 rounded-xl bg-slate-100 dark:bg-slate-700 p-1">
            {(['yoy', 'qoq'] as QtrBasis[]).map((b) => (
              <button
                key={b}
                onClick={() => setQtrBasis(b)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${qtrBasis === b ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
              >
                {b === 'yoy' ? 'vs Last Year' : 'vs Prior Qtr'}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
