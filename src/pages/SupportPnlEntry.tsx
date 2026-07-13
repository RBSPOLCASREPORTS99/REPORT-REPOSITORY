import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchRanges, type RangeRow } from '../lib/queries';
import { SERVICE_BUS, SUPPORT_UNITS, fetchSupportConfig, saveSupportConfig, loadSupportCounts, saveSupportCounts, type SupportUnit, type SupportMethod } from '../lib/supportQueries';
import NumberInput from '../components/NumberInput';
import { GridSkeleton, Skeleton } from '../components/Skeleton';

// Methods available per unit (Management is % of revenue only).
const METHODS: Record<SupportUnit, { value: SupportMethod; label: string }[]> = {
  FINANCE: [{ value: 'pct', label: '% of Revenue' }, { value: 'per_txn', label: 'Per # Transaction' }],
  HR: [{ value: 'pct', label: '% of Revenue' }, { value: 'per_pax', label: 'Per PAX (EE)' }],
  MANCOM: [{ value: 'pct', label: '% of Revenue' }],
};

export default function SupportPnlEntry() {
  const navigate = useNavigate();
  const [unit, setUnit] = useState<SupportUnit>('FINANCE');
  const [ranges, setRanges] = useState<RangeRow[]>([]);
  const [ym, setYm] = useState<{ year: number; month: number } | null>(null);
  const [method, setMethod] = useState<SupportMethod>('pct');
  const [rate, setRate] = useState<number | undefined>(undefined);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [months, setMonths] = useState<{ year: number; month: number; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchRanges().then((r) => {
      setRanges(r);
      const ms = r.filter((x) => x.kind === 'month').map((x) => { const [y, m] = x.period_start.split('-').map(Number); return { year: y, month: m, label: x.label }; });
      setMonths(ms); if (ms.length) setYm({ year: ms[0].year, month: ms[0].month });
      setLoading(false);
    }).catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    fetchSupportConfig(unit).then((c) => { setMethod(METHODS[unit].some((m) => m.value === c.method) ? c.method : 'pct'); setRate(c.rate || undefined); }).catch(() => {});
  }, [unit]);

  useEffect(() => {
    if (!ym) return; setSaved(false);
    loadSupportCounts(ym.year, ym.month, unit).then(setCounts).catch((e) => setError(e.message));
  }, [ym, unit]);

  async function save() {
    if (!ym) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      await saveSupportConfig(unit, method, rate ?? 0);
      if (method !== 'pct') await saveSupportCounts(ym.year, ym.month, unit, counts);
      setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed.'); } finally { setSaving(false); }
  }

  if (loading) return <div className="space-y-4"><Skeleton className="h-6 w-64" /><GridSkeleton /></div>;
  if (ranges.length === 0) return <p className="text-slate-400 dark:text-slate-500">Import a monthly P&L first.</p>;
  const rateLabel = method === 'per_txn' ? 'Rate per transaction' : method === 'per_pax' ? 'Rate per EE' : '';
  const countLabel = method === 'per_txn' ? '# Transactions' : method === 'per_pax' ? '# PAX (EE)' : '';

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Support P&L — inputs</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">Choose each support unit's billing method. For per-transaction / per-PAX, set the rate and enter the per-BU counts for the month; % of Revenue needs no counts (revenue auto-reads from the P&L import).</p>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm"><span className="font-medium text-slate-700 dark:text-slate-200">Unit</span>
          <select value={unit} onChange={(e) => setUnit(e.target.value as SupportUnit)} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-base">
            {SUPPORT_UNITS.map((u) => <option key={u.unit} value={u.unit}>{u.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm"><span className="font-medium text-slate-700 dark:text-slate-200">Method</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as SupportMethod)} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-base">
            {METHODS[unit].map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        {method !== 'pct' && (
          <>
            <label className="flex items-center gap-2 text-sm"><span className="font-medium text-slate-700 dark:text-slate-200">{rateLabel}</span>
              <NumberInput value={rate} onChange={setRate} className="w-28 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-right tabular-nums" />
            </label>
            <label className="flex items-center gap-2 text-sm"><span className="font-medium text-slate-700 dark:text-slate-200">Month</span>
              <select value={`${ym?.year}-${ym?.month}`} onChange={(e) => { const [y, m] = e.target.value.split('-').map(Number); setYm({ year: y, month: m }); }} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-base">
                {months.map((m) => <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{m.label}</option>)}
              </select>
            </label>
          </>
        )}
      </div>

      {method !== 'pct' && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-slate-800">
          <div className="grid grid-cols-[1fr_10rem] items-center gap-3 border-b border-slate-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:text-slate-500">
            <span>Business Unit</span><span className="text-right">{countLabel}</span>
          </div>
          {SERVICE_BUS.map((b) => (
            <div key={b.code} className="grid grid-cols-[1fr_10rem] items-center gap-3 border-b border-slate-100 px-4 py-2 dark:border-slate-700/60">
              <span className="text-sm text-slate-700 dark:text-slate-200">{b.label}</span>
              <NumberInput value={counts[b.code]} onChange={(n) => { setCounts((c) => ({ ...c, [b.code]: n })); setSaved(false); }}
                className="w-36 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-right tabular-nums" />
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">Saved. See the report.</p>}
      <div className="flex gap-3">
        <button onClick={() => navigate('/')} className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">Done</button>
        <button onClick={save} disabled={saving} className="flex-1 rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}
