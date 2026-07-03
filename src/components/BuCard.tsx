import { Link } from 'react-router-dom';
import { formatThousands } from '../lib/format';
import type { BuCardData } from '../lib/queries';

export default function BuCard({ bu, priorLabel }: { bu: BuCardData; priorLabel?: string }) {
  const up = bu.diff >= 0;
  const loss = bu.netIncome < 0;
  return (
    <Link
      to={`/bu/${bu.buCode}`}
      className="flex flex-col gap-1.5 overflow-hidden rounded-2xl border border-brand-100 bg-white dark:bg-slate-800 p-4 shadow-sm transition active:bg-brand-50"
    >
      <span className="text-sm font-semibold text-brand-800">{bu.buName}</span>
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Net income</span>
      <span className={`text-2xl font-bold ${loss ? 'text-red-600' : 'text-brand-700'}`}>
        ₱{formatThousands(bu.netIncome)}k
      </span>
      {priorLabel && (
        <span className={`flex items-center gap-1 text-sm font-semibold ${up ? 'text-brand-600' : 'text-red-600'}`}>
          {up ? '▲' : '▼'} ₱{formatThousands(Math.abs(bu.diff))}k
          <span className="font-normal text-slate-400 dark:text-slate-500">{up ? 'higher' : 'lower'} vs {priorLabel}</span>
        </span>
      )}
    </Link>
  );
}
