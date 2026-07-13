import { Link } from 'react-router-dom';
import { formatMoney } from '../lib/format';
import { useUi } from '../contexts/UiContext';

// Home-grid card for the company-wide Total P&L (POLCAS AGRI TRADE CORP.).
// Opens the company P&L screen (/company). Values are ₱ '000.
export default function CompanyCard({ net, priorNet, priorLabel, index = 0 }: { net: number; priorNet: number; priorLabel?: string; index?: number }) {
  const { units } = useUi();
  const diff = net - priorNet;
  const up = diff >= 0;
  const loss = net < 0;
  const money = (v: number, peso = false) => formatMoney(v, 'thousands', units, peso);
  return (
    <Link
      to="/company"
      style={{ animationDelay: `${Math.min(index, 15) * 40}ms` }}
      className="group animate-rise col-span-4! flex flex-col gap-1.5 overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 to-teal-50/70 p-3.5 shadow-sm ring-1 ring-transparent transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/10 hover:ring-emerald-300 active:translate-y-0 dark:border-emerald-800/60 dark:from-emerald-950/30 dark:to-teal-950/30 dark:hover:ring-emerald-500/40"
    >
      <span className="truncate text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">POLCAS AGRI TRADE CORP. · Total P&amp;L</span>
      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Company net income</span>
      <span
        className={`text-2xl font-bold tabular-nums ${
          loss ? 'text-rose-600 dark:text-rose-400' : 'bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent dark:from-emerald-300 dark:to-teal-300'
        }`}
      >
        {money(net, true)}
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
