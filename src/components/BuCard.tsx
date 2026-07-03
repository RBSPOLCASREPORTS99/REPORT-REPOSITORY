import { Link } from 'react-router-dom';
import { formatMoney } from '../lib/format';
import { useUi } from '../contexts/UiContext';
import { useBuLabels } from '../contexts/BuLabelsContext';
import type { BuCardData } from '../lib/queries';

export default function BuCard({ bu, priorLabel }: { bu: BuCardData; priorLabel?: string }) {
  const { units } = useUi();
  const { labelFor } = useBuLabels();
  const up = bu.diff >= 0;
  const loss = bu.netIncome < 0;
  const money = (v: number) => formatMoney(v, 'thousands', units);
  return (
    <Link
      to={`/bu/${bu.buCode}`}
      className="flex flex-col gap-1.5 overflow-hidden rounded-2xl border border-brand-100 bg-white p-4 shadow-sm transition active:bg-brand-50 dark:border-slate-700 dark:bg-slate-800"
    >
      <span className="text-sm font-semibold uppercase text-brand-800 dark:text-brand-300">{labelFor(bu.buCode)}</span>
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Net income</span>
      <span className={`text-2xl font-bold ${loss ? 'text-red-600' : 'text-brand-700 dark:text-brand-400'}`}>
        {money(bu.netIncome)}
      </span>
      {priorLabel && (
        <span className={`flex items-center gap-1 text-sm font-semibold ${up ? 'text-brand-600 dark:text-brand-400' : 'text-red-600'}`}>
          {up ? '▲' : '▼'} {money(Math.abs(bu.diff))}
          <span className="font-normal text-slate-400 dark:text-slate-500">{up ? 'higher' : 'lower'} vs {priorLabel}</span>
        </span>
      )}
    </Link>
  );
}
