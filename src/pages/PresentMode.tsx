import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ComparisonControl, { type ComparisonState } from '../components/ComparisonControl';
import { formatPercent, formatMoney } from '../lib/format';
import { useUi } from '../contexts/UiContext';
import { useBuLabels } from '../contexts/BuLabelsContext';
import {
  fetchRanges, fetchBuCards, fetchBuComparison,
  type RangeRow, type BuCardData, type ComparisonLine,
} from '../lib/queries';

const HEADLINE_KEYS = ['gross_sales', 'gross_income', 'net_income'] as const;
const HEADLINE_LABELS: Record<string, string> = {
  gross_sales: 'Gross Sales',
  gross_income: 'Gross Income',
  net_income: 'Net Income',
};

// Full-screen, large-font meeting view: one BU per screen, swipe / arrow to move.
export default function PresentMode() {
  const { units } = useUi();
  const { labelFor } = useBuLabels();
  const money = (v: number, peso = false) => formatMoney(v, 'thousands', units, peso);
  const [ranges, setRanges] = useState<RangeRow[]>([]);
  const [cmp, setCmp] = useState<ComparisonState | null>(null);
  const [cards, setCards] = useState<BuCardData[]>([]);
  const [index, setIndex] = useState(0);
  const [lines, setLines] = useState<ComparisonLine[]>([]);
  const [error, setError] = useState('');

  const currentId = cmp?.currentId;
  const priorId = cmp?.priorId;
  const priorLabel = cmp?.priorLabel ?? '';
  const active = cards[index];

  useEffect(() => {
    fetchRanges().then(setRanges).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!currentId) { setCards([]); return; }
    fetchBuCards(currentId, priorId).then((c) => { setCards(c); setIndex(0); }).catch((e) => setError(e.message));
  }, [currentId, priorId]);

  const activeCode = active?.buCode;
  useEffect(() => {
    if (!currentId || !activeCode) return;
    let cancelled = false;
    setLines([]);
    fetchBuComparison(currentId, priorId, activeCode)
      .then((l) => { if (!cancelled) setLines(l); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [currentId, priorId, activeCode]);

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIndex((i) => Math.min(cards.length - 1, i + 1)), [cards.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next]);

  // Touch swipe
  const touchX = useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) { touchX.current = e.touches[0].clientX; }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (dx > 60) prev();
    else if (dx < -60) next();
    touchX.current = null;
  }

  const headline = (key: string) => lines.find((l) => l.key === key);

  if (error) return <p className="p-6 text-red-600">{error}</p>;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-brand-900 text-white" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="flex items-start justify-between px-5 py-3">
        <Link to="/" className="mt-2 text-sm text-slate-400 dark:text-slate-500">✕ Exit</Link>
        <div className="[&_span]:text-slate-300">
          <ComparisonControl ranges={ranges} onChange={setCmp} />
        </div>
      </div>

      {!active ? (
        <div className="flex flex-1 items-center justify-center text-slate-400 dark:text-slate-500">No data to present.</div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-sm uppercase tracking-widest text-slate-400 dark:text-slate-500">
            {index + 1} / {cards.length}
          </p>
          <h1 className="mt-2 text-4xl font-bold uppercase sm:text-5xl">{labelFor(active.buCode)}</h1>

          <div className="mt-10 grid w-full max-w-2xl gap-4">
            {HEADLINE_KEYS.map((key) => {
              const line = headline(key);
              if (!line) return null;
              const up = line.diff >= 0;
              const isNet = key === 'net_income';
              return (
                <div key={key} className={`rounded-2xl px-6 py-5 ${isNet ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100' : 'bg-slate-800'}`}>
                  <div className="flex items-baseline justify-between">
                    <span className={`text-sm font-semibold uppercase tracking-wide ${isNet ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400 dark:text-slate-500'}`}>{HEADLINE_LABELS[key]}</span>
                    <span className={`text-3xl font-bold tabular-nums sm:text-4xl ${line.current < 0 ? 'text-red-500' : ''}`}>
                      {money(line.current, isNet)}
                    </span>
                  </div>
                  {priorLabel && (
                    <div className={`mt-1 text-right text-sm font-medium ${up ? 'text-green-500' : 'text-red-500'}`}>
                      {up ? '▲' : '▼'} {money(Math.abs(line.diff), isNet)} · {formatPercent(line.pctDiff)} vs {priorLabel}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={prev} disabled={index === 0}
          className="rounded-full bg-slate-800 px-6 py-3 text-lg font-medium disabled:opacity-30">←</button>
        <div className="flex gap-1.5">
          {cards.map((_, i) => (
            <span key={i} className={`h-2 w-2 rounded-full ${i === index ? 'bg-white dark:bg-slate-800' : 'bg-slate-600'}`} />
          ))}
        </div>
        <button onClick={next} disabled={index >= cards.length - 1}
          className="rounded-full bg-slate-800 px-6 py-3 text-lg font-medium disabled:opacity-30">→</button>
      </div>
    </div>
  );
}
