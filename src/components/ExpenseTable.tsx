import { Fragment } from 'react';
import { formatPercent, formatPesos } from '../lib/format';
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
  if (sections.length === 0) return <p className="text-slate-400">No expense detail for this period.</p>;

  const money = (v: number) => `₱${formatPesos(v)}`;
  const numCls = (v: number) => (v < 0 ? 'text-red-600' : 'text-slate-900');

  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs font-medium text-slate-400">
            <th className="sticky left-0 bg-white px-4 py-2 text-left">Account</th>
            <th className="px-3 py-2 text-right">{priorLabel}</th>
            <th className="px-2 py-2 text-right">%</th>
            <th className="px-3 py-2 text-right">{currentLabel}</th>
            <th className="px-2 py-2 text-right">%</th>
            <th className="px-3 py-2 text-right">DIFF</th>
            <th className="px-3 py-2 text-right">%DIFF</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((sec) => (
            <Fragment key={sec.section}>
              <tr className="bg-slate-50/80 font-semibold text-slate-900">
                <td className="sticky left-0 bg-slate-50 px-4 py-2 text-left">{SECTION_LABELS[sec.section]}</td>
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
                    <td className="sticky left-0 bg-white px-4 py-2.5 pl-6 text-left text-slate-600">{row.account}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${numCls(row.prior)}`}>{money(row.prior)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-400">{formatPercent(row.priorPct)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${numCls(row.current)}`}>{money(row.current)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-400">{formatPercent(row.currentPct)}</td>
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
