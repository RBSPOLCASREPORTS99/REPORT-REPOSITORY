import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrendPoint } from '../lib/queries';

// Gross Sales sits on its own (large) left axis; Expense and Net Income from
// Operations share a zoomed right axis so their movement is visible and can be
// read against Gross Sales — making the "sales down → expenses should follow"
// relationship clear instead of squashing the two small lines together.
const SERIES = [
  { key: 'Gross Sales', color: '#94a3b8', axis: 'left' },
  { key: 'Expense', color: '#f59e0b', axis: 'right' },
  { key: 'Net Income from Operations', color: '#16a34a', axis: 'right' },
] as const;

export default function TrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length < 2) return null;
  const chartData = data.map((p) => ({
    label: p.label,
    'Gross Sales': Math.round(p.grossSales),
    'Expense': Math.round(p.totalExpense),
    'Net Income from Operations': Math.round(p.netIncomeOps),
  }));

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-sm">
      <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Trend (₱ thousands)</h3>
      <p className="mb-2 text-xs text-slate-400 dark:text-slate-500">
        Left axis: Gross Sales · Right axis: Expense &amp; Net Income from Operations
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" strokeOpacity={0.4} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} width={58} tickCount={8} allowDecimals={false} tickFormatter={(v) => Number(v).toLocaleString()} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} width={58} tickCount={8} allowDecimals={false} tickFormatter={(v) => Number(v).toLocaleString()} />
          <Tooltip
            formatter={(v) => (typeof v === 'number' ? v.toLocaleString() : String(v ?? ''))}
            itemSorter={(item) => SERIES.findIndex((s) => s.key === item.dataKey)}
          />
          {SERIES.map((s) => (
            <Line key={s.key} yAxisId={s.axis} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {/* Custom legend to keep a fixed order: Gross Sales, Expense, NI from Ops. */}
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
