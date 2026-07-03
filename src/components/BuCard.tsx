import { Link } from 'react-router-dom';
import { formatThousands } from '../lib/format';
import type { BuCardData } from '../lib/queries';

export default function BuCard({ bu, priorLabel }: { bu: BuCardData; priorLabel?: string }) {
  const up = bu.diff >= 0;
  return (
    <Link
      to={`/bu/${bu.buCode}`}
      className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50"
    >
      <span className="text-sm font-medium text-slate-500">{bu.buName}</span>
      <span className={`text-2xl font-semibold ${bu.netIncome < 0 ? 'text-red-600' : 'text-slate-900'}`}>
        ₱{formatThousands(bu.netIncome)}k
      </span>
      {priorLabel && (
        <span className={`flex items-center gap-1 text-sm font-medium ${up ? 'text-green-600' : 'text-red-600'}`}>
          {up ? '▲' : '▼'} ₱{formatThousands(Math.abs(bu.diff))}k vs {priorLabel}
        </span>
      )}
    </Link>
  );
}
