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
  saveExpenseSection, fetchBuBudget, fetchExpenseReconciliation,
  type ComparisonLine, type TrendPoint, type RangeRow, type AllocMethod, type ExpenseSection,
  type SalesItemRow, type ReconResult,
} from '../lib/queries';
import { COMBINE_SEP } from '../contexts/CombineContext';
import { useAuth } from '../contexts/AuthContext';
import ParametersTable from '../components/ParametersTable';
import { fetchBuParameters, fetchParamMonthsMissing, type ParamRow } from '../lib/params/paramQueries';
import { hasParameters, hasStdColumn } from '../lib/params/paramConfig';

type View = 'pnl' | 'expenses' | 'budget' | 'sales' | 'parameters';

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
  const [recon, setRecon] = useState<ReconResult | null>(null);
  const [budget, setBudget] = useState<ExpenseSection[]>([]);
  const [budgetMonths, setBudgetMonths] = useState(0);
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
    if (view === 'budget' && !expensesAvailable) setView('pnl');
    if (view === 'sales' && !salesAvailable) setView('pnl');
    if (view === 'parameters' && !paramsAvailable) setView('pnl');
  }, [expensesAvailable, salesAvailable, paramsAvailable, view]);

  useEffect(() => {
    if (!currentId || !code || !cmp) return;
    const myReq = ++reqRef.current;
    setLoading(true);
    let load: Promise<unknown>;
    if (view === 'expenses') {
      load = Promise.all([
        isCombined ? fetchExpensesCombined(currentId, cmp.priorId, codes) : fetchBuExpenses(currentId, cmp.priorId, code),
        fetchExpenseReconciliation(currentId, isCombined ? codes : [code]),
      ]).then(([d, r]) => { if (myReq === reqRef.current) { setExpenses(d); setRecon(r); } });
    } else if (view === 'budget') {
      load = fetchBuBudget(currentId, isCombined ? codes : [code]).then((d) => {
        if (myReq === reqRef.current) { setBudget(d.sections); setBudgetMonths(d.budgetMonths); }
      });
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
              {(['pnl', 'expenses', 'budget', 'sales', 'parameters'] as View[]).map((v) => {
                if (v === 'expenses' && !expensesAvailable) return null;
                if (v === 'budget' && !expensesAvailable) return null;
                if (v === 'sales' && !salesAvailable) return null;
                if (v === 'parameters' && !paramsAvailable) return null;
                const label = v === 'pnl' ? 'P&L' : v === 'expenses' ? 'Expenses' : v === 'budget' ? 'Exp. vs Budget' : v === 'sales' ? 'Sales Qty' : 'Parameters';
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
        <div className="space-y-3">
          {(() => {
            // Flag when the Expenses "Salaries & Wages" detail doesn't tie to the
            // P&L Salaries line for this period — a sign the month's Expense Data
            // and P&L-by-Class imports are out of sync. Only Salaries is checked:
            // it maps 1:1 between the two files, whereas Operations / Finance carry
            // structural grouping differences that would false-alarm.
            const sal = recon?.rows.find((r) => r.label === 'Salaries & Wages');
            if (!sal || Math.abs(sal.diff) <= Math.max(5000, 0.02 * sal.pnl)) return null;
            const peso = (v: number) => `₱${Math.round(v).toLocaleString('en-PH')}`;
            return (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <p className="font-semibold tabular-nums">⚠ Salaries &amp; Wages don’t tie to the P&amp;L for {currentLabel}: Expenses {peso(sal.expenses)} vs P&amp;L {peso(sal.pnl)} ({sal.diff >= 0 ? '+' : '−'}{peso(Math.abs(sal.diff))}).</p>
                <p className="mt-0.5 text-[13px] text-amber-800 dark:text-amber-300/90">This month’s Expense Data and P&amp;L-by-Class imports look out of sync — re-import both from the same QuickBooks export.</p>
              </div>
            );
          })()}
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
        </div>
      ) : view === 'budget' ? (
        <div className="space-y-3">
          {budgetMonths === 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              ⚠️ Budgets start July 2026. The selected period has no July 2026-onward months, so Budget shows as zero.
            </div>
          )}
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Budget per account = (Jan–May 2026 actual ÷ 5) × 80%, per month from July 2026. Salaries &amp; Wages excluded. DIFF is Actual − Budget (over budget in red).
          </p>
          <ExpenseTable sections={budget} priorLabel="Budget" currentLabel="Actual"
            canEdit={profile?.role === 'finance'}
            onReclassify={async (account, section) => {
              try {
                await saveExpenseSection(account, section);
                if (currentId) {
                  const d = await fetchBuBudget(currentId, isCombined ? codes : [code!]);
                  setBudget(d.sections); setBudgetMonths(d.budgetMonths);
                }
              } catch (e) { setError((e as Error).message); }
            }} />
        </div>
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
          <ParametersTable rows={paramRows} priorLabel={priorLabel} currentLabel={currentLabel} showStd={hasStdColumn(code)} />
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
