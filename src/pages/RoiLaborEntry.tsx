import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchRanges, type RangeRow } from '../lib/queries';
import { fetchRoiLabor, loadRoiOverrides, saveRoiOverride, type RoiRow } from '../lib/roiQueries';
import { GridSkeleton, Skeleton } from '../components/Skeleton';

type Ov = { net_income: number | null; labor_cost: number | null };
const parse = (s: string): number | null => { const t = s.replace(/,/g, '').trim(); return t === '' ? null : (Number.isNaN(Number(t)) ? null : Number(t)); };
const show = (v: number | null) => (v == null ? '' : String(v));

// Override a BU's Net Income / Total Labor Cost for the ROI on Labor report.
// Blank = use the auto value from the P&L (shown as the placeholder).
export default function RoiLaborEntry() {
  const navigate = useNavigate();
  const [ranges, setRanges] = useState<RangeRow[]>([]);
  const [rangeId, setRangeId] = useState('');
  const [rows, setRows] = useState<RoiRow[]>([]);
  const [ov, setOv] = useState<Record<string, Ov>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchRanges().then((r) => { setRanges(r); if (r.length) setRangeId((id) => id || r[0].id); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!rangeId) return;
    setSaved(false);
    Promise.all([fetchRoiLabor(rangeId), loadRoiOverrides(rangeId)])
      .then(([r, o]) => { setRows(r); setOv(o); })
      .catch((e) => setError(e.message));
  }, [rangeId]);

  const set = (code: string, field: keyof Ov, v: number | null) => {
    setOv((p) => { const prev = p[code] ?? { net_income: null, labor_cost: null }; return { ...p, [code]: { ...prev, [field]: v } }; });
    setSaved(false);
  };

  async function save() {
    setSaving(true); setError(''); setSaved(false);
    try {
      for (const r of rows) {
        const o = ov[r.buCode] ?? { net_income: null, labor_cost: null };
        await saveRoiOverride(rangeId, r.buCode, o.net_income, o.labor_cost);
      }
      setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed.'); } finally { setSaving(false); }
  }

  if (loading) return <div className="space-y-4"><Skeleton className="h-6 w-64" /><GridSkeleton /></div>;
  if (ranges.length === 0) return <p className="text-slate-400 dark:text-slate-500">Import a monthly P&L first to create periods.</p>;

  const peso = (v: number) => (v < 0 ? `₱(${Math.round(-v).toLocaleString('en-PH')})` : `₱${Math.round(v).toLocaleString('en-PH')}`);
  const inputCls = 'w-36 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-right tabular-nums focus:border-slate-400 focus:outline-none';

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">ROI on Labor — manual override</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">Net Income and Total Labor Cost auto-build from each BU's P&amp;L. Enter a value here only to override a BU for this period; leave blank to use the auto value (shown as placeholder).</p>

      <label className="flex items-center gap-2 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-200">Period</span>
        <select value={rangeId} onChange={(e) => setRangeId(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-base">
          {ranges.map((r) => <option key={r.id} value={r.id}>{r.label}{!r.is_published ? ' (draft)' : ''}</option>)}
        </select>
      </label>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-slate-800">
        <div className="grid grid-cols-[1fr_10rem_10rem] items-center gap-3 border-b border-slate-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:text-slate-500">
          <span>Business Unit</span><span className="text-right">Net Income</span><span className="text-right">Total Labor Cost</span>
        </div>
        {rows.map((r) => {
          const o = ov[r.buCode] ?? { net_income: null, labor_cost: null };
          return (
            <div key={r.buCode} className="grid grid-cols-[1fr_10rem_10rem] items-center gap-3 border-b border-slate-100 px-4 py-2 dark:border-slate-700/60">
              <span className="text-sm text-slate-700 dark:text-slate-200">{r.label}</span>
              <input inputMode="decimal" className={inputCls} placeholder={peso(r.autoNetIncome)} value={show(o.net_income)}
                onChange={(e) => set(r.buCode, 'net_income', parse(e.target.value))} />
              <input inputMode="decimal" className={inputCls} placeholder={peso(r.autoLaborCost)} value={show(o.labor_cost)}
                onChange={(e) => set(r.buCode, 'labor_cost', parse(e.target.value))} />
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">Saved. See the ROI on Labor report.</p>}
      <div className="flex gap-3">
        <button onClick={() => navigate('/')} className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">Done</button>
        <button onClick={save} disabled={saving} className="flex-1 rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save Overrides'}</button>
      </div>
    </div>
  );
}
