import { Fragment } from 'react';
import { formatPercent, formatMoney } from '../lib/format';
import { useUi } from '../contexts/UiContext';
import type { ExpenseSection } from '../lib/queries';

const SECTION_LABELS: Record<string, string> = {
  controllable: 'Controllable',
  uncontrollable: 'Non-controllable',
};

// Per-BU expense detail as a comparative table, same shape as the P&L:
// Account | Prior | % | Current | % | DIFF | %DIFF. Grouped by section
// (Controllable / Non-controllable), accounts sorted largest-first. Full pesos.
export default function ExpenseTable({
  sections,
  priorLabel,
  currentLabel,
}: {
  sections: ExpenseSection[];
  priorLabel: string;
  currentLabel: string;
}) {
  const { units } = useUi();
  if (sections.length === 0) return <p className="text-slate-400 dark:text-slate-500">No expense detail for this period.</p>;

  const money = (v: number) => formatMoney(v, 'full', units);
  const numCls = (v: number) => (v < 0 ? 'text-red-600' : 'text-slate-900 dark:text-slate-100');
  const headCls = 'sticky top-0 z-10 bg-white px-3 py-2 text-right dark:bg-slate-800';

  return (
    <div className="max-h-[72vh] overflow-auto rounded-2xl bg-white shadow-sm dark:bg-slate-800">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:text-slate-500">
            <th className="sticky left-0 top-0 z-20 bg-white px-4 py-2 text-left dark:bg-slate-800">Account</th>
            <th className={headCls}>{priorLabel}</th>
            <th className={`${headCls} px-2`}>%</th>
            <th className={headCls}>{currentLabel}</th>
            <th className={`${headCls} px-2`}>%</th>
            <th className={headCls}>DIFF</th>
            <th className={headCls}>%DIFF</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((sec) => (
            <Fragment key={sec.section}>
              <tr className="bg-slate-50/80 font-semibold text-slate-900 dark:bg-slate-700/50 dark:text-slate-100">
                <td className="sticky left-0 bg-slate-50 px-4 py-2 text-left uppercase dark:bg-slate-700">{SECTION_LABELS[sec.section]}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(sec.priorTotal)}</td>
                <td className="px-2 py-2" />
                <td className="px-3 py-2 text-right tabular-nums">{money(sec.total)}</td>
                <td className="px-2 py-2" />
                <td className={`px-3 py-2 text-right tabular-nums ${sec.total - sec.priorTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {money(Math.abs(sec.total - sec.priorTotal))}
                </td>
                <td className="px-3 py-2" />
              </tr>
              {sec.rows.map((row) => {
                const up = row.diff >= 0;
                return (
                  <tr key={sec.section + row.account} className="border-b border-slate-50">
                    <td className="sticky left-0 bg-white dark:bg-slate-800 px-4 py-2.5 pl-6 text-left text-slate-600 dark:text-slate-300">{row.account}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${numCls(row.prior)}`}>{money(row.prior)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-400 dark:text-slate-500">{formatPercent(row.priorPct)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${numCls(row.current)}`}>{money(row.current)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-400 dark:text-slate-500">{formatPercent(row.currentPct)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${up ? 'text-green-600' : 'text-red-600'}`}>
                      {up ? '▲' : '▼'} {money(Math.abs(row.diff))}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${up ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPercent(row.pctDiff)}
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
