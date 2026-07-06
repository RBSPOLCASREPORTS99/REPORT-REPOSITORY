import { useUi } from '../contexts/UiContext';
import type { RangeRow } from '../lib/queries';

// The "set month" picker, split out so it can sit inline beside a page title or
// BU name. It reads/writes the same shared UI context as ComparisonControl, so
// the two stay in sync (ComparisonControl still owns the default/repair logic).
export default function SetMonthSelect({ ranges }: { ranges: RangeRow[] }) {
  const { compSetMonthId, setCompSetMonthId } = useUi();
  const monthRanges = ranges.filter((r) => r.kind === 'month');
  if (monthRanges.length === 0) return null;
  const value = monthRanges.some((r) => r.id === compSetMonthId) ? compSetMonthId : monthRanges[0].id;
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Month</span>
      <select
        value={value}
        onChange={(e) => setCompSetMonthId(e.target.value)}
        aria-label="Set month"
        className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-indigo-500/30"
      >
        {monthRanges.map((r) => (
          <option key={r.id} value={r.id}>{r.label}{!r.is_published ? ' (draft)' : ''}</option>
        ))}
      </select>
    </label>
  );
}
