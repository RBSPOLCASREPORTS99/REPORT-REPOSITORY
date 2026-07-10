import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ComparisonControl, { type ComparisonState } from '../components/ComparisonControl';
import SetMonthSelect from '../components/SetMonthSelect';
import GffcPnlTable from '../components/GffcPnlTable';
import ExpenseTable from '../components/ExpenseTable';
import SalesTable from '../components/SalesTable';
import { TableSkeleton } from '../components/Skeleton';
import { fetchRanges, type RangeRow, type ExpenseSection, type SalesItemRow } from '../lib/queries';
import { fetchGffcPnl, fetchGffcExpenses, fetchGffcSales, type GffcPnlLine, type Period } from '../lib/gffc/gffcQueries';
import { GFFC_LABEL } from '../lib/gffc/gffcConfig';

type View = 'pnl' | 'expenses' | 'sales';

// GFFC - Chickboy Meating Place company screen: Total P&L / Expense Report /
// Sales by Qty, with the shared YTD / QTR / Month comparisons.
export default function GffcDetail() {
  const [ranges, setRanges] = useState<RangeRow[]>([]);
  const [cmp, setCmp] = useState<ComparisonState | null>(null);
  const [view, setView] = useState<View>('pnl');
  const [lines, setLines] = useState<GffcPnlLine[]>([]);
  const [expenses, setExpenses] = useState<ExpenseSection[]>([]);
  const [sales, setSales] = useState<SalesItemRow[]>([]);
  const [expAvail, setExpAvail] = useState(false);
  const [salesAvail, setSalesAvail] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reqRef = useRef(0);

  useEffect(() => {
    fetchRanges().then(setRanges).catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const periodOf = (id?: string): Period | undefined => {
    const r = ranges.find((x) => x.id === id);
    return r ? { start: r.period_start, end: r.period_end } : undefined;
  };

  useEffect(() => {
    if (!cmp) return;
    const cur = periodOf(cmp.currentId);
    if (!cur) { setLines([]); setExpenses([]); setSales([]); setExpAvail(false); setSalesAvail(false); setLoading(false); return; }
    const pri = periodOf(cmp.priorId);
    const myReq = ++reqRef.current;
    setLoading(true);
    Promise.all([fetchGffcPnl(cur, pri), fetchGffcExpenses(cur, pri), fetchGffcSales(cur, pri)])
      .then(([p, e, s]) => {
        if (myReq !== reqRef.current) return;
        setLines(p.hasData ? p.lines : []);
        setExpenses(e.sections); setExpAvail(e.hasData);
        setSales(s.rows); setSalesAvail(s.hasData);
      })
      .catch((err) => { if (myReq === reqRef.current) setError((err as Error).message); })
      .finally(() => { if (myReq === reqRef.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmp, ranges]);

  useEffect(() => {
    if (view === 'expenses' && !expAvail) setView('pnl');
    if (view === 'sales' && !salesAvail) setView('pnl');
  }, [expAvail, salesAvail, view]);

  const priorLabel = cmp?.priorLabel ?? 'Prior';
  const currentLabel = cmp?.currentLabel ?? 'Current';

  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="space-y-3">
      <Link to="/" className="text-sm text-slate-400 dark:text-slate-500">← All business units</Link>

      <div className="sticky top-14 z-30 -mx-4 space-y-2 border-b border-slate-200 bg-slate-50 px-4 py-2 lg:top-0 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 shrink truncate text-lg font-semibold text-slate-900 dark:text-slate-100">{GFFC_LABEL}</h1>
          <SetMonthSelect ranges={ranges} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ComparisonControl ranges={ranges} onChange={setCmp} showSetMonth={false} />
          {(expAvail || salesAvail) && (
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-700/60">
              {(['pnl', 'expenses', 'sales'] as View[]).map((v) => {
                if (v === 'expenses' && !expAvail) return null;
                if (v === 'sales' && !salesAvail) return null;
                const label = v === 'pnl' ? 'P&L' : v === 'expenses' ? 'Expenses' : 'Sales Qty';
                return (
                  <button key={v} onClick={() => setView(v)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${view === v ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : view === 'expenses' ? (
        <ExpenseTable sections={expenses} priorLabel={priorLabel} currentLabel={currentLabel} />
      ) : view === 'sales' ? (
        <SalesTable rows={sales} priorLabel={priorLabel} currentLabel={currentLabel} buCode="GFFC" />
      ) : lines.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-slate-400 shadow-sm dark:bg-slate-800 dark:text-slate-500">
          No GFFC P&amp;L for this period yet. Import the GFFC workbook (P&amp;L 2025 / P&amp;L 2026).
        </p>
      ) : (
        <GffcPnlTable lines={lines} priorLabel={priorLabel} currentLabel={currentLabel} />
      )}
    </div>
  );
}
