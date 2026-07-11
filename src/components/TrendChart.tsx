import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrendPoint } from '../lib/queries';

// All three series share one Y axis (so the true peso gap between Gross Sales and
// Expense shows at scale). The band between Gross Sales and Expense is shaded to
// emphasise that gap — it should stay wide; if sales fall and expenses don't, it
// visibly narrows.
const SERIES = [
  { key: 'Gross Sales', color: '#64748b' },
  { key: 'Expense', color: '#f59e0b' },
  { key: 'Net Income from Operations', color: '#16a34a' },
] as const;

interface Row { label: string; 'Gross Sales': number; 'Expense': number; 'Net Income from Operations': number; Gap: [number, number] }

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: Row }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-md dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-1 font-medium text-slate-600 dark:text-slate-300">{label}</div>
      {SERIES.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="inline-block h-0.5 w-3 rounded" style={{ backgroundColor: s.color }} />{s.key}
          </span>
          <span className="tabular-nums font-medium text-slate-800 dark:text-slate-100">{Number(row[s.key]).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export default function TrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length < 2) return null;
  const chartData: Row[] = data.map((p) => {
    const gs = Math.round(p.grossSales);
    const ex = Math.round(p.totalExpense);
    return {
      label: p.label,
      'Gross Sales': gs,
      'Expense': ex,
      'Net Income from Operations': Math.round(p.netIncomeOps),
      Gap: [ex, gs],
    };
  });

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-sm">
      <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Trend (₱ thousands)</h3>
      <p className="mb-2 text-xs text-slate-400 dark:text-slate-500">Shaded band = gap between Gross Sales and Expense</p>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 12, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" strokeOpacity={0.4} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={60} tickCount={9} allowDecimals={false} tickFormatter={(v) => Number(v).toLocaleString()} />
          <Tooltip content={<TrendTooltip />} />
          <Area type="monotone" dataKey="Gap" stroke="none" fill="#818cf8" fillOpacity={0.16} isAnimationActive={false} activeDot={false} />
          {SERIES.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} isAnimationActive={false} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      {/* Fixed-order legend: Gross Sales, Expense, NI from Ops. */}
      <div className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: s.color }} />
            {s.key}
          </span>
        ))}
      </div>
    </div>
  );
}
