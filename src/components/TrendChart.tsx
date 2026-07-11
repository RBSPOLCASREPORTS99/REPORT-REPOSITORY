import { useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrendPoint } from '../lib/queries';

// All series share one Y axis so the true peso gaps show at scale. The band
// between Gross Income and Expense is shaded to emphasise that gap. Gross Sales
// is available but off by default (check it in the legend to show it), since it
// dwarfs the other lines.
const SERIES = [
  { key: 'Gross Sales', color: '#94a3b8' },
  { key: 'Gross Income', color: '#6366f1' },
  { key: 'Expense', color: '#f59e0b' },
  { key: 'Net Income from Operations', color: '#16a34a' },
] as const;

interface Row {
  label: string;
  'Gross Sales': number;
  'Gross Income': number;
  'Expense': number;
  'Net Income from Operations': number;
  Gap: [number, number];
}

export default function TrendChart({ data }: { data: TrendPoint[] }) {
  const [full, setFull] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set<string>(['Gross Sales']));
  const toggle = (key: string) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  if (data.length < 2) return null;
  const chartData: Row[] = data.map((p) => {
    const gi = Math.round(p.grossIncome);
    const ex = Math.round(p.totalExpense);
    return {
      label: p.label,
      'Gross Sales': Math.round(p.grossSales),
      'Gross Income': gi,
      'Expense': ex,
      'Net Income from Operations': Math.round(p.netIncomeOps),
      Gap: [ex, gi],
    };
  });
  const showGap = !hidden.has('Gross Income') && !hidden.has('Expense');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as Row;
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-md dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-1 font-medium text-slate-600 dark:text-slate-300">{label}</div>
        {SERIES.filter((s) => !hidden.has(s.key)).map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <span className="inline-block h-0.5 w-3 rounded" style={{ backgroundColor: s.color }} />{s.key}
            </span>
            <span className="tabular-nums font-medium text-slate-800 dark:text-slate-100">{Number(row[s.key]).toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={full
      ? 'fixed inset-0 z-50 flex flex-col bg-white p-4 dark:bg-slate-900'
      : 'rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800'}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Trend (₱ thousands)</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500">Shaded band = gap between Gross Income and Expense</p>
        </div>
        <button
          onClick={() => setFull((f) => !f)}
          className="shrink-0 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200"
        >
          {full ? '✕ Exit full screen' : '⛶ Full screen'}
        </button>
      </div>

      <div className={full ? 'mt-2 min-h-0 flex-1' : 'mt-2'}>
        <ResponsiveContainer width="100%" height={full ? '100%' : 300}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 12, left: 8, bottom: 0 }}>
            {/* Dashed gridlines, including a vertical line at every month. */}
            <CartesianGrid strokeDasharray="4 4" stroke="#cbd5e1" strokeOpacity={0.5} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={full ? 0 : 'preserveStartEnd'} />
            <YAxis tick={{ fontSize: 11 }} width={60} tickCount={full ? 13 : 9} allowDecimals={false} tickFormatter={(v) => Number(v).toLocaleString()} />
            <Tooltip content={tooltip} />
            {showGap && <Area type="monotone" dataKey="Gap" stroke="none" fill="#818cf8" fillOpacity={0.16} isAnimationActive={false} activeDot={false} />}
            {SERIES.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2}
                dot={full ? { r: 2 } : false} isAnimationActive={false} hide={hidden.has(s.key)} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Toggleable legend: click to check/uncheck a series. */}
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs">
        {SERIES.map((s) => {
          const on = !hidden.has(s.key);
          return (
            <button key={s.key} onClick={() => toggle(s.key)}
              className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 ${on ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 line-through dark:text-slate-600'}`}>
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded border"
                style={{ borderColor: s.color, backgroundColor: on ? s.color : 'transparent' }}>
                {on && <span className="text-[9px] leading-none text-white">✓</span>}
              </span>
              {s.key}
            </button>
          );
        })}
      </div>
    </div>
  );
}
