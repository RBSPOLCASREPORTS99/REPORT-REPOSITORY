import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchRanges, type RangeRow } from '../lib/queries';
import { useBuLabels } from '../contexts/BuLabelsContext';
import { BU_PARAM_CONFIG } from '../lib/params/paramConfig';
import { loadBuParameterInputs, loadBuParameterStd, saveBuParameters, saveBuParameterStd } from '../lib/params/paramQueries';
import { GridSkeleton, Skeleton } from '../components/Skeleton';
import NumberInput from '../components/NumberInput';

// Finance screen to type the manual parameters + STD targets per BU per period.
// P&L-sourced and derived (ratio) parameters compute automatically in the
// Parameters tab, so they're shown here as read-only.
export default function ParameterEntry() {
  const navigate = useNavigate();
  const { labelFor } = useBuLabels();
  const buCodes = Object.keys(BU_PARAM_CONFIG);
  const [buCode, setBuCode] = useState(buCodes[0] ?? '');
  const [ranges, setRanges] = useState<RangeRow[]>([]);
  const [rangeId, setRangeId] = useState('');
  const [values, setValues] = useState<Record<string, number>>({});
  const [std, setStd] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchRanges()
      .then((r) => { setRanges(r); if (r.length > 0) setRangeId((id) => id || r[0].id); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!rangeId || !buCode) return;
    setSaved(false);
    Promise.all([loadBuParameterInputs(rangeId, buCode), loadBuParameterStd(buCode)])
      .then(([v, s]) => { setValues(v); setStd(s); })
      .catch((e) => setError(e.message));
  }, [rangeId, buCode]);

  const config = BU_PARAM_CONFIG[buCode];

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false);
    try {
      await saveBuParameters(rangeId, buCode, values);
      await saveBuParameterStd(buCode, std);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="space-y-4"><Skeleton className="h-6 w-64" /><GridSkeleton /></div>;
  if (ranges.length === 0) return <p className="text-slate-400 dark:text-slate-500">Import a monthly P&L first to create periods.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Business Parameters — entry</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Type each BU's operational parameters and STD (target) per period. Parameters marked
        <span className="font-medium"> auto</span> are computed from the P&amp;L or derived from other rows and appear in the Parameters tab.
      </p>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-200">BU</span>
          <select value={buCode} onChange={(e) => setBuCode(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-base">
            {buCodes.map((c) => <option key={c} value={c}>{labelFor(c)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-200">Period</span>
          <select value={rangeId} onChange={(e) => setRangeId(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-base">
            {ranges.map((r) => <option key={r.id} value={r.id}>{r.label}{!r.is_published ? ' (draft)' : ''}</option>)}
          </select>
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-slate-800">
        <div className="grid grid-cols-[1fr_7rem_9rem] items-center gap-3 border-b border-slate-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:text-slate-500">
          <span>Parameter</span><span className="text-right">STD</span><span className="text-right">Value (this period)</span>
        </div>
        {config.params.filter((p) => !p.hidden).map((p) => {
          const manual = p.source.kind === 'manual';
          return (
            <div key={p.key} className="grid grid-cols-[1fr_7rem_9rem] items-center gap-3 border-b border-slate-100 px-4 py-2 dark:border-slate-700/60">
              <span className="text-sm text-slate-700 dark:text-slate-200">{p.label}</span>
              <NumberInput value={std[p.key]}
                onChange={(n) => { setStd((s) => ({ ...s, [p.key]: n })); setSaved(false); }}
                className="w-28 rounded border border-slate-200 dark:border-slate-700 px-2 py-1 text-right tabular-nums focus:border-slate-400 focus:outline-none" />
              {manual ? (
                <NumberInput value={values[p.key]}
                  onChange={(n) => { setValues((v) => ({ ...v, [p.key]: n })); setSaved(false); }}
                  className="w-32 rounded border border-slate-200 dark:border-slate-700 px-2 py-1 text-right tabular-nums focus:border-slate-400 focus:outline-none" />
              ) : (
                <span className="text-right text-xs text-slate-400 dark:text-slate-500">auto ({p.source.kind === 'pnl' ? 'from P&L' : 'derived'})</span>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">Saved. See the BU's Parameters tab.</p>}

      <div className="flex gap-3">
        <button onClick={() => navigate('/')} className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">Done</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Parameters'}
        </button>
      </div>
    </div>
  );
}
