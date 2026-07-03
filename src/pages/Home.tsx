import { useCallback, useEffect, useState } from 'react';
import ComparisonControl, { type ComparisonState } from '../components/ComparisonControl';
import BuCard from '../components/BuCard';
import AllocMethodToggle from '../components/AllocMethodToggle';
import { useBuLabels } from '../contexts/BuLabelsContext';
import { fetchBuCards, fetchRanges, rangesWithSupport, type BuCardData, type RangeRow, type AllocMethod } from '../lib/queries';

export default function Home() {
  const { refresh: refreshLabels } = useBuLabels();
  const [ranges, setRanges] = useState<RangeRow[]>([]);
  const [cmp, setCmp] = useState<ComparisonState | null>(null);
  const [cards, setCards] = useState<BuCardData[]>([]);
  const [method, setMethod] = useState<AllocMethod>('gross_sales');
  const [supportRanges, setSupportRanges] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0); // bump to re-fetch
  const [error, setError] = useState('');

  const currentId = cmp?.currentId;
  const methodAvailable = !!currentId && supportRanges.has(currentId);

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
    if (!cmp?.currentId) { setCards([]); return; }
    setLoading(true);
    fetchBuCards(cmp.currentId, cmp.priorId, method)
      .then(setCards)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [cmp?.currentId, cmp?.priorId, method, tick]);

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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Business Units</h1>
        <button onClick={refresh} title="Reload data"
          className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
          ↻ Refresh
        </button>
      </div>

      <div className="flex flex-col items-center gap-3">
        <ComparisonControl ranges={ranges} onChange={setCmp} />
        <AllocMethodToggle method={method} available={methodAvailable} onChange={setMethod} />
      </div>

      {loading ? (
        <p className="text-center text-slate-400 dark:text-slate-500">Loading…</p>
      ) : ranges.length === 0 ? (
        <p className="text-center text-slate-400 dark:text-slate-500">No published reports yet.</p>
      ) : cards.length === 0 ? (
        <p className="text-center text-slate-400 dark:text-slate-500">No data for this comparison. Try ↻ Refresh.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {cards.map((bu) => (
            <BuCard key={bu.buCode} bu={bu} priorLabel={cmp?.priorLabel} />
          ))}
        </div>
      )}
    </div>
  );
}
