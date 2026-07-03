import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listTruckingMonths, loadMonthTrucking, saveMonthTrucking, type TruckingMonth } from '../lib/truckingRecompute';
import { TRUCKING_CODES } from '../lib/pnl/buConfig';
import type { TruckingInputs } from '../lib/pnl/computeBuPnl';

// Finance-only screen to edit a month's per-BU trucking cost. Saving re-derives
// the year's ranges so the P&L (month + YTD + quarter) refreshes.
export default function TruckingEntry() {
  const navigate = useNavigate();
  const [months, setMonths] = useState<TruckingMonth[]>([]);
  const [monthId, setMonthId] = useState('');
  const [trucking, setTrucking] = useState<TruckingInputs>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listTruckingMonths()
      .then((m) => { setMonths(m); if (m.length > 0) setMonthId(m[0].id); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!monthId) return;
    setSaved(false);
    loadMonthTrucking(monthId).then(setTrucking).catch((e) => setError(e.message));
  }, [monthId]);

  const month = months.find((m) => m.id === monthId);

  async function handleSave() {
    if (!month) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      await saveMonthTrucking(month.id, month.year, trucking);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-slate-400">Loading…</p>;
  if (months.length === 0) return <p className="text-slate-400">Import a monthly P&L first.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Trucking cost per BU</h1>
      <p className="text-sm text-slate-500">
        Enter each BU's trucking cost (₱ thousands) for the selected month. On save, the P&amp;L is
        recomputed — each BU's trucking allocation = its % share × the total BU10 trucking cost from
        QuickBooks — and the month's YTD and quarter figures refresh.
      </p>

      <label className="flex items-center gap-2 text-sm">
        <span className="font-medium text-slate-700">Month</span>
        <select value={monthId} onChange={(e) => setMonthId(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base">
          {months.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-3 shadow-sm sm:grid-cols-3">
        {TRUCKING_CODES.map((code) => (
          <label key={code} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-slate-600">{code}</span>
            <input type="number" inputMode="decimal" value={trucking[code] || ''}
              onChange={(e) => { setTrucking((t) => ({ ...t, [code]: e.target.value === '' ? 0 : Number(e.target.value) })); setSaved(false); }}
              className="w-24 rounded border border-slate-200 px-2 py-1 text-right tabular-nums focus:border-slate-400 focus:outline-none" placeholder="0" />
          </label>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">Saved and P&L recomputed.</p>}

      <div className="flex gap-3">
        <button onClick={() => navigate('/')} className="flex-1 rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700">Done</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
          {saving ? 'Recomputing…' : 'Save & recompute'}
        </button>
      </div>
    </div>
  );
}
