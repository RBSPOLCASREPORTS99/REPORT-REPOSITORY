import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PnlTable from '../components/PnlTable';
// Charting (recharts) is heavy and only used here — load it on demand.
const TrendChart = lazy(() => import('../components/TrendChart'));
import ComparisonControl, { type ComparisonState } from '../components/ComparisonControl';
import SetMonthSelect from '../components/SetMonthSelect';
import AllocMethodToggle from '../components/AllocMethodToggle';
import ExpenseTable from '../components/ExpenseTable';
import SalesTable from '../components/SalesTable';
import { TableSkeleton } from '../components/Skeleton';
import { useBuLabels } from '../contexts/BuLabelsContext';
import {
  fetchBuComparison, fetchComparisonCombined, fetchTrend, fetchRanges, rangesWithSupport,
  fetchBuExpenses, fetchExpensesCombined, rangesWithExpenses, fetchBuSales, fetchSalesCombined, rangesWithSales,
  saveExpenseSection,
  type ComparisonLine, type TrendPoint, type RangeRow, type AllocMethod, type ExpenseSection,
  type SalesItemRow,
} from '../lib/queries';
import { COMBINE_SEP } from '../contexts/CombineContext';
import { useAuth } from '../contexts/AuthContext';
import ParametersTable from '../components/ParametersTable';
import { fetchBuParameters, fetchParamMonthsMissing, type ParamRow } from '../lib/params/paramQueries';
import { hasParameters } from '../lib/params/paramConfig';

