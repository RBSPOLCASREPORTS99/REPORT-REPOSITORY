import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listTruckingMonths, loadMonthSalaries, saveMonthSalaries, type TruckingMonth } from '../lib/truckingRecompute';
import { TRUCKS } from '../lib/pnl/truckConfig';

// Finance-only screen to enter each truck's Salaries and Wages for a month.
// QuickBooks posts BU10 salaries in total, so Finance splits it per truck here;
// it overrides the QB salaries line in the Simulated P&L per Truck.
export default function TruckingEntry() {
  const navigate = useNavigate();
  const [months, setMonths] = useState<TruckingMonth[]>([]);
  const [monthId, setMonthId] = useState('');
  const [salaries, setSalaries] = useState<Record<string, number>>({});
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
    loadMonthSalaries(monthId).then(setSalaries).catch((e) => setError(e.message));
  }, [monthId]);

  const month = months.find((m) => m.id === monthId);

  async function handleSave() {
    if (!month) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      await saveMonthSalaries(month.id, salaries);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-slate-400 dark:text-slate-500">Loading…</p>;
  if (months.length === 0) return <p className="text-slate-400 dark:text-slate-500">Import a monthly P&L first.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Salaries and Wages per Truck</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Enter each truck's Salaries and Wages (₱ thousands) for the selected month. QuickBooks posts
        BU10 salaries in total, so this per-truck split overrides the QB salaries in the Simulated P&amp;L
        per Truck. Trucking allocation is taken from the imported TRUCKING DASHBOARD.
      </p>

      <label className="flex items-center gap-2 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-200">Month</span>
        <select value={monthId} onChange={(e) => setMonthId(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-base">
          {months.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl bg-white dark:bg-slate-800 p-3 shadow-sm sm:grid-cols-3">
        {TRUCKS.map((t) => (
          <label key={t.code} className="flex items-center gap-2 text-sm">
            <span className="w-14 shrink-0 text-slate-600 dark:text-slate-300">{t.code}</span>
            <input type="number" inputMode="decimal" value={salaries[t.code] || ''}
              onChange={(e) => { setSalaries((s) => ({ ...s, [t.code]: e.target.value === '' ? 0 : Number(e.target.value) })); setSaved(false); }}
              className="min-w-0 flex-1 rounded border border-slate-200 dark:border-slate-700 px-2 py-1 text-right tabular-nums focus:border-slate-400 focus:outline-none" placeholder="0" />
          </label>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">Saved. The Truck P&L will use these salaries.</p>}

      <div className="flex gap-3">
        <button onClick={() => navigate('/')} className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">Done</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
