import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrendPoint } from '../lib/queries';

// Fixed display order for the legend and tooltip.
const ORDER = ['Gross Sales', 'Expense', 'Net Income from Operations'];

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
      <h3 className="mb-2 text-sm font-medium text-slate-500 dark:text-slate-400">Trend (₱ thousands)</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 12, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" strokeOpacity={0.4} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 11 }}
            width={60}
            tickCount={9}
            allowDecimals={false}
            tickFormatter={(v) => Number(v).toLocaleString()}
          />
          <Tooltip
            formatter={(v) => (typeof v === 'number' ? v.toLocaleString() : String(v ?? ''))}
            itemSorter={(item) => ORDER.indexOf(String(item.dataKey))}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="Gross Sales" stroke="#94a3b8" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="Expense" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="Net Income from Operations" stroke="#16a34a" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
