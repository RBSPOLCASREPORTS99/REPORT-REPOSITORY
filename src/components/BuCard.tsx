import { Link } from 'react-router-dom';
import { formatMoney, formatPercent } from '../lib/format';
import { useUi } from '../contexts/UiContext';
import { useBuLabels } from '../contexts/BuLabelsContext';
import { pickMetric, type BuCardData, type BuMetric } from '../lib/queries';

// Drag-and-drop hooks so a BU box can be dragged onto another to combine them.
export interface CardDnd {
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  isOver: boolean;
  isDragging: boolean;
}

export default function BuCard({ bu, priorLabel, metric = 'net_income', index = 0, dnd }: { bu: BuCardData; priorLabel?: string; metric?: BuMetric; index?: number; dnd?: CardDnd }) {
  const { units } = useUi();
  const { labelFor } = useBuLabels();
  const { value, margin, diff, pctDiff } = pickMetric(metric, bu);
  const up = diff >= 0;
  const loss = value < 0;
  const money = (v: number, peso = false) => formatMoney(v, 'thousands', units, peso);
  return (
    <Link
      to={`/bu/${bu.buCode}`}
      draggable={!!dnd}
      onDragStart={dnd ? (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', bu.buCode); dnd.onDragStart(); } : undefined}
      onDragEnd={dnd?.onDragEnd}
      onDragOver={dnd ? (e) => { e.preventDefault(); dnd.onDragOver(); } : undefined}
      onDragLeave={dnd?.onDragLeave}
      onDrop={dnd ? (e) => { e.preventDefault(); dnd.onDrop(); } : undefined}
      style={{ animationDelay: `${Math.min(index, 15) * 40}ms` }}
      className={`group animate-rise flex flex-col gap-1.5 overflow-hidden rounded-2xl border border-indigo-100/80 bg-gradient-to-br from-white to-indigo-50/70 p-3.5 shadow-sm ring-1 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/10 hover:ring-indigo-200 active:translate-y-0 dark:border-slate-700 dark:from-slate-800 dark:to-indigo-950/30 dark:hover:ring-indigo-500/40 ${
        dnd?.isOver ? 'ring-2 ring-indigo-500 dark:ring-indigo-400' : 'ring-transparent'
      } ${dnd?.isDragging ? 'opacity-40' : ''}`}
    >
      <span className="truncate text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
        {labelFor(bu.buCode)}
      </span>
      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {metric === 'net_income_ops' ? 'Net income from ops' : 'Net income'}
      </span>
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={`text-xl font-bold tabular-nums ${
            loss
              ? 'text-rose-600 dark:text-rose-400'
              : 'bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent dark:from-indigo-300 dark:to-violet-300'
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
  );
}
