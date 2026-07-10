import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ComparisonControl, { type ComparisonState } from '../components/ComparisonControl';
import SetMonthSelect from '../components/SetMonthSelect';
import { TableSkeleton } from '../components/Skeleton';
import { fetchRanges, fetchTruckPnl, type RangeRow, type TruckPnlResult, type TruckPeriod } from '../lib/queries';
import { useUi } from '../contexts/UiContext';
import { formatMoney, formatPercent } from '../lib/format';

// Simulated P&L per Truck (BU10). Income from the TRUCKING DASHBOARD, expenses
// by account from the QuickBooks per-truck columns. Same YTD / QTR / Month
// comparisons as the BUs; pick one truck (or Total).
export default function TruckPnl() {
  const { units } = useUi();
  const [ranges, setRanges] = useState<RangeRow[]>([]);
  const [cmp, setCmp] = useState<ComparisonState | null>(null);
  const [data, setData] = useState<TruckPnlResult | null>(null);
  const [selected, setSelected] = useState('TOTAL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reqRef = useRef(0);

  useEffect(() => {
    fetchRanges().then(setRanges).catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const periodOf = (id?: string): TruckPeriod | undefined => {
    const r = ranges.find((x) => x.id === id);
    return r ? { start: r.period_start, end: r.period_end } : undefined;
  };

  useEffect(() => {
    if (!cmp) return;
    const cur = periodOf(cmp.currentId);
    if (!cur) { setData(null); setLoading(false); return; }
    const myReq = ++reqRef.current;
    setLoading(true);
    fetchTruckPnl(cur, periodOf(cmp.priorId))
      .then((res) => { if (myReq === reqRef.current) setData(res); })
      .catch((e) => { if (myReq === reqRef.current) setError((e as Error).message); })
      .finally(() => { if (myReq === reqRef.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmp, ranges]);

  const money = (v: number) => formatMoney(v, 'thousands', units);
  const chgCls = (v: number, cost?: boolean) => ((cost ? v <= 0 : v >= 0) ? 'text-green-600' : 'text-red-600');
  const numCls = (v: number) => (v < 0 ? 'text-red-600' : 'text-slate-900 dark:text-slate-100');
  const priorLabel = cmp?.priorLabel ?? 'Prior';
  const currentLabel = cmp?.currentLabel ?? 'Current';
  const lines = data ? (data.pnl[selected] ?? data.pnl.TOTAL) : undefined;
  const incC = lines?.find((l) => l.kind === 'income')?.current || 0;
  const incP = lines?.find((l) => l.kind === 'income')?.prior || 0;
  const th = 'sticky top-0 z-10 bg-slate-100 px-3 py-2 text-right dark:bg-slate-900/80';

  return (
    <div className="space-y-3">
      <Link to="/" className="text-sm text-slate-400 dark:text-slate-500">← Back to Home</Link>

      <div className="sticky top-14 z-30 -mx-4 space-y-2 border-b border-slate-200 bg-slate-50 px-4 py-2 lg:top-0 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 shrink truncate text-lg font-semibold text-slate-900 dark:text-slate-100">Simulated P&amp;L per Truck</h1>
          <SetMonthSelect ranges={ranges} />
        </div>
        <ComparisonControl ranges={ranges} onChange={setCmp} showSetMonth={false} />
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40">{error}</p>}
      {data?.expensesMissing && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          ⚠️ This period has truck income but no per-truck expenses. Re-import the affected month's QuickBooks P&amp;L.
        </p>
      )}

      {loading ? (
        <TableSkeleton />
      ) : !data?.hasData ? (
        <p className="rounded-2xl bg-white p-6 text-center text-slate-400 shadow-sm dark:bg-slate-800 dark:text-slate-500">
          No per-truck data for this period. Import the TRUCKING DASHBOARD and the month's QuickBooks P&amp;L.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {[...data.trucks, 'TOTAL'].map((code) => (
              <button key={code} onClick={() => setSelected(code)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  selected === code ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                }`}>
                {code === 'TOTAL' ? 'Total' : code}
              </button>
            ))}
          </div>

          <div className="max-h-[68vh] overflow-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-0">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-500">
                  <th className="sticky left-0 top-0 z-20 bg-slate-100 px-4 py-2 text-left dark:bg-slate-900/80">{selected === 'TOTAL' ? 'All trucks' : selected}</th>
                  <th className={th}>{priorLabel}</th>
                  <th className={`${th} px-2`}>%</th>
                  <th className={th}>{currentLabel}</th>
                  <th className={`${th} px-2`}>%</th>
                  <th className={th}>DIFF</th>
                  <th className={th}>%DIFF</th>
                </tr>
              </thead>
              <tbody>
                {lines!.map((line, i) => {
                  const bold = line.kind !== 'account';
                  const rowCls = bold ? 'bg-slate-100/80 font-semibold dark:bg-slate-700/50' : '';
                  const stickyCls = bold ? 'bg-slate-100 font-semibold text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300';
                  const diff = line.current - line.prior;
                  const favorable = line.cost ? diff < 0 : diff >= 0;
                  return (
                    <tr key={`${line.label}-${i}`} className={`border-b border-slate-200 dark:border-slate-700/60 ${rowCls}`}>
                      <td className={`sticky left-0 px-4 py-2.5 text-left ${line.kind === 'account' ? 'pl-6' : ''} ${stickyCls}`}>{line.label}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${numCls(line.prior)}`}>{money(line.prior)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-slate-400 dark:text-slate-500">{formatPercent(incP ? line.prior / incP : 0)}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${numCls(line.current)}`}>{money(line.current)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-slate-400 dark:text-slate-500">{formatPercent(incC ? line.current / incC : 0)}</td>
                      <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${favorable ? 'text-green-600' : 'text-red-600'}`}>{diff >= 0 ? '▲' : '▼'} {money(Math.abs(diff))}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${chgCls(line.chg, line.cost)}`}>{formatPercent(line.chg)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
