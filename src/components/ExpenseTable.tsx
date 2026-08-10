import { Fragment, useEffect, useState } from 'react';
import { formatPercent, formatMoney } from '../lib/format';
import { useUi } from '../contexts/UiContext';
import { useColHighlight } from '../lib/useColHighlight';
import { fetchExpenseReasons, fetchReasonAccounts, saveExpenseReason, type ExpenseSection, type ExpenseReasonRow } from '../lib/queries';

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
// When reasonScope + rangeId are given, clicking the Current cell opens a note
// ("reason") for that account & period, with the history of prior reasons.
export default function ExpenseTable({
  sections,
  priorLabel,
  currentLabel,
  canEdit = false,
  onReclassify,
  reasonScope,
  rangeId,
  rangeLabel,
  canEditReason = false,
}: {
  sections: ExpenseSection[];
  priorLabel: string;
  currentLabel: string;
  canEdit?: boolean;
  onReclassify?: (account: string, section: 'controllable' | 'uncontrollable') => void;
  reasonScope?: string;
  rangeId?: string;
  rangeLabel?: string;
  canEditReason?: boolean;
}) {
  const { units } = useUi();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(['salaries', 'controllable', 'uncontrollable']));
  const toggle = (key: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const { tableProps, cellCls } = useColHighlight();

  // ---- Reasons ----
  const reasonsOn = !!reasonScope && !!rangeId;
  const [flagged, setFlagged] = useState<Set<string>>(new Set()); // accounts with a reason this range
  const [openAcct, setOpenAcct] = useState<string | null>(null);
  const [history, setHistory] = useState<ExpenseReasonRow[]>([]);
  const [reasonText, setReasonText] = useState('');
  const [reasonBusy, setReasonBusy] = useState(false);
  const [reasonErr, setReasonErr] = useState('');

  useEffect(() => {
    if (!reasonsOn) return;
    let cancelled = false;
    fetchReasonAccounts(reasonScope!, rangeId!).then((s) => { if (!cancelled) setFlagged(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, [reasonsOn, reasonScope, rangeId]);

  async function openReason(account: string) {
    setOpenAcct(account); setReasonErr(''); setReasonBusy(true); setHistory([]); setReasonText('');
    try {
      const rows = await fetchExpenseReasons(reasonScope!, account);
      setHistory(rows);
      setReasonText(rows.find((r) => r.rangeId === rangeId)?.reason ?? '');
    } catch (e) { setReasonErr((e as Error).message); } finally { setReasonBusy(false); }
  }
  async function saveReason() {
    if (!openAcct) return;
    setReasonBusy(true); setReasonErr('');
    try {
      await saveExpenseReason(reasonScope!, openAcct, rangeId!, reasonText);
      const [rows, set] = await Promise.all([fetchExpenseReasons(reasonScope!, openAcct), fetchReasonAccounts(reasonScope!, rangeId!)]);
      setHistory(rows); setFlagged(set);
    } catch (e) { setReasonErr((e as Error).message); } finally { setReasonBusy(false); }
  }

  if (sections.length === 0) return <p className="text-slate-400 dark:text-slate-500">No expense detail for this period.</p>;

  const money = (v: number) => formatMoney(v, 'full', units);
  const numCls = (v: number) => (v < 0 ? 'text-red-600' : 'text-slate-900 dark:text-slate-100');
  const headCls = 'sticky top-0 z-10 bg-slate-100 px-3 py-2 text-right dark:bg-slate-900/80';

  return (
    <>
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
                  const editable = canEdit && !!onReclassify && sec.section !== 'salaries';
                  const target: 'controllable' | 'uncontrollable' = sec.section === 'controllable' ? 'uncontrollable' : 'controllable';
                  return (
                    <tr key={sec.section + row.account} className="border-b border-slate-200 dark:border-slate-700/60">
                      <td className={`sticky left-0 bg-white dark:bg-slate-800 px-4 py-2.5 pl-6 text-left text-slate-600 dark:text-slate-300 ${cellCls(0)}`}>{row.account}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${numCls(row.prior)} ${cellCls(1)}`}>{money(row.prior)}</td>
                      <td className={`px-2 py-2.5 text-right tabular-nums text-slate-400 dark:text-slate-500 ${cellCls(2)}`}>{formatPercent(row.priorPct)}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${numCls(row.current)} ${cellCls(3)}`}>
                        {reasonsOn ? (
                          <button onClick={() => openReason(row.account)} title="Add / view reason"
                            className="inline-flex items-center gap-1 rounded px-1 hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300">
                            {flagged.has(row.account) && <span className="text-[11px] leading-none" aria-label="has reason">🗨</span>}
                            {money(row.current)}
                          </button>
                        ) : money(row.current)}
                      </td>
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

    {reasonsOn && (
      <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">Tip: click a {currentLabel} amount to {canEditReason ? 'add a' : 'view the'} reason for that account, and see the history from earlier periods.</p>
    )}

    {openAcct && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
        <button aria-label="Close" onClick={() => setOpenAcct(null)} className="absolute inset-0 cursor-default bg-black/50" />
        <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800">
          <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Expense reason</p>
              <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{openAcct}</h3>
            </div>
            <button onClick={() => setOpenAcct(null)} aria-label="Close" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xl text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-700">×</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Reason for {rangeLabel ?? currentLabel}</p>
            {canEditReason ? (
              <>
                <textarea value={reasonText} onChange={(e) => setReasonText(e.target.value)} rows={3}
                  placeholder="Why did this expense move? (e.g. one-off repair, price increase…)"
                  className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
                {reasonErr && <p className="mt-1 text-xs text-red-600">{reasonErr}</p>}
                <div className="mt-2 flex justify-end">
                  <button onClick={saveReason} disabled={reasonBusy}
                    className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                    {reasonBusy ? 'Saving…' : 'Save reason'}
                  </button>
                </div>
              </>
            ) : (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-900/40 dark:text-slate-200">{reasonText || <span className="text-slate-400 dark:text-slate-500">No reason recorded.</span>}</p>
            )}

            <p className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">History</p>
            {reasonBusy && history.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">Loading…</p>
            ) : history.filter((h) => h.rangeId !== rangeId).length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">No earlier reasons.</p>
            ) : (
              <ul className="space-y-2">
                {history.filter((h) => h.rangeId !== rangeId).map((h) => (
                  <li key={h.rangeId} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{h.rangeLabel}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">{h.updatedAt ? new Date(h.updatedAt).toLocaleDateString() : ''}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{h.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
