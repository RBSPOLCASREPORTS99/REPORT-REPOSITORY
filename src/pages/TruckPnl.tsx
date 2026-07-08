import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchTruckPnl, fetchRanges, type TruckPnlResult } from '../lib/queries';
import { useUi } from '../contexts/UiContext';
import { formatMoney, formatPercent } from '../lib/format';

// Simulated P&L per Truck (BU10). Trucking Income from the TRUCKING DASHBOARD,
// expenses from the QuickBooks per-truck columns. Follows the shared set month
// (the same one chosen on Home); falls back to the latest month with data.
export default function TruckPnl() {
  const { units, compSetMonthId } = useUi();
  const [data, setData] = useState<TruckPnlResult | null>(null);
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
  // %Chg colour: for expense lines an increase is unfavourable (red); for
  // income / profit lines an increase is favourable (green).
  const chgCls = (v: number, cost?: boolean) => ((cost ? v <= 0 : v >= 0) ? 'text-green-600' : 'text-red-600');
  const th = 'sticky top-0 z-10 bg-slate-100 px-3 py-2 text-right dark:bg-slate-900/80';

  return (
    <div className="space-y-4">
      <Link to="/" className="inline-block text-sm text-slate-500 dark:text-slate-400">← Back to Home</Link>
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Simulated P&amp;L per Truck</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          BU10 - Trucking. Income from the TRUCKING DASHBOARD (Sales per Truck); expenses from the
          QuickBooks per-truck columns of the monthly P&amp;L. Figures in ₱'000.
          {data?.hasData && <> Showing <span className="font-medium">{data.currentLabel}</span>, %Chg vs <span className="font-medium">{data.priorLabel}</span>.</>}
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40">{error}</p>}

      {loading ? (
        <p className="text-slate-400 dark:text-slate-500">Loading…</p>
      ) : !data?.hasData ? (
        <p className="rounded-2xl bg-white p-6 text-center text-slate-400 shadow-sm dark:bg-slate-800 dark:text-slate-500">
          No per-truck data yet. Import the TRUCKING DASHBOARD and that month's QuickBooks P&amp;L.
        </p>
      ) : (
        <div className="max-h-[72vh] overflow-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-0">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-500">
                <th className="sticky left-0 top-0 z-20 bg-slate-100 px-4 py-2 text-left dark:bg-slate-900/80">Line item</th>
                {data.truckCodes.map((c) => <th key={c} className={th}>{c}</th>)}
                <th className={`${th} font-bold`}>Total</th>
                <th className={th}>%Chg</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line) => {
                const rowCls = line.bold ? 'bg-slate-100/80 font-semibold dark:bg-slate-700/50' : '';
                const stickyCls = line.bold ? 'bg-slate-100 font-semibold text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300';
                const numCls = (v: number) => (v < 0 ? 'text-red-600' : 'text-slate-900 dark:text-slate-100');
                return (
                  <tr key={line.key} className={`border-b border-slate-200 dark:border-slate-700/60 ${rowCls}`}>
                    <td className={`sticky left-0 px-4 py-2.5 text-left ${stickyCls}`}>{line.label}</td>
                    {data.truckCodes.map((c) => (
                      <td key={c} className={`px-3 py-2.5 text-right tabular-nums ${numCls(line.byTruck[c] ?? 0)}`}>{money(line.byTruck[c] ?? 0)}</td>
                    ))}
                    <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${numCls(line.total)}`}>{money(line.total)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${chgCls(line.chg, line.cost)}`}>{formatPercent(line.chg)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
