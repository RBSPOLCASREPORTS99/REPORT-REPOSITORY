import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ComparisonControl, { type ComparisonState } from '../components/ComparisonControl';
import SetMonthSelect from '../components/SetMonthSelect';
import GffcPnlTable from '../components/GffcPnlTable';
import ExpenseTable from '../components/ExpenseTable';
import { TableSkeleton } from '../components/Skeleton';
import { fetchRanges, saveExpenseSection, type RangeRow, type ExpenseSection } from '../lib/queries';
import { fetchSupportPnl, fetchSupportExpenses, saveSupportPct, saveSupportConfig, supportOverrideKey, unitBySlug, UNIT_METHODS, type SupportPnlResult, type SupportMethod } from '../lib/supportQueries';
import type { GffcPnlLine } from '../lib/gffc/gffcQueries';
import { useAuth } from '../contexts/AuthContext';

// Simulated Support-Unit P&L (Finance / HR / Management), with an Expenses tab.
export default function SupportPnl() {
  const { unit: slug } = useParams<{ unit: string }>();
  const meta = unitBySlug(slug);
  const { profile } = useAuth();
  const isFinance = profile?.role === 'finance';
  const [ranges, setRanges] = useState<RangeRow[]>([]);
  const [cmp, setCmp] = useState<ComparisonState | null>(null);
  const [view, setView] = useState<'pnl' | 'expenses'>('pnl');
  const [res, setRes] = useState<SupportPnlResult | null>(null);
  const [sections, setSections] = useState<ExpenseSection[]>([]);
  const [pctText, setPctText] = useState('');
  const [rateText, setRateText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reqRef = useRef(0);

  useEffect(() => { fetchRanges().then(setRanges).catch((e) => { setError(e.message); setLoading(false); }); }, []);

  const reload = () => {
    if (!meta || !cmp?.currentId) { setRes(null); setLoading(false); return; }
    const myReq = ++reqRef.current;
    setLoading(true);
    Promise.all([fetchSupportPnl(meta.unit, cmp.currentId, cmp.priorId), fetchSupportExpenses(meta.unit, cmp.currentId, cmp.priorId)])
      .then(([d, e]) => { if (myReq === reqRef.current) { setRes(d); setSections(e.sections); setPctText((d.pct * 100).toString()); setRateText(d.rate ? d.rate.toString() : ''); } })
      .catch((e) => { if (myReq === reqRef.current) setError((e as Error).message); })
      .finally(() => { if (myReq === reqRef.current) setLoading(false); });
  };
  useEffect(reload, [meta, cmp?.currentId, cmp?.priorId]);

  async function savePct() {
    if (!meta) return;
    const pct = Number(pctText.replace(/,/g, '')) / 100;
    if (Number.isNaN(pct)) return;
    try { await saveSupportPct(meta.unit, pct); reload(); } catch (e) { setError((e as Error).message); }
  }
  async function saveMethodRate(method: SupportMethod, rateStr: string) {
    if (!meta) return;
    const rate = Number(rateStr.replace(/,/g, '')) || 0;
    try { await saveSupportConfig(meta.unit, method, rate); reload(); } catch (e) { setError((e as Error).message); }
  }

  if (!meta) return <p className="text-red-600">Unknown report.</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  const priorLabel = cmp?.priorLabel ?? 'Prior';
  const currentLabel = cmp?.currentLabel ?? 'Current';
  const method = res?.method ?? 'pct';
  const methods = UNIT_METHODS[meta.unit];

  return (
    <div className="space-y-3">
      <Link to="/" className="text-sm text-slate-400 dark:text-slate-500">← All business units</Link>

      <div className="sticky top-14 z-30 -mx-4 space-y-2 border-b border-slate-200 bg-slate-50 px-4 py-2 lg:top-0 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 shrink truncate text-lg font-semibold text-slate-900 dark:text-slate-100">{meta.label} <span className="text-xs font-normal text-slate-400">· simulated</span></h1>
          <div className="flex flex-1 justify-center"><SetMonthSelect ranges={ranges} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ComparisonControl ranges={ranges} onChange={setCmp} showSetMonth={false} />
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-700/60">
            {(['pnl', 'expenses'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${view === v ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>{v === 'pnl' ? 'P&L' : 'Expenses'}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-400 dark:text-slate-500">Revenue by {method === 'pct' ? '% of revenue' : method === 'per_txn' ? 'per # transaction' : 'per PAX'}; expenses actual from the P&amp;L-per-Class import.</p>
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {/* Method (Finance/HR can switch; Management is % only). */}
          {isFinance && methods.length > 1 && (
            <select value={method} onChange={(e) => saveMethodRate(e.target.value as SupportMethod, rateText)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs">
              {methods.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          )}
          {method === 'pct' ? (
            <label className="flex items-center gap-1.5">% of Revenue
              {isFinance ? <input value={pctText} onChange={(e) => setPctText(e.target.value)} onBlur={savePct} className="w-16 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-0.5 text-right tabular-nums focus:outline-none" />
                : <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">{((res?.pct ?? 0) * 100).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>}%
            </label>
          ) : (
            <label className="flex items-center gap-1.5">Rate {method === 'per_txn' ? '/ txn' : '/ EE'}
              {isFinance ? <input value={rateText} onChange={(e) => setRateText(e.target.value)} onBlur={() => saveMethodRate(method, rateText)} className="w-20 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-0.5 text-right tabular-nums focus:outline-none" />
                : <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">{(res?.rate ?? 0).toLocaleString()}</span>}
            </label>
          )}
          {isFinance && method !== 'pct' && (
            <Link to="/support-entry" title="Per-BU counts" className="rounded-lg bg-slate-100 px-2 py-1 text-sm text-slate-600 dark:bg-slate-700 dark:text-slate-300">✎</Link>
          )}
        </div>
      </div>

      {loading ? <TableSkeleton /> : view === 'expenses' ? (
        <ExpenseTable sections={sections} priorLabel={priorLabel} currentLabel={currentLabel}
          canEdit={isFinance}
          onReclassify={async (account, section) => {
            if (!meta) return;
            try { await saveExpenseSection(supportOverrideKey(meta.unit, account), section); reload(); } catch (e) { setError((e as Error).message); }
          }} />
      ) : !res?.hasData ? (
        <p className="rounded-2xl bg-white p-6 text-center text-slate-400 shadow-sm dark:bg-slate-800 dark:text-slate-500">No data for this period. Import the monthly P&amp;L (which now captures Finance / HR / Management expenses).</p>
      ) : (
        <GffcPnlTable lines={res.lines as GffcPnlLine[]} priorLabel={priorLabel} currentLabel={currentLabel} />
      )}
    </div>
  );
}
