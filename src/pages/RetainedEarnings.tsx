import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUi } from '../contexts/UiContext';
import { useAuth } from '../contexts/AuthContext';
import { formatMoney, formatPercent } from '../lib/format';
import NumberInput from '../components/NumberInput';
import { TableSkeleton } from '../components/Skeleton';
import {
  fetchCompanyNetIncomeForYear, loadRetainedEarnings, saveRetainedEarnings,
  newFund, newItem, type ReData, type ReFund, type ReItem,
} from '../lib/retainedEarnings';

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR + 1 - 2024 + 1 }, (_, i) => 2024 + i);

// Retained Earnings Allocation — a yearly report. POLCAS's overall Net Income is
// split across funds (each a % of Net Income); each fund is drawn down by
// editable line items. Everything (funds, %, items, amounts, the Net Income
// basis) is editable and addable by Finance; the GM can view it read-only.
export default function RetainedEarnings() {
  const { units } = useUi();
  const { profile } = useAuth();
  const canEdit = profile?.role === 'finance';
  const [year, setYear] = useState(THIS_YEAR);
  const [data, setData] = useState<ReData | null>(null);
  const [autoNet, setAutoNet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setSaved(false);
    Promise.all([loadRetainedEarnings(year), fetchCompanyNetIncomeForYear(year)])
      .then(([d, net]) => { if (!cancelled) { setData(d); setAutoNet(net); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year]);

  const money = (v: number) => formatMoney(v, 'full', units);
  const netIncome = data?.netIncomeOverride ?? autoNet;

  // ---- immutable updates ----
  const patch = (fn: (d: ReData) => ReData) => { setData((prev) => (prev ? fn(prev) : prev)); setSaved(false); };
  const setFund = (id: string, f: Partial<ReFund>) => patch((d) => ({ ...d, funds: d.funds.map((x) => (x.id === id ? { ...x, ...f } : x)) }));
  const setItem = (fid: string, iid: string, it: Partial<ReItem>) => patch((d) => ({
    ...d, funds: d.funds.map((x) => x.id === fid ? { ...x, items: x.items.map((y) => (y.id === iid ? { ...y, ...it } : y)) } : x),
  }));
  const addItem = (fid: string) => patch((d) => ({ ...d, funds: d.funds.map((x) => (x.id === fid ? { ...x, items: [...x.items, newItem()] } : x)) }));
  const delItem = (fid: string, iid: string) => patch((d) => ({ ...d, funds: d.funds.map((x) => (x.id === fid ? { ...x, items: x.items.filter((y) => y.id !== iid) } : x)) }));
  const addFund = () => patch((d) => ({ ...d, funds: [...d.funds, newFund()] }));
  const delFund = (id: string) => patch((d) => ({ ...d, funds: d.funds.filter((x) => x.id !== id) }));

  async function handleSave() {
    if (!data) return;
    setSaving(true); setError(''); setSaved(false);
    try { await saveRetainedEarnings(year, data); setSaved(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'Save failed.'); }
    finally { setSaving(false); }
  }

  const sumPct = (data?.funds ?? []).reduce((s, f) => s + f.pct, 0);
  const totalAllocated = netIncome * sumPct;
  const unallocated = netIncome - totalAllocated;

  const inputCls = 'w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:border-slate-400 focus:outline-none';
  const numCls = 'w-32 rounded border border-slate-200 dark:border-slate-700 px-2 py-1 text-right text-sm tabular-nums focus:border-slate-400 focus:outline-none';

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm text-slate-400 dark:text-slate-500">← Back to Home</Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Retained Earnings Allocation</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">POLCAS AGRI TRADE CORP. — each fund is a % of the year's overall Net Income, drawn down by line items.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-200">Year</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-base">
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40">{error}</p>}

      {loading || !data ? <TableSkeleton /> : (
        <>
          {/* Net Income basis */}
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-0">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Overall Net Income — {year}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">From the company Total P&amp;L (system): <span className="tabular-nums font-medium text-slate-600 dark:text-slate-300">{money(autoNet)}</span></p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Net Income used</span>
                {canEdit ? (
                  <NumberInput value={netIncome} onChange={(n) => patch((d) => ({ ...d, netIncomeOverride: n }))} className={`${numCls} w-40`} />
                ) : (
                  <span className="w-40 text-right text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">{money(netIncome)}</span>
                )}
                {canEdit && data.netIncomeOverride != null && (
                  <button onClick={() => patch((d) => ({ ...d, netIncomeOverride: null }))}
                    title="Use the system value" className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700">↺ system</button>
                )}
              </div>
            </div>
          </div>

          {/* Funds */}
          <div className="space-y-4">
            {data.funds.map((f) => {
              const alloc = netIncome * f.pct;
              const spent = f.items.reduce((s, i) => s + i.amount, 0);
              const balance = alloc - spent;
              return (
                <div key={f.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-0">
                  <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                    {canEdit ? (
                      <input value={f.name} onChange={(e) => setFund(f.id, { name: e.target.value })} placeholder="Fund name"
                        className={`${inputCls} max-w-xs flex-1 font-semibold`} />
                    ) : <span className="flex-1 font-semibold text-slate-900 dark:text-slate-100">{f.name}</span>}
                    <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      % of Net Income
                      {canEdit ? (
                        <NumberInput value={f.pct * 100} onChange={(n) => setFund(f.id, { pct: n / 100 })} className="w-20 rounded border border-slate-200 dark:border-slate-700 px-2 py-1 text-right text-sm tabular-nums focus:border-slate-400 focus:outline-none" />
                      ) : <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">{formatPercent(f.pct)}</span>}
                      {canEdit && <span>%</span>}
                    </label>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Allocation</p>
                      <p className="text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">{money(alloc)}</p>
                    </div>
                    {canEdit && (
                      <button onClick={() => delFund(f.id)} title="Remove fund"
                        className="rounded-md px-2 py-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40">✕</button>
                    )}
                  </div>

                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-500">
                        <th className="px-4 py-2 text-left">Line Item</th>
                        <th className="px-4 py-2 text-right">Amount</th>
                        <th className="px-4 py-2 text-right">% of Allocation</th>
                        {canEdit && <th className="px-2 py-2" />}
                      </tr>
                    </thead>
                    <tbody>
                      {f.items.length === 0 && (
                        <tr><td colSpan={canEdit ? 4 : 3} className="px-4 py-3 text-center text-sm text-slate-400 dark:text-slate-500">No line items yet.</td></tr>
                      )}
                      {f.items.map((it) => (
                        <tr key={it.id} className="border-b border-slate-100 dark:border-slate-700/60">
                          <td className="px-4 py-2 text-left">
                            {canEdit ? <input value={it.name} onChange={(e) => setItem(f.id, it.id, { name: e.target.value })} placeholder="Line item" className={inputCls} />
                              : <span className="text-slate-700 dark:text-slate-200">{it.name}</span>}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {canEdit ? <NumberInput value={it.amount} onChange={(n) => setItem(f.id, it.id, { amount: n })} className={numCls} />
                              : <span className="tabular-nums text-slate-900 dark:text-slate-100">{money(it.amount)}</span>}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{alloc !== 0 ? formatPercent(it.amount / alloc) : '—'}</td>
                          {canEdit && (
                            <td className="px-2 py-2 text-center">
                              <button onClick={() => delItem(f.id, it.id)} title="Remove line item" className="rounded px-1.5 text-slate-400 hover:text-red-600">✕</button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 bg-slate-50 font-medium dark:border-slate-700 dark:bg-slate-900/40">
                        <td className="px-4 py-2 text-left text-slate-600 dark:text-slate-300">Total line items</td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-900 dark:text-slate-100">{money(spent)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{alloc !== 0 ? formatPercent(spent / alloc) : '—'}</td>
                        {canEdit && <td />}
                      </tr>
                      <tr className="bg-slate-100 font-semibold text-indigo-700 dark:bg-slate-700/50 dark:text-indigo-300">
                        <td className="px-4 py-2 text-left">Balance (Net Income)</td>
                        <td className={`px-4 py-2 text-right tabular-nums ${balance < 0 ? 'text-red-600' : ''}`}>{money(balance)}</td>
                        <td className={`px-4 py-2 text-right tabular-nums ${balance < 0 ? 'text-red-600' : ''}`}>{alloc !== 0 ? formatPercent(balance / alloc) : '—'}</td>
                        {canEdit && <td />}
                      </tr>
                    </tfoot>
                  </table>

                  {canEdit && (
                    <div className="border-t border-slate-100 px-4 py-2 dark:border-slate-700/60">
                      <button onClick={() => addItem(f.id)} className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600">+ Add line item</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {canEdit && (
            <button onClick={addFund} className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-300">+ Add fund</button>
          )}

          {/* Summary */}
          <div className="rounded-2xl bg-white p-4 text-sm shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-0">
            <div className="flex flex-wrap justify-between gap-x-8 gap-y-1">
              <span className="text-slate-500 dark:text-slate-400">Allocated to funds <span className="font-medium text-slate-700 dark:text-slate-200">({formatPercent(sumPct)})</span></span>
              <span className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">{money(totalAllocated)}</span>
            </div>
            <div className="mt-1 flex flex-wrap justify-between gap-x-8 gap-y-1">
              <span className="text-slate-500 dark:text-slate-400">Unallocated Net Income <span className="font-medium text-slate-700 dark:text-slate-200">({formatPercent(1 - sumPct)})</span></span>
              <span className={`tabular-nums font-semibold ${unallocated < 0 ? 'text-red-600' : 'text-slate-900 dark:text-slate-100'}`}>{money(unallocated)}</span>
            </div>
          </div>

          {saved && <p className="text-sm text-green-600">Saved.</p>}
          {canEdit && (
            <div className="flex justify-end">
              <button onClick={handleSave} disabled={saving} className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
