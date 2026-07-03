import { formatPercent } from '../lib/format';
import type { SalesItemRow } from '../lib/queries';

function qty(v: number) {
  return Math.round(v).toLocaleString('en-PH');
}

// Sales volume by item for the active comparison (chosen via the Comp buttons).
// Sorted highest-first by the current quantity. U/M shown; DIFF / %DIFF.
export default function SalesTable({
  rows,
  priorLabel,
  currentLabel,
}: {
  rows: SalesItemRow[];
  priorLabel: string;
  currentLabel: string;
}) {
  if (rows.length === 0) return <p className="text-slate-400 dark:text-slate-500">No sales detail for this comparison.</p>;
  const sorted = [...rows].sort((a, b) => b.current - a.current);

  return (
    <div className="max-h-[72vh] overflow-auto rounded-2xl bg-white shadow-sm dark:bg-slate-800">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:text-slate-500">
            <th className="sticky left-0 top-0 z-20 bg-white px-4 py-2 text-left dark:bg-slate-800">Item</th>
            <th className="sticky top-0 z-10 bg-white px-2 py-2 text-left dark:bg-slate-800">U/M</th>
            <th className="sticky top-0 z-10 bg-white px-3 py-2 text-right dark:bg-slate-800">{priorLabel}</th>
            <th className="sticky top-0 z-10 bg-white px-3 py-2 text-right dark:bg-slate-800">{currentLabel}</th>
            <th className="sticky top-0 z-10 bg-white px-3 py-2 text-right dark:bg-slate-800">DIFF</th>
            <th className="sticky top-0 z-10 bg-white px-3 py-2 text-right dark:bg-slate-800">%DIFF</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const up = r.diff >= 0;
            return (
              <tr key={r.item + i} className="border-b border-slate-50">
                <td className="sticky left-0 bg-white px-4 py-2.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{r.item}</td>
                <td className="px-2 py-2.5 text-slate-400 dark:text-slate-500">{r.uom}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400">{qty(r.prior)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">{qty(r.current)}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${up ? 'text-green-600' : 'text-red-600'}`}>
                  {up ? '▲' : '▼'} {qty(Math.abs(r.diff))}
                </td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${up ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPercent(r.pctDiff)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
