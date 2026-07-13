import { useColHighlight } from '../lib/useColHighlight';
import type { RoiRow } from '../lib/roiQueries';

// ROI on Labor, ranked highest-first: RANK | BU | Net Income | Total Labor Cost |
// ROI, for the current period, plus the prior period's ROI and rank movement.
export default function RoiLaborTable({ rows, priorLabel, currentLabel }: { rows: RoiRow[]; priorLabel: string; currentLabel: string }) {
  const { tableProps, cellCls } = useColHighlight();
  if (rows.length === 0) return <p className="text-slate-400 dark:text-slate-500">No ROI data for this period yet.</p>;

  // Accounting format: negatives in parentheses.
  const peso = (v: number) => (v < 0 ? `₱(${Math.round(-v).toLocaleString('en-PH')})` : `₱${Math.round(v).toLocaleString('en-PH')}`);
  const roiFmt = (v: number | null) => {
    if (v == null) return '—';
    const s = Math.abs(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v < 0 ? `(${s})` : s;
  };
  const th = 'sticky top-0 z-10 bg-slate-100 px-3 py-2 text-right dark:bg-slate-900/80';

  const totNi = rows.reduce((s, r) => s + r.netIncome, 0);
  const totLabor = rows.reduce((s, r) => s + r.laborCost, 0);
  const totRoi = totLabor !== 0 ? totNi / totLabor : null;

  const roiCls = (v: number | null) => (v == null ? 'text-slate-400 dark:text-slate-500' : v < 0 ? 'text-red-600' : 'text-slate-900 dark:text-slate-100');

  return (
    <div className="max-h-[72vh] overflow-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-0">
      <table className="min-w-full text-sm" {...tableProps}>
        <thead>
          <tr className="border-b border-slate-300 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-500">
            <th className={`sticky left-0 top-0 z-20 bg-slate-100 px-4 py-2 text-center dark:bg-slate-900/80 ${cellCls(0)}`}>Rank</th>
            <th className={`sticky left-0 top-0 z-20 bg-slate-100 px-4 py-2 text-left dark:bg-slate-900/80 ${cellCls(1)}`}>Business Unit</th>
            <th className={`${th} ${cellCls(2)}`}>Net Income ({currentLabel})</th>
            <th className={`${th} ${cellCls(3)}`}>Total Labor Cost</th>
            <th className={`${th} ${cellCls(4)}`}>ROI on Labor</th>
            <th className={`${th} px-2 ${cellCls(5)}`}>ROI ({priorLabel})</th>
            <th className={`${th} px-2 ${cellCls(6)}`}>Δ Rank</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const move = r.priorRank && r.rank ? r.priorRank - r.rank : 0; // + = moved up
            return (
              <tr key={r.buCode} className="border-b border-slate-200 dark:border-slate-700/60">
                <td className={`sticky left-0 bg-white px-4 py-2.5 text-center font-semibold text-indigo-700 dark:bg-slate-800 dark:text-indigo-300 ${cellCls(0)}`}>{r.rank}</td>
                <td className={`sticky left-0 bg-white px-4 py-2.5 text-left font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-100 ${cellCls(1)}`}>
                  {r.label}{r.overridden && <span title="Manually overridden" className="ml-1 text-[10px] text-amber-500">✎</span>}
                </td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${r.netIncome < 0 ? 'text-red-600' : 'text-slate-900 dark:text-slate-100'} ${cellCls(2)}`}>{peso(r.netIncome)}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300 ${cellCls(3)}`}>{peso(r.laborCost)}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${roiCls(r.roi)} ${cellCls(4)}`}>{roiFmt(r.roi)}</td>
                <td className={`px-2 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400 ${cellCls(5)}`}>{roiFmt(r.priorRoi)}</td>
                <td className={`px-2 py-2.5 text-center tabular-nums ${move > 0 ? 'text-green-600' : move < 0 ? 'text-red-600' : 'text-slate-400 dark:text-slate-500'} ${cellCls(6)}`}>
                  {move === 0 ? '—' : `${move > 0 ? '▲' : '▼'}${Math.abs(move)}`}
                </td>
              </tr>
            );
          })}
          <tr className="border-t-2 border-slate-300 bg-slate-100/80 font-semibold dark:border-slate-600 dark:bg-slate-700/50">
            <td className={`sticky left-0 bg-slate-100 px-4 py-2.5 dark:bg-slate-700 ${cellCls(0)}`} />
            <td className={`sticky left-0 bg-slate-100 px-4 py-2.5 text-left uppercase text-slate-900 dark:bg-slate-700 dark:text-slate-100 ${cellCls(1)}`}>Total</td>
            <td className={`px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white ${cellCls(2)}`}>{peso(totNi)}</td>
            <td className={`px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white ${cellCls(3)}`}>{peso(totLabor)}</td>
            <td className={`px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white ${cellCls(4)}`}>{roiFmt(totRoi)}</td>
            <td className={cellCls(5)} /><td className={cellCls(6)} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
