import { useEffect } from 'react';
import type { RangeRow } from '../lib/queries';
import { useUi } from '../contexts/UiContext';
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
  showSetMonth = true,
}: {
  ranges: RangeRow[];
  onChange: (s: ComparisonState) => void;
  showSetMonth?: boolean;
}) {
  // The month + comparison selection is shared across Home / BU detail / Present
  // via the UI context (and persisted), so choosing a month anywhere applies
  // everywhere.
  const { compSetMonthId, setCompSetMonthId, compType, setCompType, compQtrBasis, setCompQtrBasis } = useUi();
  const monthRanges = ranges.filter((r) => r.kind === 'month');
  const setMonthId = compSetMonthId;
  const setSetMonthId = setCompSetMonthId;
  const comp = compType as CompType;
  const setComp = (c: CompType) => setCompType(c);
  const qtrBasis = compQtrBasis as QtrBasis;
  const setQtrBasis = (b: QtrBasis) => setCompQtrBasis(b);

  // Default (or repair) the set month to the latest when the stored one isn't
  // among the available months.
  useEffect(() => {
    if (monthRanges.length > 0 && !monthRanges.some((r) => r.id === setMonthId)) {
      setSetMonthId(monthRanges[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="flex flex-wrap items-center gap-2">
      {showSetMonth && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Month</span>
          <select
            value={setMonthId}
            onChange={(e) => setSetMonthId(e.target.value)}
            aria-label="Set month"
            className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            {monthRanges.map((r) => (
              <option key={r.id} value={r.id}>{r.label}{!r.is_published ? ' (draft)' : ''}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-700/60">
        {COMP_ORDER.map((c) => (
          <button
            key={c}
            onClick={() => setComp(c)}
            disabled={!avail[c]}
            title={!avail[c] ? (c === 'qtr' ? 'Only for quarter-end months with quarter data imported' : 'No matching period imported') : ''}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-30 ${
              comp === c ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {COMP_LABELS[c]}
          </button>
        ))}
      </div>

      {comp === 'qtr' && (
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-700/60">
          {(['yoy', 'qoq'] as QtrBasis[]).map((b) => (
            <button
              key={b}
              onClick={() => setQtrBasis(b)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${qtrBasis === b ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`}
            >
              {b === 'yoy' ? 'vs Last Year' : 'vs Prior Qtr'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
