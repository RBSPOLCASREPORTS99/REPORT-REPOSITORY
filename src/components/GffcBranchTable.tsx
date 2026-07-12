import { formatPercent, formatMoney } from '../lib/format';
import { useUi } from '../contexts/UiContext';
import { useColHighlight } from '../lib/useColHighlight';
import type { GffcBranchResult } from '../lib/gffc/gffcQueries';

const BOLD = new Set(['gross', 'gross_income', 'total', 'net']);

// GFFC per-branch P&L: rows = P&L lines, columns = each branch + a Total column.
export default function GffcBranchTable({ data, periodLabel }: { data: GffcBranchResult; periodLabel: string }) {
  const { units } = useUi();
  const { tableProps, cellCls } = useColHighlight();
  if (!data.hasData) return <p className="text-slate-400 dark:text-slate-500">No per-branch data for this period. Import the GFFC workbook with the "P&L per CLASS" sheets.</p>;

  const money = (v: number) => formatMoney(v, 'full', units);
  const cols = [...data.branches, 'TOTAL'];
  const th = 'sticky top-0 z-10 bg-slate-100 px-3 py-2 text-right dark:bg-slate-900/80';

  return (
    <div className="max-h-[72vh] overflow-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-0">
      <table className="min-w-full text-sm" {...tableProps}>
        <thead>
          <tr className="border-b border-slate-300 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-500">
            <th className={`sticky left-0 top-0 z-20 bg-slate-100 px-4 py-2 text-left dark:bg-slate-900/80 ${cellCls(0)}`}>{periodLabel}</th>
            {cols.map((b, i) => (
              <th key={b} className={`${th} ${b === 'TOTAL' ? 'text-indigo-700 dark:text-indigo-300' : ''} ${cellCls(i + 1)}`}>{b === 'TOTAL' ? 'Total' : b}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.lines.map((line) => {
            const bold = BOLD.has(line.kind);
            const rowCls = bold ? 'bg-slate-100 font-semibold dark:bg-slate-700/70' : '';
            const stickyCls = bold ? 'bg-slate-100 font-semibold text-indigo-700 dark:bg-slate-700 dark:text-indigo-300' : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300';
            return (
              <tr key={line.key} className={`border-b border-slate-200 dark:border-slate-700/60 ${rowCls}`}>
                <td className={`sticky left-0 px-4 py-2.5 text-left uppercase ${stickyCls} ${cellCls(0)}`}>{line.label}</td>
                {cols.map((b, i) => {
                  const v = line.values[b] ?? 0;
                  const text = line.kind === 'pct' ? formatPercent(v) : money(v);
                  const numCls = line.kind === 'pct' ? 'text-slate-500 dark:text-slate-400' : v < 0 ? 'text-red-600 dark:text-red-400' : bold ? 'text-slate-900 dark:text-white' : 'text-slate-900 dark:text-slate-100';
                  return <td key={b} className={`px-3 py-2.5 text-right tabular-nums ${numCls} ${cellCls(i + 1)}`}>{text}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
