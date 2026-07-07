import { useEffect, useMemo, useState } from 'react';
import { formatPercent } from '../lib/format';
import type { SalesItemRow } from '../lib/queries';

function qty(v: number) {
  return Math.round(v).toLocaleString('en-PH');
}

// Sales volume by item for the active comparison (chosen via the Comp buttons).
// Sorted highest-first by current quantity. A per-BU filter can hide irrelevant
// items (saved to localStorage so it persists across app restarts), and the
// TOTAL row reflects only the visible (unfiltered) items.
export default function SalesTable({
  rows,
  priorLabel,
  currentLabel,
  buCode,
}: {
  rows: SalesItemRow[];
  priorLabel: string;
  currentLabel: string;
  buCode?: string;
}) {
  const storageKey = `sales.hidden.${buCode ?? 'all'}`;
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);

  // Load (and reload when the BU changes) the saved hidden-item list.
  useEffect(() => {
    try { setHidden(new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'))); }
    catch { setHidden(new Set()); }
  }, [storageKey]);

  function persist(next: Set<string>) {
    localStorage.setItem(storageKey, JSON.stringify([...next]));
    setHidden(new Set(next));
  }
  function toggle(item: string) {
    const next = new Set(hidden);
    if (next.has(item)) next.delete(item); else next.add(item);
    persist(next);
  }

  const sorted = useMemo(() => [...rows].sort((a, b) => b.current - a.current), [rows]);
  const visible = sorted.filter((r) => !hidden.has(r.item));

  const totalPrior = visible.reduce((s, r) => s + r.prior, 0);
  const totalCurrent = visible.reduce((s, r) => s + r.current, 0);
  const totalDiff = totalCurrent - totalPrior;
  const totalPct = totalPrior !== 0 ? totalDiff / totalPrior : 0;
  const totalUp = totalDiff >= 0;

  if (rows.length === 0) return <p className="text-slate-400 dark:text-slate-500">No sales detail for this comparison.</p>;

  return (
    <div className="space-y-2">
      <div className="relative flex items-center justify-end">
        <button
          onClick={() => setFilterOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200"
        >
          ⛃ Filter items{hidden.size > 0 ? ` (${hidden.size} hidden)` : ''}
        </button>

        {filterOpen && (
          <>
            <button aria-hidden onClick={() => setFilterOpen(false)} className="fixed inset-0 z-10 cursor-default" />
            <div className="absolute right-0 top-9 z-20 max-h-80 w-72 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-1 flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Show items</span>
                <div className="flex gap-2 text-xs">
                  <button onClick={() => persist(new Set())} className="text-brand-600 dark:text-brand-400">All</button>
                  <button onClick={() => persist(new Set(sorted.map((r) => r.item)))} className="text-slate-500 dark:text-slate-400">None</button>
                </div>
              </div>
              {sorted.map((r) => (
                <label key={r.item} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700">
                  <input type="checkbox" checked={!hidden.has(r.item)} onChange={() => toggle(r.item)} className="accent-brand-600" />
                  <span className="truncate text-slate-700 dark:text-slate-200">{r.item}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="max-h-[72vh] overflow-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-0">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-500">
              <th className="sticky left-0 top-0 z-20 bg-slate-100 px-4 py-2 text-left dark:bg-slate-900/80">Item</th>
              <th className="sticky top-0 z-10 bg-slate-100 px-2 py-2 text-left dark:bg-slate-900/80">U/M</th>
              <th className="sticky top-0 z-10 bg-slate-100 px-3 py-2 text-right dark:bg-slate-900/80">{priorLabel}</th>
              <th className="sticky top-0 z-10 bg-slate-100 px-3 py-2 text-right dark:bg-slate-900/80">{currentLabel}</th>
              <th className="sticky top-0 z-10 bg-slate-100 px-3 py-2 text-right dark:bg-slate-900/80">DIFF</th>
              <th className="sticky top-0 z-10 bg-slate-100 px-3 py-2 text-right dark:bg-slate-900/80">%DIFF</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const up = r.diff >= 0;
              return (
                <tr key={r.item + i} className="border-b border-slate-200 dark:border-slate-700/60">
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
          <tfoot>
            <tr className="sticky bottom-0 z-10 border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100">
              <td className="sticky left-0 bg-slate-50 px-4 py-2.5 uppercase dark:bg-slate-700">Total</td>
              <td className="bg-slate-50 px-2 py-2.5 dark:bg-slate-700" />
              <td className="px-3 py-2.5 text-right tabular-nums">{qty(totalPrior)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{qty(totalCurrent)}</td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${totalUp ? 'text-green-600' : 'text-red-600'}`}>
                {totalUp ? '▲' : '▼'} {qty(Math.abs(totalDiff))}
              </td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${totalUp ? 'text-green-600' : 'text-red-600'}`}>
                {formatPercent(totalPct)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
