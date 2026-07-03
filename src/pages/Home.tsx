import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ComparisonControl, { type ComparisonState } from '../components/ComparisonControl';
import BuCard from '../components/BuCard';
import AllocMethodToggle from '../components/AllocMethodToggle';
import { fetchBuCards, fetchRanges, rangesWithSupport, type BuCardData, type RangeRow, type AllocMethod } from '../lib/queries';

export default function Home() {
  const [ranges, setRanges] = useState<RangeRow[]>([]);
  const [cmp, setCmp] = useState<ComparisonState | null>(null);
  const [cards, setCards] = useState<BuCardData[]>([]);
  const [method, setMethod] = useState<AllocMethod>('gross_sales');
  const [supportRanges, setSupportRanges] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
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
  }, []);

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
  }, [cmp?.currentId, cmp?.priorId, method]);

  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-slate-900">Business Units</h1>
          {ranges.length > 0 && (
            <Link to="/present" className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white">
              ▶ Present
            </Link>
          )}
        </div>
        <ComparisonControl ranges={ranges} onChange={setCmp} />
      </div>
      <AllocMethodToggle method={method} available={methodAvailable} onChange={setMethod} />

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : ranges.length === 0 ? (
        <p className="text-slate-400">No published reports yet.</p>
      ) : cards.length === 0 ? (
        <p className="text-slate-400">No data for this comparison.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {cards.map((bu) => (
            <BuCard key={bu.buCode} bu={bu} priorLabel={cmp?.priorLabel} />
          ))}
        </div>
      )}
    </div>
  );
}
