import { Fragment, useState } from 'react';
import { formatPercent } from '../lib/format';
import { useColHighlight } from '../lib/useColHighlight';
import type { GffcSalesGrouped } from '../lib/gffc/gffcQueries';

// GFFC "Sales by Qty" report: grouped by category, each item showing — for the
// prior and current period — Qty, % distribution (share of the category total)
// and Rank (1 = biggest seller). Items are ordered by current-period qty and
// categories by current total. Each category header is collapsible.
export default function GffcSalesQtyTable({ data, priorLabel, currentLabel }: { data: GffcSalesGrouped; priorLabel: string; currentLabel: string }) {
  // Every category collapses by default; the user expands the ones they want.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (k: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const { tableProps, cellCls } = useColHighlight();

  if (!data.hasData) return <p className="text-slate-400 dark:text-slate-500">No sales-by-item data for this period. Import the GFFC "Sales by Item" workbook.</p>;

  const qty = (v: number) => (v ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—');
  const headCls = 'sticky top-0 z-10 bg-slate-100 px-3 py-2 text-right dark:bg-slate-900/80';

  return (
    <div className="max-h-[72vh] overflow-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-0">
      <table className="min-w-full text-sm" {...tableProps}>
        <thead>
          <tr className="border-b border-slate-300 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-500">
            <th className={`sticky left-0 top-0 z-20 bg-slate-100 px-4 py-2 text-left dark:bg-slate-900/80 ${cellCls(0)}`}>Item</th>
            <th className={`${headCls} px-2 text-center ${cellCls(1)}`}>U/M</th>
            <th className={`${headCls} ${cellCls(2)}`}>{priorLabel} Qty</th>
            <th className={`${headCls} px-2 ${cellCls(3)}`}>% Distrn</th>
            <th className={`${headCls} px-2 ${cellCls(4)}`}>Rank</th>
            <th className={`${headCls} ${cellCls(5)}`}>{currentLabel} Qty</th>
            <th className={`${headCls} px-2 ${cellCls(6)}`}>% Distrn</th>
            <th className={`${headCls} px-2 ${cellCls(7)}`}>Rank</th>
          </tr>
        </thead>
        <tbody>
          {data.categories.map((cat) => {
            const open = expanded.has(cat.category);
            return (
              <Fragment key={cat.category}>
                <tr onClick={() => toggle(cat.category)}
                  className="cursor-pointer select-none border-b border-slate-200 bg-slate-100/80 font-semibold text-slate-900 dark:border-slate-700/60 dark:bg-slate-700/50 dark:text-slate-100">
                  <td className={`sticky left-0 bg-slate-100 px-4 py-2 text-left uppercase dark:bg-slate-700 ${cellCls(0)}`}>
                    <span className="mr-1 inline-block w-3 text-indigo-500">{open ? '▾' : '▸'}</span>
                    {cat.category}
                  </td>
                  <td className={`px-2 py-2 text-center tabular-nums text-slate-500 dark:text-slate-400 ${cellCls(1)}`}>{cat.uom || ''}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${cellCls(2)}`}>{qty(cat.priTotal)}</td>
                  <td className={`px-2 py-2 text-right tabular-nums text-slate-400 dark:text-slate-500 ${cellCls(3)}`}>{cat.priTotal ? '100%' : ''}</td>
                  <td className={`px-2 py-2 ${cellCls(4)}`} />
                  <td className={`px-3 py-2 text-right tabular-nums ${cellCls(5)}`}>{qty(cat.curTotal)}</td>
                  <td className={`px-2 py-2 text-right tabular-nums text-slate-400 dark:text-slate-500 ${cellCls(6)}`}>{cat.curTotal ? '100%' : ''}</td>
                  <td className={`px-2 py-2 ${cellCls(7)}`} />
                </tr>
                {open && cat.items.map((it) => (
                  <tr key={cat.category + it.item} className="border-b border-slate-200 dark:border-slate-700/60">
                    <td className={`sticky left-0 bg-white px-4 py-2.5 pl-8 text-left text-slate-600 dark:bg-slate-800 dark:text-slate-300 ${cellCls(0)}`}>{it.item}</td>
                    <td className={`px-2 py-2.5 text-center tabular-nums text-slate-400 dark:text-slate-500 ${cellCls(1)}`}>{it.priQty || it.curQty ? cat.uom : ''}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-slate-100 ${cellCls(2)}`}>{qty(it.priQty)}</td>
                    <td className={`px-2 py-2.5 text-right tabular-nums text-slate-400 dark:text-slate-500 ${cellCls(3)}`}>{it.priQty ? formatPercent(it.priPct) : ''}</td>
                    <td className={`px-2 py-2.5 text-right tabular-nums text-slate-400 dark:text-slate-500 ${cellCls(4)}`}>{it.priQty ? it.priRank : ''}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-slate-100 ${cellCls(5)}`}>{qty(it.curQty)}</td>
                    <td className={`px-2 py-2.5 text-right tabular-nums text-slate-400 dark:text-slate-500 ${cellCls(6)}`}>{it.curQty ? formatPercent(it.curPct) : ''}</td>
                    <td className={`px-2 py-2.5 text-right tabular-nums font-medium text-indigo-600 dark:text-indigo-300 ${cellCls(7)}`}>{it.curQty ? it.curRank : ''}</td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
