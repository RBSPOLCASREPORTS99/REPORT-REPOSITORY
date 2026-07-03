import { formatPercent, formatMoney } from '../lib/format';
import { useUi } from '../contexts/UiContext';
import type { ComparisonLine } from '../lib/queries';

const BOLD_KEYS = new Set(['gross_income', 'total_expense', 'net_income_ops', 'net_income']);

// Operating-expense lines that get auto-sorted biggest-first within their block.
const EXPENSE_SORT_KEYS = new Set([
  'admin_expense', 'discounting_expense', 'operations_expense',
  'repairs_expense', 'salaries_expense', 'trucking_expense',
]);

// Full comparison table mirroring the Excel layout:
// LINE ITEM | PRIOR | % | CURRENT | % | DIFF | %DIFF
export default function PnlTable({
  lines,
  priorLabel,
  currentLabel,
}: {
  lines: ComparisonLine[];
  priorLabel: string;
  currentLabel: string;
}) {
  const { units } = useUi();
  // Peso sign only on the Net Income lines; everything else is a bare number.
  const PESO_KEYS = new Set(['net_income', 'net_income_ops']);
  const money = (v: number, peso = false) => formatMoney(v, 'thousands', units, peso);

  // Auto-sort the operating-expense lines by current amount (biggest first),
  // keeping every other row (subtotals, section rows) in its fixed position.
  const rows = lines.slice();
  const expSlots: number[] = [];
  const expLines: ComparisonLine[] = [];
  lines.forEach((l, i) => { if (EXPENSE_SORT_KEYS.has(l.key)) { expSlots.push(i); expLines.push(l); } });
  expLines.sort((a, b) => Math.abs(b.current) - Math.abs(a.current));
  expSlots.forEach((slot, k) => { rows[slot] = expLines[k]; });

  const headCls = 'sticky top-0 z-10 bg-white dark:bg-slate-800 px-3 py-2 text-right';

  return (
    <div className="max-h-[72vh] overflow-auto rounded-2xl bg-white shadow-sm dark:bg-slate-800">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:text-slate-500">
            <th className="sticky left-0 top-0 z-20 bg-white px-4 py-2 text-left dark:bg-slate-800">Line item</th>
            <th className={headCls}>{priorLabel}</th>
            <th className={`${headCls} px-2`}>%</th>
            <th className={headCls}>{currentLabel}</th>
            <th className={`${headCls} px-2`}>%</th>
            <th className={headCls}>DIFF</th>
            <th className={headCls}>%DIFF</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((line) => {
            const bold = BOLD_KEYS.has(line.key);
            const peso = PESO_KEYS.has(line.key);
            const up = line.diff >= 0;
            const rowCls = bold ? 'bg-slate-50/60 font-semibold dark:bg-slate-700/50' : '';
            const numCls = (v: number) => (v < 0 ? 'text-red-600' : 'text-slate-900 dark:text-slate-100');
            return (
              <tr key={line.key} className={`border-b border-slate-50 dark:border-slate-700/60 ${rowCls}`}>
                <td className={`sticky left-0 px-4 py-2.5 text-left uppercase ${bold ? 'bg-slate-50 font-semibold text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                  {line.label}
                </td>
                {line.isPct ? (
                  <>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400">{formatPercent(line.prior)}</td>
                    <td className="px-2 py-2.5" />
                    <td className={`px-3 py-2.5 text-right tabular-nums ${numCls(line.current)}`}>{formatPercent(line.current)}</td>
                    <td className="px-2 py-2.5" />
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5" />
                  </>
                ) : (
                  <>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${numCls(line.prior)}`}>{money(line.prior, peso)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-400 dark:text-slate-500">{formatPercent(line.priorPct)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${numCls(line.current)}`}>{money(line.current, peso)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-400 dark:text-slate-500">{formatPercent(line.currentPct)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${up ? 'text-green-600' : 'text-red-600'}`}>
                      {up ? '▲' : '▼'} {money(Math.abs(line.diff), peso)}
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
