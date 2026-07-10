import { formatPercent, formatMoney } from '../lib/format';
import { useUi } from '../contexts/UiContext';
import type { GffcPnlLine } from '../lib/gffc/gffcQueries';

const BOLD = new Set(['gross', 'gross_income', 'total', 'net']);

// GFFC Total P&L comparison table: LINE ITEM | prior | % | current | % | DIFF | %DIFF.
export default function GffcPnlTable({ lines, priorLabel, currentLabel }: { lines: GffcPnlLine[]; priorLabel: string; currentLabel: string }) {
  const { units } = useUi();
  const money = (v: number) => formatMoney(v, 'full', units);
  const grossC = lines.find((l) => l.kind === 'gross')?.current || 0;
  const grossP = lines.find((l) => l.kind === 'gross')?.prior || 0;
  const th = 'sticky top-0 z-10 bg-slate-100 px-3 py-2 text-right dark:bg-slate-900/80';

  return (
    <div className="max-h-[70vh] overflow-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-0">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-500">
            <th className="sticky left-0 top-0 z-20 bg-slate-100 px-4 py-2 text-left dark:bg-slate-900/80">Line item</th>
            <th className={th}>{priorLabel}</th>
            <th className={`${th} px-2`}>%</th>
            <th className={th}>{currentLabel}</th>
            <th className={`${th} px-2`}>%</th>
            <th className={th}>DIFF</th>
            <th className={th}>%DIFF</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const bold = BOLD.has(line.kind);
            const isPct = line.kind === 'pct';
            const diff = line.current - line.prior;
            const pctDiff = line.prior !== 0 ? diff / line.prior : 0;
            const favorable = line.cost ? diff < 0 : diff >= 0;
            const rowCls = bold ? 'bg-slate-100/80 font-semibold dark:bg-slate-700/50' : '';
            const stickyCls = bold ? 'bg-slate-100 font-semibold text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300';
            const numCls = (v: number) => (v < 0 ? 'text-red-600' : 'text-slate-900 dark:text-slate-100');
            return (
              <tr key={line.key} className={`border-b border-slate-200 dark:border-slate-700/60 ${rowCls}`}>
                <td className={`sticky left-0 px-4 py-2.5 text-left uppercase ${stickyCls}`}>{line.label}</td>
                {isPct ? (
                  <>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400">{formatPercent(line.prior)}</td>
                    <td className="px-2 py-2.5" />
                    <td className={`px-3 py-2.5 text-right tabular-nums ${numCls(line.current)}`}>{formatPercent(line.current)}</td>
                    <td className="px-2 py-2.5" />
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5" />
                  </>
                ) : (
                  <>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${numCls(line.prior)}`}>{money(line.prior)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-400 dark:text-slate-500">{formatPercent(grossP ? line.prior / grossP : 0)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${numCls(line.current)}`}>{money(line.current)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-400 dark:text-slate-500">{formatPercent(grossC ? line.current / grossC : 0)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${favorable ? 'text-green-600' : 'text-red-600'}`}>
                      {diff >= 0 ? '▲' : '▼'} {money(Math.abs(diff))}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${favorable ? 'text-green-600' : 'text-red-600'}`}>{formatPercent(pctDiff)}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
