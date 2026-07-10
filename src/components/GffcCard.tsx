import { Link } from 'react-router-dom';
import { formatMoney } from '../lib/format';
import { useUi } from '../contexts/UiContext';

// Home-grid card for GFFC - Chickboy Meating Place (a separate company). Opens
// the GFFC company screen (/gffc).
export default function GffcCard({ net, priorNet, priorLabel, index = 0 }: { net: number; priorNet: number; priorLabel?: string; index?: number }) {
  const { units } = useUi();
  const diff = net - priorNet;
  const up = diff >= 0;
  const loss = net < 0;
  const money = (v: number) => formatMoney(v, 'full', units);
  return (
    <Link
      to="/gffc"
      style={{ animationDelay: `${Math.min(index, 15) * 40}ms` }}
      className="group animate-rise flex flex-col gap-1.5 overflow-hidden rounded-2xl border border-indigo-100/80 bg-gradient-to-br from-white to-indigo-50/70 p-3.5 shadow-sm ring-1 ring-transparent transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/10 hover:ring-indigo-200 active:translate-y-0 dark:border-slate-700 dark:from-slate-800 dark:to-indigo-950/30 dark:hover:ring-indigo-500/40"
    >
      <span className="truncate text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">GFFC - Chickboy Meating Place</span>
      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Net income</span>
      <span
        className={`text-xl font-bold tabular-nums ${
          loss ? 'text-rose-600 dark:text-rose-400' : 'bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent dark:from-indigo-300 dark:to-violet-300'
        }`}
      >
        {money(net)}
      </span>
      {priorLabel && (
        <div className="mt-1 flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
              up ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
            }`}
          >
            {up ? '▲' : '▼'} {money(Math.abs(diff))}
          </span>
          <span className="truncate text-[10px] text-slate-400 dark:text-slate-500">vs {priorLabel}</span>
        </div>
      )}
    </Link>
  );
}
