import { useCallback, useEffect, useRef, useState } from 'react';
import ComparisonControl, { type ComparisonState } from '../components/ComparisonControl';
import SetMonthSelect from '../components/SetMonthSelect';
import BuCard from '../components/BuCard';
import TruckingCard from '../components/TruckingCard';
import { BuCardsSkeleton } from '../components/Skeleton';
import AllocMethodToggle from '../components/AllocMethodToggle';
import { useBuLabels } from '../contexts/BuLabelsContext';
import { fetchBuCards, fetchRanges, rangesWithSupport, fetchTruckPnl, type BuCardData, type RangeRow, type AllocMethod, type TruckPnlResult } from '../lib/queries';

export default function Home() {
  const { refresh: refreshLabels } = useBuLabels();
  const [ranges, setRanges] = useState<RangeRow[]>([]);
  const [cmp, setCmp] = useState<ComparisonState | null>(null);
  const [cards, setCards] = useState<BuCardData[]>([]);
  const [truck, setTruck] = useState<TruckPnlResult | null>(null);
  const [method, setMethod] = useState<AllocMethod>('gross_sales');
  const [supportRanges, setSupportRanges] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0); // bump to re-fetch
  const [error, setError] = useState('');

  const currentId = cmp?.currentId;
  const methodAvailable = !!currentId && supportRanges.has(currentId);
  const reqRef = useRef(0); // guards against out-of-order responses

  useEffect(() => {
    Promise.all([fetchRanges(), rangesWithSupport()])
      .then(([r, sup]) => {
        setRanges(r);
        setSupportRanges(sup);
        if (r.length === 0) setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [tick]);

  useEffect(() => {
    if (!methodAvailable && method !== 'gross_sales') setMethod('gross_sales');
  }, [methodAvailable, method]);

  useEffect(() => {
    const cur = cmp?.currentId;
    if (!cur) { setCards([]); return; }
    const prior = cmp?.priorId;
    const myReq = ++reqRef.current;
    setLoading(true);

    // Fetch, with one automatic retry if an unexpected empty result comes back
    // (covers a transient race just after import / range publish).
    const run = (attempt: number): Promise<void> =>
      fetchBuCards(cur, prior, method).then((data) => {
        if (myReq !== reqRef.current) return; // superseded by a newer request
        if (data.length === 0 && attempt === 0) {
          return new Promise<void>((res) => setTimeout(() => res(run(1)), 500));
        }
        setCards(data);
      });

    run(0)
      .catch((e) => { if (myReq === reqRef.current) setError(e.message); })
      .finally(() => { if (myReq === reqRef.current) setLoading(false); });
  }, [cmp?.currentId, cmp?.priorId, method, tick]);

  // BU10 - TRUCKING card: per-truck P&L (finance-only data). Follows the chosen
  // set month; hidden when there's no truck data (or the viewer can't read it).
  useEffect(() => {
    const setRange = ranges.find((r) => r.id === cmp?.setMonthId);
    if (!setRange) { setTruck(null); return; }
    const target = { year: Number(setRange.period_start.slice(0, 4)), month: Number(setRange.period_start.slice(5, 7)) };
    let cancelled = false;
    fetchTruckPnl(target)
      .then((t) => { if (!cancelled) setTruck(t.hasData ? t : null); })
      .catch(() => { if (!cancelled) setTruck(null); });
    return () => { cancelled = true; };
  }, [cmp?.setMonthId, ranges, tick]);

  const refresh = useCallback(() => {
    setError('');
    refreshLabels();
    setTick((t) => t + 1);
  }, [refreshLabels]);

  if (error) return (
    <div className="space-y-3">
      <p className="text-red-600">{error}</p>
      <button onClick={refresh} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">↻ Try again</button>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="min-w-0 shrink truncate text-lg font-semibold text-slate-900 dark:text-slate-100">Business Units</h1>
        <div className="flex flex-1 justify-center">
          <SetMonthSelect ranges={ranges} />
        </div>
        <button onClick={refresh} title="Reload data"
          className="shrink-0 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
          ↻ Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ComparisonControl ranges={ranges} onChange={setCmp} showSetMonth={false} />
        {methodAvailable && (
          <div className="ml-auto">
            <AllocMethodToggle method={method} available={methodAvailable} onChange={setMethod} />
          </div>
        )}
      </div>

      {loading ? (
        <BuCardsSkeleton />
      ) : ranges.length === 0 ? (
        <p className="text-center text-slate-400 dark:text-slate-500">No published reports yet.</p>
      ) : cards.length === 0 && !truck?.hasData ? (
        <p className="text-center text-slate-400 dark:text-slate-500">No data for this comparison. Try ↻ Refresh.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {cards.map((bu, i) => (
            <BuCard key={bu.buCode} bu={bu} priorLabel={cmp?.priorLabel} index={i} />
          ))}
          {truck?.hasData && <TruckingCard truck={truck} index={cards.length} />}
        </div>
      )}
    </div>
  );
}
