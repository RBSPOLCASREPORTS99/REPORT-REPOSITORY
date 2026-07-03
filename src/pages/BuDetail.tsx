import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PnlTable from '../components/PnlTable';
import TrendChart from '../components/TrendChart';
import ComparisonControl, { type ComparisonState } from '../components/ComparisonControl';
import AllocMethodToggle from '../components/AllocMethodToggle';
import ExpenseTable from '../components/ExpenseTable';
import SalesTable from '../components/SalesTable';
import { BUSINESS_UNITS } from '../lib/constants';
import {
  fetchBuComparison, fetchTrend, fetchRanges, rangesWithSupport,
  fetchBuExpenses, rangesWithExpenses, fetchBuSales, rangesWithSales,
  type ComparisonLine, type TrendPoint, type RangeRow, type AllocMethod, type ExpenseSection,
  type SalesItemRow,
} from '../lib/queries';

type View = 'pnl' | 'expenses' | 'sales';

export default function BuDetail() {
  const { code } = useParams<{ code: string }>();

  const [ranges, setRanges] = useState<RangeRow[]>([]);
  const [cmp, setCmp] = useState<ComparisonState | null>(null);
  const [lines, setLines] = useState<ComparisonLine[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [method, setMethod] = useState<AllocMethod>('gross_sales');
  const [supportRanges, setSupportRanges] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>('pnl');
  const [expenseRanges, setExpenseRanges] = useState<Set<string>>(new Set());
  const [expenses, setExpenses] = useState<ExpenseSection[]>([]);
  const [salesRanges, setSalesRanges] = useState<Set<string>>(new Set());
  const [salesRows, setSalesRows] = useState<SalesItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const buName = BUSINESS_UNITS.find((b) => b.code === code)?.name ?? code;
  const currentId = cmp?.currentId;
  const priorLabel = cmp?.priorLabel ?? 'Prior';
  const currentLabel = cmp?.currentLabel ?? 'Current';

  const methodAvailable = !!currentId && supportRanges.has(currentId);
  const expensesAvailable = !!currentId && expenseRanges.has(currentId);
  const salesAvailable = !!currentId && salesRanges.has(currentId);

  useEffect(() => {
    Promise.all([fetchRanges(), code ? fetchTrend(code) : Promise.resolve([]), rangesWithSupport(), rangesWithExpenses(), rangesWithSales()])
      .then(([r, t, sup, exp, sal]) => {
        setRanges(r);
        setTrend(t);
        setSupportRanges(sup);
        setExpenseRanges(exp);
        setSalesRanges(sal);
        if (r.length === 0) setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [code]);

  useEffect(() => {
    if (!methodAvailable && method !== 'gross_sales') setMethod('gross_sales');
  }, [methodAvailable, method]);

  useEffect(() => {
    if (view === 'expenses' && !expensesAvailable) setView('pnl');
    if (view === 'sales' && !salesAvailable) setView('pnl');
  }, [expensesAvailable, salesAvailable, view]);

  useEffect(() => {
    if (!currentId || !code || !cmp) return;
    setLoading(true);
    let load: Promise<unknown>;
    if (view === 'expenses') {
      load = fetchBuExpenses(currentId, cmp.priorId, code).then(setExpenses);
    } else if (view === 'sales') {
      load = fetchBuSales(currentId, cmp.priorId, code).then(setSalesRows);
    } else {
      load = fetchBuComparison(currentId, cmp.priorId, code, method).then(setLines);
    }
    load.catch((e) => setError((e as Error).message)).finally(() => setLoading(false));
  }, [currentId, cmp, code, method, view]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [isFull, setIsFull] = useState(false);
  useEffect(() => {
    const onFs = () => setIsFull(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen();
    else containerRef.current?.requestFullscreen?.();
  }

  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div
      ref={containerRef}
      className={`space-y-4 ${isFull ? 'h-full overflow-auto bg-slate-50 p-6 dark:bg-slate-900' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          {!isFull && <Link to="/" className="text-sm text-slate-400 dark:text-slate-500">← All business units</Link>}
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{buName}</h1>
        </div>
        <button onClick={toggleFull}
          className="shrink-0 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
          {isFull ? '✕ Exit full screen' : '⛶ Full screen'}
        </button>
      </div>

      <ComparisonControl ranges={ranges} onChange={setCmp} />

      {(expensesAvailable || salesAvailable) && (
        <div className="flex gap-1 rounded-xl bg-slate-100 dark:bg-slate-700 p-1">
          {(['pnl', 'expenses', 'sales'] as View[]).map((v) => {
            if (v === 'expenses' && !expensesAvailable) return null;
            if (v === 'sales' && !salesAvailable) return null;
            const label = v === 'pnl' ? 'P&L' : v === 'expenses' ? 'Expenses' : 'Sales Qty';
            return (
              <button key={v} onClick={() => setView(v)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium ${view === v ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
                {label}
              </button>
            );
          })}
        </div>
      )}

      {view === 'pnl' && <AllocMethodToggle method={method} available={methodAvailable} onChange={setMethod} />}

      {loading ? (
        <p className="text-slate-400 dark:text-slate-500">Loading…</p>
      ) : view === 'expenses' ? (
        <ExpenseTable sections={expenses} priorLabel={priorLabel} currentLabel={currentLabel} />
      ) : view === 'sales' ? (
        <SalesTable rows={salesRows} priorLabel={priorLabel} currentLabel={currentLabel} />
      ) : lines.length === 0 ? (
        <p className="text-slate-400 dark:text-slate-500">No data for this business unit yet.</p>
      ) : (
        <>
          <PnlTable lines={lines} priorLabel={priorLabel} currentLabel={currentLabel} />
          <TrendChart data={trend} />
        </>
      )}
    </div>
  );
}
