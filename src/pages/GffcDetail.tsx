import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ComparisonControl, { type ComparisonState } from '../components/ComparisonControl';
import SetMonthSelect from '../components/SetMonthSelect';
import GffcPnlTable from '../components/GffcPnlTable';
import GffcBranchTable from '../components/GffcBranchTable';
import ExpenseTable from '../components/ExpenseTable';
import SalesTable from '../components/SalesTable';
import ParametersTable from '../components/ParametersTable';
import { TableSkeleton } from '../components/Skeleton';
import { fetchRanges, saveExpenseSection, type RangeRow, type ExpenseSection, type SalesItemRow, type TrendPoint } from '../lib/queries';
import { fetchGffcPnl, fetchGffcExpenses, fetchGffcSales, fetchGffcBranchPnl, fetchGffcParameters, fetchGffcTrend, gffcOverrideKey, type GffcPnlLine, type GffcBranchResult, type Period } from '../lib/gffc/gffcQueries';

const TrendChart = lazy(() => import('../components/TrendChart'));
import { useAuth } from '../contexts/AuthContext';
import type { ParamRow } from '../lib/params/paramQueries';
import { GFFC_LABEL } from '../lib/gffc/gffcConfig';

type View = 'pnl' | 'branch' | 'expenses' | 'sales' | 'params';

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
  const [branch, setBranch] = useState<GffcBranchResult>({ hasData: false, branches: [], byBranch: {} });
  const [params, setParams] = useState<ParamRow[]>([]);
  const [simulated, setSimulated] = useState(false);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState('');
  const reqRef = useRef(0);
  const { profile } = useAuth();

  useEffect(() => {
    fetchRanges().then(setRanges).catch((e) => { setError(e.message); setLoading(false); });
    fetchGffcTrend().then(setTrend).catch(() => {});
  }, [tick]);

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
    Promise.all([fetchGffcPnl(cur, pri), fetchGffcExpenses(cur, pri), fetchGffcSales(cur, pri), fetchGffcBranchPnl(cur, pri), fetchGffcParameters(cmp.currentId!, cmp.priorId, cur, pri)])
      .then(([p, e, s, br, pm]) => {
        if (myReq !== reqRef.current) return;
        setLines(p.hasData ? p.lines : []);
        setSimulated(!!p.simulatedPrior && p.hasData);
        setExpenses(e.sections); setExpAvail(e.hasData);
        setSales(s.rows); setSalesAvail(s.hasData);
        setBranch(br);
        setParams(pm);
      })
      .catch((err) => { if (myReq === reqRef.current) setError((err as Error).message); })
      .finally(() => { if (myReq === reqRef.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmp, ranges, tick]);

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

  const branchAvail = branch.hasData;
  const paramsAvail = params.some((r) => r.current != null || r.std != null);
  useEffect(() => {
    if (view === 'expenses' && !expAvail) setView('pnl');
    if (view === 'sales' && !salesAvail) setView('pnl');
    if (view === 'branch' && !branchAvail) setView('pnl');
    if (view === 'params' && !paramsAvail) setView('pnl');
  }, [expAvail, salesAvail, branchAvail, paramsAvail, view]);

  const priorLabel = cmp?.priorLabel ?? 'Prior';
  const currentLabel = cmp?.currentLabel ?? 'Current';

  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div
      ref={containerRef}
      className={`space-y-3 ${isFull ? 'h-full overflow-auto bg-slate-50 p-6 dark:bg-slate-900' : ''}`}
    >
      {!isFull && <Link to="/" className="text-sm text-slate-400 dark:text-slate-500">← All business units</Link>}

      <div className="sticky top-14 z-30 -mx-4 space-y-2 border-b border-slate-200 bg-slate-50 px-4 py-2 lg:top-0 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 shrink truncate text-lg font-semibold text-slate-900 dark:text-slate-100">{GFFC_LABEL}</h1>
          {simulated && view === 'pnl' && (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
              title="Prior YTD simulated from GFFC's actual Aug–Dec 2025 monthly average (÷5) × the YTD month count (GFFC started Aug 2025).">
              Simulated YTD 2025
            </span>
          )}
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
          {(expAvail || salesAvail || branchAvail || paramsAvail) && (
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-700/60">
              {(['pnl', 'branch', 'expenses', 'sales', 'params'] as View[]).map((v) => {
                if (v === 'branch' && !branchAvail) return null;
                if (v === 'expenses' && !expAvail) return null;
                if (v === 'sales' && !salesAvail) return null;
                if (v === 'params' && !paramsAvail) return null;
                const label = v === 'pnl' ? 'P&L' : v === 'branch' ? 'Per Branch' : v === 'expenses' ? 'Expenses' : v === 'sales' ? 'Sales Qty' : 'Parameters';
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
        <ExpenseTable sections={expenses} priorLabel={priorLabel} currentLabel={currentLabel}
          canEdit={profile?.role === 'finance'}
          onReclassify={async (account, section) => {
            try {
              await saveExpenseSection(gffcOverrideKey(account), section);
              const cur = periodOf(cmp?.currentId);
              if (cur) { const e = await fetchGffcExpenses(cur, periodOf(cmp?.priorId)); setExpenses(e.sections); }
            } catch (e) { setError((e as Error).message); }
          }} />
      ) : view === 'sales' ? (
        <SalesTable rows={sales} priorLabel={priorLabel} currentLabel={currentLabel} buCode="GFFC" />
      ) : view === 'branch' ? (
        <GffcBranchTable data={branch} priorLabel={priorLabel} currentLabel={currentLabel} />
      ) : view === 'params' ? (
        <ParametersTable rows={params} priorLabel={priorLabel} currentLabel={currentLabel} />
      ) : lines.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-slate-400 shadow-sm dark:bg-slate-800 dark:text-slate-500">
          No GFFC P&amp;L for this period yet. Import the GFFC workbook (P&amp;L 2025 / P&amp;L 2026).
        </p>
      ) : (
        <>
          <GffcPnlTable lines={lines} priorLabel={priorLabel} currentLabel={currentLabel} />
          <Suspense fallback={<div className="h-48 rounded-2xl bg-white shadow-sm dark:bg-slate-800" />}>
            <TrendChart data={trend} buName={GFFC_LABEL} />
          </Suspense>
        </>
      )}
    </div>
  );
}
