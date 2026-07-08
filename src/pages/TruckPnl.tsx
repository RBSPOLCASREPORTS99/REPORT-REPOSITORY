import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchTruckPnl, fetchRanges, type TruckPnlResult } from '../lib/queries';
import { useUi } from '../contexts/UiContext';
import { formatMoney, formatPercent } from '../lib/format';
import { TableSkeleton } from '../components/Skeleton';

// Simulated P&L per Truck (BU10). Income from the TRUCKING DASHBOARD, expenses
// by account from the QuickBooks per-truck columns. Pick one truck (or Total)
// and see its full line-item P&L, current vs prior month. Follows the shared set
// month chosen on Home.
export default function TruckPnl() {
  const { units, compSetMonthId } = useUi();
  const [data, setData] = useState<TruckPnlResult | null>(null);
  const [selected, setSelected] = useState('TOTAL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const ranges = await fetchRanges();
      const r = ranges.find((x) => x.id === compSetMonthId);
      const target = r ? { year: Number(r.period_start.slice(0, 4)), month: Number(r.period_start.slice(5, 7)) } : undefined;
      const t = await fetchTruckPnl(target);
      if (!cancelled) setData(t);
    })().catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [compSetMonthId]);

  const money = (v: number) => formatMoney(v, 'thousands', units);
  const chgCls = (v: number, cost?: boolean) => ((cost ? v <= 0 : v >= 0) ? 'text-green-600' : 'text-red-600');
  const numCls = (v: number) => (v < 0 ? 'text-red-600' : 'text-slate-900 dark:text-slate-100');

  const lines = data ? (data.pnl[selected] ?? data.pnl.TOTAL) : undefined;
  const th = 'sticky top-0 z-10 bg-slate-100 px-3 py-2 text-right dark:bg-slate-900/80';

  return (
    <div className="space-y-4">
      <Link to="/" className="inline-block text-sm text-slate-500 dark:text-slate-400">← Back to Home</Link>
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Simulated P&amp;L per Truck</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          BU10 - Trucking. Income from the TRUCKING DASHBOARD; expenses by account from the QuickBooks
          per-truck columns. Figures in ₱'000.
          {data?.hasData && <> <span className="font-medium">{data.currentLabel}</span> vs <span className="font-medium">{data.priorLabel}</span>.</>}
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40">{error}</p>}

      {data?.expensesMissing && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          ⚠️ This month has truck income but no per-truck expenses yet. Re-import this month's
          QuickBooks P&amp;L (in Import data) to load per-truck expenses by account.
        </p>
      )}

      {loading ? (
        <TableSkeleton />
      ) : !data?.hasData ? (
        <p className="rounded-2xl bg-white p-6 text-center text-slate-400 shadow-sm dark:bg-slate-800 dark:text-slate-500">
          No per-truck data yet. Import the TRUCKING DASHBOARD and that month's QuickBooks P&amp;L.
        </p>
      ) : (
        <>
          {/* Truck selector — one truck at a time, Total last. */}
          <div className="flex flex-wrap gap-1.5">
            {[...data.trucks, 'TOTAL'].map((code) => (
              <button
                key={code}
                onClick={() => setSelected(code)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  selected === code
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                }`}
              >
                {code === 'TOTAL' ? 'Total' : code}
              </button>
            ))}
          </div>

          <div className="max-h-[70vh] overflow-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-0">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-500">
                  <th className="sticky left-0 top-0 z-20 bg-slate-100 px-4 py-2 text-left dark:bg-slate-900/80">
                    {selected === 'TOTAL' ? 'All trucks' : selected}
                  </th>
                  <th className={th}>{data.currentLabel}</th>
                  <th className={th}>{data.priorLabel}</th>
                  <th className={th}>%Chg</th>
                </tr>
              </thead>
              <tbody>
                {lines!.map((line, i) => {
                  const bold = line.kind !== 'account';
                  const rowCls = bold ? 'bg-slate-100/80 font-semibold dark:bg-slate-700/50' : '';
                  const stickyCls = bold
                    ? 'bg-slate-100 font-semibold text-slate-900 dark:bg-slate-700 dark:text-slate-100'
                    : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300';
                  return (
                    <tr key={`${line.label}-${i}`} className={`border-b border-slate-200 dark:border-slate-700/60 ${rowCls}`}>
                      <td className={`sticky left-0 px-4 py-2.5 text-left ${line.kind === 'account' ? 'pl-6' : ''} ${stickyCls}`}>{line.label}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${bold ? '' : ''} ${numCls(line.current)}`}>{money(line.current)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400">{money(line.prior)}</td>
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
