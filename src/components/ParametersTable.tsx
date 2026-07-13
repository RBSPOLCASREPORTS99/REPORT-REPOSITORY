import { formatPercent } from '../lib/format';
import { useColHighlight } from '../lib/useColHighlight';
import type { ParamRow } from '../lib/params/paramQueries';

// Per-BU operational KPIs: PARAMETER | STD | prior | current | %DIFF. Values
// format per each parameter (peso / %, precision). STD is the target.
export default function ParametersTable({ rows, priorLabel, currentLabel }: { rows: ParamRow[]; priorLabel: string; currentLabel: string }) {
  const { tableProps, cellCls } = useColHighlight();
  if (rows.length === 0) return <p className="text-slate-400 dark:text-slate-500">No parameters for this period yet.</p>;

  const fmt = (v: number | null, r: ParamRow) => {
    if (v == null) return '—';
    const opts = { minimumFractionDigits: r.decimals, maximumFractionDigits: r.decimals } as const;
    if (r.pct) return `${(v * 100).toLocaleString('en-PH', opts)}%`;
    const s = v.toLocaleString('en-PH', opts);
    return r.peso ? `₱${s}` : s;
  };
  const headCls = 'sticky top-0 z-10 bg-slate-100 px-3 py-2 text-right dark:bg-slate-900/80';

  return (
    <div className="max-h-[72vh] overflow-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-0">
      <table className="min-w-full text-sm" {...tableProps}>
        <thead>
          <tr className="border-b border-slate-300 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-500">
            <th className={`sticky left-0 top-0 z-20 bg-slate-100 px-4 py-2 text-left dark:bg-slate-900/80 ${cellCls(0)}`}>Parameter</th>
            <th className={`${headCls} ${cellCls(1)}`}>STD</th>
            <th className={`${headCls} ${cellCls(2)}`}>{priorLabel}</th>
            <th className={`${headCls} ${cellCls(3)}`}>{currentLabel}</th>
            <th className={`${headCls} ${cellCls(4)}`}>%DIFF</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pctDiff = r.prior != null && r.prior !== 0 && r.current != null ? (r.current - r.prior) / r.prior : null;
            const increased = (pctDiff ?? 0) >= 0;
            // For a cost, an increase is unfavourable (red); otherwise up is good.
            const favorable = r.cost ? !increased : increased;
            return (
              <tr key={r.key} className="border-b border-slate-200 dark:border-slate-700/60">
                <td className={`sticky left-0 bg-white px-4 py-2.5 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200 ${cellCls(0)}`}>{r.label}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums text-slate-400 dark:text-slate-500 ${cellCls(1)}`}>{fmt(r.std, r)}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400 ${cellCls(2)}`}>{fmt(r.prior, r)}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100 ${cellCls(3)}`}>{fmt(r.current, r)}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${pctDiff == null ? 'text-slate-400 dark:text-slate-500' : favorable ? 'text-green-600' : 'text-red-600'} ${cellCls(4)}`}>
                  {pctDiff == null ? '—' : `${increased ? '▲' : '▼'} ${formatPercent(pctDiff)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