type View = 'pnl' | 'expenses' | 'sales' | 'parameters';

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
  const [paramRows, setParamRows] = useState<ParamRow[]>([]);
  const [paramMissing, setParamMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState('');

  const { labelFor } = useBuLabels();
  const { profile } = useAuth();
  const reqRef = useRef(0); // guards against out-of-order responses
  // A combined box arrives as "BU01+BU05"; split into member codes.
  const codes = code ? code.split(COMBINE_SEP) : [];
  const isCombined = codes.length > 1;
  const buName = isCombined ? codes.map(labelFor).join(' + ') : code ? labelFor(code) : '';
  const currentId = cmp?.currentId;
  const priorLabel = cmp?.priorLabel ?? 'Prior';
  const currentLabel = cmp?.currentLabel ?? 'Current';

  const methodAvailable = !!currentId && supportRanges.has(currentId);
  const expensesAvailable = !!currentId && expenseRanges.has(currentId);
  const salesAvailable = !!currentId && salesRanges.has(currentId);
  const paramsAvailable = !isCombined && hasParameters(code);

  useEffect(() => {
    Promise.all([fetchRanges(), code && !isCombined ? fetchTrend(code) : Promise.resolve([]), rangesWithSupport(), rangesWithExpenses(), rangesWithSales()])
      .then(([r, t, sup, exp, sal]) => {
        setRanges(r);
        setTrend(t);
        setSupportRanges(sup);
        setExpenseRanges(exp);
        setSalesRanges(sal);
        if (r.length === 0) setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [code, tick]);

  useEffect(() => {
    if (!methodAvailable && method !== 'gross_sales') setMethod('gross_sales');
  }, [methodAvailable, method]);

  useEffect(() => {
    if (view === 'expenses' && !expensesAvailable) setView('pnl');
    if (view === 'sales' && !salesAvailable) setView('pnl');
    if (view === 'parameters' && !paramsAvailable) setView('pnl');
  }, [expensesAvailable, salesAvailable, paramsAvailable, view]);

  useEffect(() => {
    if (!currentId || !code || !cmp) return;
    const myReq = ++reqRef.current;
    setLoading(true);
    let load: Promise<unknown>;
    if (view === 'expenses') {
      load = (isCombined ? fetchExpensesCombined(currentId, cmp.priorId, codes) : fetchBuExpenses(currentId, cmp.priorId, code))
        .then((d) => { if (myReq === reqRef.current) setExpenses(d); });
    } else if (view === 'sales') {
      load = (isCombined ? fetchSalesCombined(currentId, cmp.priorId, codes) : fetchBuSales(currentId, cmp.priorId, code))
        .then((d) => { if (myReq === reqRef.current) setSalesRows(d); });
    } else if (view === 'parameters') {
      load = Promise.all([
        fetchBuParameters(code, currentId, cmp.priorId),
        fetchParamMonthsMissing(code, currentId),
      ]).then(([d, missing]) => { if (myReq === reqRef.current) { setParamRows(d ?? []); setParamMissing(missing); } });
    } else {
      load = (isCombined ? fetchComparisonCombined(currentId, cmp.priorId, codes, method) : fetchBuComparison(currentId, cmp.priorId, code, method))
        .then((d) => { if (myReq === reqRef.current) setLines(d); });
    }
    load
      .catch((e) => { if (myReq === reqRef.current) setError((e as Error).message); })
      .finally(() => { if (myReq === reqRef.current) setLoading(false); });
  }, [currentId, cmp, code, method, view, tick]);

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
      className={`space-y-3 ${isFull ? 'h-full overflow-auto bg-slate-50 p-6 dark:bg-slate-900' : ''}`}
    >
      {!isFull && <Link to="/" className="text-sm text-slate-400 dark:text-slate-500">← All business units</Link>}

      {/* Frozen header: BU name (left), set month (centred), refresh/full-screen
          (right), plus the comparison / view / support controls. The whole block
          stays visible while the page scrolls (offset below the mobile top bar
          on small screens) so the BU name is always in view. The table's own
          Line-item header freeze is separate. */}
      <div className="sticky top-14 z-30 -mx-4 space-y-2 border-b border-slate-200 bg-slate-50 px-4 py-2 lg:top-0 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 shrink truncate text-lg font-semibold text-slate-900 dark:text-slate-100">{buName}</h1>
          <div className="flex flex-1 justify-center">
            <SetMonthSelect ranges={ranges} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => setTick((t) => t + 1)} title="Reload data"
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
              ↻ Refresh
            </button>
            <button onClick={toggleFull}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
              {isFull ? '✕ Exit full screen' : '⛶ Full screen'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ComparisonControl ranges={ranges} onChange={setCmp} showSetMonth={false} />
          {(expensesAvailable || salesAvailable || paramsAvailable) && (
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-700/60 sm:ml-[9%]">
              {(['pnl', 'expenses', 'sales', 'parameters'] as View[]).map((v) => {
                if (v === 'expenses' && !expensesAvailable) return null;
                if (v === 'sales' && !salesAvailable) return null;
                if (v === 'parameters' && !paramsAvailable) return null;
                const label = v === 'pnl' ? 'P&L' : v === 'expenses' ? 'Expenses' : v === 'sales' ? 'Sales Qty' : 'Parameters';
                return (
                  <button key={v} onClick={() => setView(v)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${view === v ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          {view === 'pnl' && (
            <div className="ml-auto">
              <AllocMethodToggle method={method} available={methodAvailable} onChange={setMethod} />
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : view === 'expenses' ? (
        <ExpenseTable sections={expenses} priorLabel={priorLabel} currentLabel={currentLabel}
          canEdit={profile?.role === 'finance'}
          onReclassify={async (account, section) => {
            try {
              await saveExpenseSection(account, section);
              // Refetch quietly (no loading skeleton) so the table stays mounted
              // and the collapse state is preserved.
              if (currentId && cmp) {
                const d = isCombined
                  ? await fetchExpensesCombined(currentId, cmp.priorId, codes)
                  : await fetchBuExpenses(currentId, cmp.priorId, code!);
                setExpenses(d);
              }
            } catch (e) { setError((e as Error).message); }
          }} />
      ) : view === 'sales' ? (
        <SalesTable rows={salesRows} priorLabel={priorLabel} currentLabel={currentLabel} buCode={code} />
      ) : view === 'parameters' ? (
        <div className="space-y-3">
          {paramMissing.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              ⚠️ This {currentLabel} total is missing parameters for {paramMissing.length === 1 ? '' : 'these months: '}
              <span className="font-semibold">{paramMissing.join(', ')}</span>. Add {paramMissing.length === 1 ? 'that month' : 'those months'} in
              Business Parameters — entry to complete the figures.
            </div>
          )}
          <ParametersTable rows={paramRows} priorLabel={priorLabel} currentLabel={currentLabel} />
        </div>
      ) : lines.length === 0 ? (
        <p className="text-slate-400 dark:text-slate-500">No data for this business unit yet.</p>
      ) : (
        <>
          <PnlTable lines={lines} priorLabel={priorLabel} currentLabel={currentLabel} />
          {!isCombined && (
            <Suspense fallback={<div className="h-48 rounded-2xl bg-white shadow-sm dark:bg-slate-800" />}>
              <TrendChart data={trend} buName={buName} />
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}
