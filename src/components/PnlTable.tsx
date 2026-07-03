import { formatPercent, formatThousands } from '../lib/format';
import type { ComparisonLine } from '../lib/queries';

const BOLD_KEYS = new Set(['gross_income', 'total_expense', 'net_income_ops', 'net_income']);

function money(v: number) {
  return `₱${formatThousands(v)}`;
}

// Full comparison table mirroring the Excel layout:
// Line item | Prior | % | Current | % | DIFF | %DIFF
export default function PnlTable({
  lines,
  priorLabel,
  currentLabel,
}: {
  lines: ComparisonLine[];
  priorLabel: string;
  currentLabel: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs font-medium text-slate-400">
            <th className="sticky left-0 bg-white px-4 py-2 text-left">Line item</th>
            <th className="px-3 py-2 text-right">{priorLabel}</th>
            <th className="px-2 py-2 text-right">%</th>
            <th className="px-3 py-2 text-right">{currentLabel}</th>
            <th className="px-2 py-2 text-right">%</th>
            <th className="px-3 py-2 text-right">DIFF</th>
            <th className="px-3 py-2 text-right">%DIFF</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const bold = BOLD_KEYS.has(line.key);
            const up = line.diff >= 0;
            const rowCls = bold ? 'bg-slate-50/60 font-semibold' : '';
            const numCls = (v: number) => (v < 0 ? 'text-red-600' : 'text-slate-900');
            return (
              <tr key={line.key} className={`border-b border-slate-50 ${rowCls}`}>
                <td className={`sticky left-0 px-4 py-2.5 text-left ${bold ? 'bg-slate-50 font-semibold text-slate-900' : 'bg-white text-slate-600'}`}>
                  {line.label}
                </td>
                {line.isPct ? (
                  <>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{formatPercent(line.prior)}</td>
                    <td className="px-2 py-2.5" />
                    <td className={`px-3 py-2.5 text-right tabular-nums ${numCls(line.current)}`}>{formatPercent(line.current)}</td>
                    <td className="px-2 py-2.5" />
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5" />
                  </>
                ) : (
                  <>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${numCls(line.prior)}`}>{money(line.prior)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-400">{formatPercent(line.priorPct)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${numCls(line.current)}`}>{money(line.current)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-400">{formatPercent(line.currentPct)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${up ? 'text-green-600' : 'text-red-600'}`}>
                      {up ? '▲' : '▼'} {money(Math.abs(line.diff))}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${up ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPercent(line.pctDiff)}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
