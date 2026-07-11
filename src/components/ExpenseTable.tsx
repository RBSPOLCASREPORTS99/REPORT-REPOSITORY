import { Fragment, useState } from 'react';
import { formatPercent, formatMoney } from '../lib/format';
import { useUi } from '../contexts/UiContext';
import { useColHighlight } from '../lib/useColHighlight';
import type { ExpenseSection } from '../lib/queries';

const SECTION_LABELS: Record<string, string> = {
  salaries: 'Salaries and Wages',
  controllable: 'Controllable',
  uncontrollable: 'Non-controllable',
};

// Per-BU expense detail as a comparative table, same shape as the P&L:
// Account | Prior | % | Current | % | DIFF | %DIFF. Grouped into Salaries and
// Wages (first), Controllable, and Non-controllable — each collapsible (click
// the section header); all three start collapsed. Finance gets a right-most
// C / NC button per account to move it between Controllable and Non-controllable.
export default function ExpenseTable({
  sections,
  priorLabel,
  currentLabel,
  canEdit = false,
  onReclassify,
}: {
  sections: ExpenseSection[];
  priorLabel: string;
  currentLabel: string;
  canEdit?: boolean;
  onReclassify?: (account: string, section: 'controllable' | 'uncontrollable') => void;
}) {
  const { units } = useUi();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(['salaries', 'controllable', 'uncontrollable']));
  const toggle = (key: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const { tableProps, cellCls } = useColHighlight();

  if (sections.length === 0) return <p className="text-slate-400 dark:text-slate-500">No expense detail for this period.</p>;

  const money = (v: number) => formatMoney(v, 'full', units);
  const numCls = (v: number) => (v < 0 ? 'text-red-600' : 'text-slate-900 dark:text-slate-100');
  const headCls = 'sticky top-0 z-10 bg-slate-100 px-3 py-2 text-right dark:bg-slate-900/80';

  return (
    <div className="max-h-[72vh] overflow-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-0">
      <table className="min-w-full text-sm" {...tableProps}>
        <thead>
          <tr className="border-b border-slate-300 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-500">
            <th className={`sticky left-0 top-0 z-20 bg-slate-100 px-4 py-2 text-left dark:bg-slate-900/80 ${cellCls(0)}`}>Account</th>
            <th className={`${headCls} ${cellCls(1)}`}>{priorLabel}</th>
            <th className={`${headCls} px-2 ${cellCls(2)}`}>%</th>
            <th className={`${headCls} ${cellCls(3)}`}>{currentLabel}</th>
            <th className={`${headCls} px-2 ${cellCls(4)}`}>%</th>
            <th className={`${headCls} ${cellCls(5)}`}>DIFF</th>
            <th className={`${headCls} ${cellCls(6)}`}>%DIFF</th>
            {canEdit && <th className={`${headCls} px-2 ${cellCls(7)}`}>ET</th>}
          </tr>
        </thead>
        <tbody>
          {sections.map((sec) => {
            const open = !collapsed.has(sec.section);
            const secDiff = sec.total - sec.priorTotal;
            const secPctDiff = sec.priorTotal !== 0 ? secDiff / sec.priorTotal : 0;
            return (
              <Fragment key={sec.section}>
                <tr onClick={() => toggle(sec.section)}
                  className="cursor-pointer select-none border-b border-slate-200 bg-slate-100/80 font-semibold text-slate-900 dark:border-slate-700/60 dark:bg-slate-700/50 dark:text-slate-100">
                  <td className={`sticky left-0 bg-slate-100 px-4 py-2 text-left uppercase dark:bg-slate-700 ${cellCls(0)}`}>
                    <span className="mr-1 inline-block w-3 text-indigo-500">{open ? '▾' : '▸'}</span>
                    {SECTION_LABELS[sec.section]}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${cellCls(1)}`}>{money(sec.priorTotal)}</td>
                  <td className={`px-2 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400 ${cellCls(2)}`}>{sec.priorPct != null ? formatPercent(sec.priorPct) : ''}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${cellCls(3)}`}>{money(sec.total)}</td>
                  <td className={`px-2 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400 ${cellCls(4)}`}>{sec.pct != null ? formatPercent(sec.pct) : ''}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${secDiff >= 0 ? 'text-red-600' : 'text-green-600'} ${cellCls(5)}`}>
                    {money(Math.abs(secDiff))}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${secDiff >= 0 ? 'text-red-600' : 'text-green-600'} ${cellCls(6)}`}>{formatPercent(secPctDiff)}</td>
                  {canEdit && <td className={`px-2 py-2 ${cellCls(7)}`} />}
                </tr>
                {open && sec.rows.map((row) => {
                  const up = row.diff >= 0;
                  // Finance can move an account between Controllable/Non-controllable
                  // (not Salaries — that group is fixed). The override applies to
                  // every BU and is remembered.
                  const editable = canEdit && !!onReclassify && sec.section !== 'salaries';
                  const target: 'controllable' | 'uncontrollable' = sec.section === 'controllable' ? 'uncontrollable' : 'controllable';
                  return (
                    <tr key={sec.section + row.account} className="border-b border-slate-200 dark:border-slate-700/60">
                      <td className={`sticky left-0 bg-white dark:bg-slate-800 px-4 py-2.5 pl-6 text-left text-slate-600 dark:text-slate-300 ${cellCls(0)}`}>{row.account}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${numCls(row.prior)} ${cellCls(1)}`}>{money(row.prior)}</td>
                      <td className={`px-2 py-2.5 text-right tabular-nums text-slate-400 dark:text-slate-500 ${cellCls(2)}`}>{formatPercent(row.priorPct)}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${numCls(row.current)} ${cellCls(3)}`}>{money(row.current)}</td>
                      <td className={`px-2 py-2.5 text-right tabular-nums text-slate-400 dark:text-slate-500 ${cellCls(4)}`}>{formatPercent(row.currentPct)}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${up ? 'text-red-600' : 'text-green-600'} ${cellCls(5)}`}>
                        {up ? '▲' : '▼'} {money(Math.abs(row.diff))}
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${up ? 'text-red-600' : 'text-green-600'} ${cellCls(6)}`}>
                        {formatPercent(row.pctDiff)}
                      </td>
                      {canEdit && (
                        <td className={`px-2 py-2.5 text-center ${cellCls(7)}`}>
                          {editable && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onReclassify!(row.account, target); }}
                              title={`Move to ${target === 'controllable' ? 'Controllable' : 'Non-controllable'}`}
                              className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-indigo-600 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
                            >
                              {target === 'controllable' ? 'C' : 'NC'}
                            </button>
                          )}
                        </td>
                      )}
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
