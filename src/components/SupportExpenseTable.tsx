import { Fragment, useState } from 'react';
import { formatPercent, formatMoney } from '../lib/format';
import { useUi } from '../contexts/UiContext';
import { useColHighlight } from '../lib/useColHighlight';
import type { SupportExpSection } from '../lib/supportQueries';

// Per-account expense detail for a support unit, grouped by section (biggest
// first), each section collapsible. Prior | % | Current | %DIFF.
export default function SupportExpenseTable({ sections, priorLabel, currentLabel }: { sections: SupportExpSection[]; priorLabel: string; currentLabel: string }) {
  const { units } = useUi();
  const { tableProps, cellCls } = useColHighlight();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (k: string) => setCollapsed((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  if (sections.length === 0) return <p className="text-slate-400 dark:text-slate-500">No expense detail for this period.</p>;

  const money = (v: number) => formatMoney(v, 'full', units);
  const headCls = 'sticky top-0 z-10 bg-slate-100 px-3 py-2 text-right dark:bg-slate-900/80';

  return (
    <div className="max-h-[72vh] overflow-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-0">
      <table className="min-w-full text-sm" {...tableProps}>
        <thead>
          <tr className="border-b border-slate-300 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-500">
            <th className={`sticky left-0 top-0 z-20 bg-slate-100 px-4 py-2 text-left dark:bg-slate-900/80 ${cellCls(0)}`}>Account</th>
            <th className={`${headCls} ${cellCls(1)}`}>{priorLabel}</th>
            <th className={`${headCls} ${cellCls(2)}`}>{currentLabel}</th>
            <th className={`${headCls} ${cellCls(3)}`}>%DIFF</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((sec) => {
            const open = !collapsed.has(sec.section);
            const secDiff = sec.total - sec.priorTotal;
            const secPctDiff = sec.priorTotal !== 0 ? secDiff / sec.priorTotal : 0;
            return (
              <Fragment key={sec.section}>
                <tr onClick={() => toggle(sec.section)} className="cursor-pointer select-none border-b border-slate-200 bg-slate-100/80 font-semibold text-slate-900 dark:border-slate-700/60 dark:bg-slate-700/50 dark:text-slate-100">
                  <td className={`sticky left-0 bg-slate-100 px-4 py-2 text-left uppercase dark:bg-slate-700 ${cellCls(0)}`}>
                    <span className="mr-1 inline-block w-3 text-indigo-500">{open ? '▾' : '▸'}</span>{sec.section}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${cellCls(1)}`}>{money(sec.priorTotal)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${cellCls(2)}`}>{money(sec.total)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${secDiff >= 0 ? 'text-red-600' : 'text-green-600'} ${cellCls(3)}`}>{formatPercent(secPctDiff)}</td>
                </tr>
                {open && sec.rows.map((r) => {
                  const up = r.diff >= 0;
                  return (
                    <tr key={sec.section + r.account} className="border-b border-slate-200 dark:border-slate-700/60">
                      <td className={`sticky left-0 bg-white px-4 py-2.5 pl-8 text-left text-slate-600 dark:bg-slate-800 dark:text-slate-300 ${cellCls(0)}`}>{r.account}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400 ${cellCls(1)}`}>{money(r.prior)}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-slate-100 ${cellCls(2)}`}>{money(r.current)}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${up ? 'text-red-600' : 'text-green-600'} ${cellCls(3)}`}>{up ? '▲' : '▼'} {formatPercent(r.pctDiff)}</td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
