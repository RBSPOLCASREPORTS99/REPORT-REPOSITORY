import { Fragment, useState } from 'react';
import { formatPercent } from '../lib/format';
import { useColHighlight } from '../lib/useColHighlight';
import type { ParamRow } from '../lib/params/paramQueries';

// Per-BU operational KPIs: PARAMETER | STD | prior | current | %DIFF. Values
// format per each parameter (peso / %, precision). STD is the target — hidden
// for BUs that don't track standards (showStd = false).
export default function ParametersTable({ rows, priorLabel, currentLabel, showStd = true }: { rows: ParamRow[]; priorLabel: string; currentLabel: string; showStd?: boolean }) {
  const { tableProps, cellCls } = useColHighlight();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleGroup = (g: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(g)) next.delete(g); else next.add(g);
    return next;
  });
  if (rows.length === 0) return <p className="text-slate-400 dark:text-slate-500">No parameters for this period yet.</p>;

  // Each group's Total row (shown on the header when the group is collapsed).
  const totalByGroup = new Map<string, ParamRow>();
  for (const r of rows) if (r.group && r.groupTotal) totalByGroup.set(r.group, r);

  const fmt = (v: number | null, r: ParamRow) => {
    if (v == null) return '—';
    const opts = { minimumFractionDigits: r.decimals, maximumFractionDigits: r.decimals } as const;
    if (r.pct) return `${(v * 100).toLocaleString('en-PH', opts)}%`;
    const s = v.toLocaleString('en-PH', opts);
    return r.peso ? `₱${s}` : s;
  };
  const headCls = 'sticky top-0 z-10 bg-slate-100 px-3 py-2 text-right dark:bg-slate-900/80';
  // Physical column indices shift when the STD column is hidden.
  const cPrior = showStd ? 2 : 1;
  const cCur = showStd ? 3 : 2;
  const cDiff = showStd ? 4 : 3;
  const nCols = showStd ? 5 : 4;

  // The value cells (STD / prior / current / %DIFF) for a row — reused for the
  // group's Total shown on a collapsed header.
  const valueCells = (r: ParamRow) => {
    const pctDiff = r.prior != null && r.prior !== 0 && r.current != null ? (r.current - r.prior) / r.prior : null;
    const increased = (pctDiff ?? 0) >= 0;
    const favorable = r.cost ? !increased : increased;
    return (
      <>
        {showStd && <td className={`px-3 py-2.5 text-right tabular-nums text-slate-400 dark:text-slate-500 ${cellCls(1)}`}>{fmt(r.std, r)}</td>}
        <td className={`px-3 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400 ${cellCls(cPrior)}`}>{fmt(r.prior, r)}</td>
        <td className={`px-3 py-2.5 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100 ${cellCls(cCur)}`}>{fmt(r.current, r)}</td>
        <td className={`px-3 py-2.5 text-right tabular-nums ${pctDiff == null ? 'text-slate-400 dark:text-slate-500' : favorable ? 'text-green-600' : 'text-red-600'} ${cellCls(cDiff)}`}>
          {pctDiff == null ? '—' : `${increased ? '▲' : '▼'} ${formatPercent(pctDiff)}`}
        </td>
      </>
    );
  };

  return (
    <div className="max-h-[72vh] overflow-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-0">
      <table className="min-w-full text-sm" {...tableProps}>
        <thead>
          <tr className="border-b border-slate-300 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-500">
            <th className={`sticky left-0 top-0 z-20 bg-slate-100 px-4 py-2 text-left dark:bg-slate-900/80 ${cellCls(0)}`}>Parameter</th>
            {showStd && <th className={`${headCls} ${cellCls(1)}`}>STD</th>}
            <th className={`${headCls} ${cellCls(cPrior)}`}>{priorLabel}</th>
            <th className={`${headCls} ${cellCls(cCur)}`}>{currentLabel}</th>
            <th className={`${headCls} ${cellCls(cDiff)}`}>%DIFF</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const first = !!r.group && r.group !== rows[i - 1]?.group;
            const groupCollapsed = !!r.group && collapsed.has(r.group);
            const total = r.group ? totalByGroup.get(r.group) : undefined;
            return (
              <Fragment key={r.key}>
              {first && (
                <tr onClick={() => toggleGroup(r.group!)}
                  className="cursor-pointer select-none border-b border-slate-200 bg-slate-100/80 dark:border-slate-700/60 dark:bg-slate-700/50">
                  <td {...(groupCollapsed && total ? {} : { colSpan: nCols })}
                    className={`sticky left-0 bg-slate-100 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:bg-slate-700 dark:text-indigo-300 ${cellCls(0)}`}>
                    <span className="mr-1 inline-block w-3 text-indigo-500">{groupCollapsed ? '▸' : '▾'}</span>{r.group}
                  </td>
                  {groupCollapsed && total && valueCells(total)}
                </tr>
              )}
              {!groupCollapsed && (
                <tr className="border-b border-slate-200 dark:border-slate-700/60">
                  <td className={`sticky left-0 bg-white px-4 py-2.5 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200 ${r.group ? 'pl-8' : ''} ${cellCls(0)}`}>{r.label}</td>
                  {valueCells(r)}
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
