import { Link } from 'react-router-dom';
import { formatMoney, formatPercent } from '../lib/format';
import { useUi } from '../contexts/UiContext';
import { COMBINE_SEP } from '../contexts/CombineContext';
import { pickMetric, type BuMetric, type CardMetricInput } from '../lib/queries';
import type { CardDnd } from './BuCard';

export interface CombinedCardData extends CardMetricInput {
  codes: string[];
  labels: string[];
}

// A combined BU box (two or more BUs merged by dragging). Checkbox is checked
// while combined; unchecking it uncombines. Clicking the body opens the combined
// P&L / Expenses / Sales detail. Also a drop target — drop another BU to add it.
export default function CombinedCard({
  data, priorLabel, metric = 'net_income', index = 0, onUncombine, dnd,
}: {
  data: CombinedCardData;
  priorLabel?: string;
  metric?: BuMetric;
  index?: number;
  onUncombine: () => void;
  dnd?: CardDnd;
}) {
  const { units } = useUi();
  const { value, margin, diff, pctDiff } = pickMetric(metric, data);
  const up = diff >= 0;
  const loss = value < 0;
  const money = (v: number, peso = false) => formatMoney(v, 'thousands', units, peso);
  return (
    <div
      draggable={!!dnd}
      onDragStart={dnd ? (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', data.codes[0]); dnd.onDragStart(); } : undefined}
      onDragEnd={dnd?.onDragEnd}
      onDragOver={dnd ? (e) => { e.preventDefault(); dnd.onDragOver(); } : undefined}
      onDragLeave={dnd?.onDragLeave}
      onDrop={dnd ? (e) => { e.preventDefault(); dnd.onDrop(); } : undefined}
      style={{ animationDelay: `${Math.min(index, 15) * 40}ms` }}
      className={`group animate-rise relative overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/80 to-indigo-50/70 p-3.5 shadow-sm ring-1 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:border-violet-800/60 dark:from-violet-950/30 dark:to-indigo-950/30 ${
        dnd?.isOver ? 'ring-2 ring-indigo-500 dark:ring-indigo-400' : 'ring-transparent'
      } ${dnd?.isDragging ? 'opacity-40' : ''}`}
    >
      <label className="absolute right-2 top-2 z-10 flex cursor-pointer items-center" title="Uncheck to uncombine" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked readOnly onChange={onUncombine} className="h-4 w-4 accent-violet-600" />
      </label>
      <Link to={`/bu/${data.codes.join(COMBINE_SEP)}`} className="flex flex-col gap-1.5">
        <span className="truncate pr-6 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
          {data.labels.join(' + ')}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Combined {metric === 'net_income_ops' ? 'net income from ops' : 'net income'} · {data.codes.length} BUs
        </span>
        <div className="flex items-baseline justify-between gap-3">
          <span
            className={`text-xl font-bold tabular-nums ${
              loss
                ? 'text-rose-600 dark:text-rose-400'
                : 'bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent dark:from-violet-300 dark:to-indigo-300'
            }`}
          >
            {money(value, true)}
          </span>
          {margin !== null && (
            <span className="shrink-0 whitespace-nowrap text-right text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
              {formatPercent(margin)}<span className="ml-0.5 text-[9px] font-normal text-slate-400 dark:text-slate-500">of sales</span>
            </span>
          )}
        </div>
        {priorLabel && (
          <div className="mt-1 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                  up
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
                }`}
              >
                {up ? '▲' : '▼'} {money(Math.abs(diff))}
              </span>
              <span className="truncate text-[10px] text-slate-400 dark:text-slate-500">vs {priorLabel}</span>
            </div>
            <span className={`text-[11px] font-semibold tabular-nums ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {up ? '▲' : '▼'} {formatPercent(Math.abs(pctDiff))} change
            </span>
          </div>
        )}
      </Link>
    </div>
  );
}
