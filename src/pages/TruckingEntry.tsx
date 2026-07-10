import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listTruckingMonths, loadMonthSalaries, saveMonthSalaries, loadTruckReconcile, type TruckingMonth, type TruckReconcile } from '../lib/truckingRecompute';
import { TRUCKS } from '../lib/pnl/truckConfig';
import { GridSkeleton, Skeleton } from '../components/Skeleton';

const money = (v: number) => v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Finance-only screen to enter each truck's Salaries and Wages for a month.
// QuickBooks posts BU10 salaries in total, so Finance splits it per truck here;
// it overrides the QB salaries line in the Simulated P&L per Truck. The
// "Reconcile to QuickBooks" button prorates any variance between the manual
// split and the QB "Total BU10 - TRUCK" total across trucks by Gross Income.
export default function TruckingEntry() {
  const navigate = useNavigate();
  const [months, setMonths] = useState<TruckingMonth[]>([]);
  const [monthId, setMonthId] = useState('');
  const [salaries, setSalaries] = useState<Record<string, number>>({});
  const [recon, setRecon] = useState<TruckReconcile | null>(null);
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
    setRecon(null);
    loadMonthSalaries(monthId).then(setSalaries).catch((e) => setError(e.message));
    loadTruckReconcile(monthId).then(setRecon).catch((e) => setError(e.message));
  }, [monthId]);

  const month = months.find((m) => m.id === monthId);
  const manualSum = TRUCKS.reduce((s, t) => s + (salaries[t.code] || 0), 0);
  const bu10Total = recon?.bu10Total ?? null;
  const variance = bu10Total != null ? bu10Total - manualSum : 0;
  const reconciled = bu10Total != null && Math.abs(variance) < 0.005;

  // Prorate the variance (QB BU10 total − manual sum) across trucks by Gross
  // Income (Trucking Income − COGS), adding it to each truck's manual salary so
  // the per-truck total ties to QuickBooks. Idempotent: once reconciled, the
  // variance is 0 and re-clicking changes nothing.
  function handleReconcile() {
    if (!recon || recon.bu10Total == null) return;
    const codes = TRUCKS.map((t) => t.code);
    const base: Record<string, number> = {};
    for (const c of codes) base[c] = salaries[c] || 0;
    const currentSum = codes.reduce((s, c) => s + base[c], 0);
    const varc = recon.bu10Total - currentSum;
    const weights = codes.map((c) => Math.max(0, recon.grossByTruck[c] ?? 0));
    const totalW = weights.reduce((a, b) => a + b, 0);
    const alloc = totalW > 0 ? weights.map((w) => (varc * w) / totalW) : codes.map(() => varc / codes.length);
    const rounded = alloc.map((a) => Math.round(a * 100) / 100);
    // push the rounding residual onto the largest-weight truck so the total ties exactly
    const residual = Math.round((varc - rounded.reduce((a, b) => a + b, 0)) * 100) / 100;
    let maxIdx = 0;
    for (let i = 1; i < weights.length; i++) if (weights[i] > weights[maxIdx]) maxIdx = i;
    rounded[maxIdx] = Math.round((rounded[maxIdx] + residual) * 100) / 100;
    const next: Record<string, number> = {};
    codes.forEach((c, i) => { next[c] = Math.round((base[c] + rounded[i]) * 100) / 100; });
    setSalaries(next);
    setSaved(false);
  }

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

  if (loading) return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-64" />
      <GridSkeleton />
    </div>
  );
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

      {/* Reconciliation to the QuickBooks BU10 total */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        {bu10Total == null ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            ⚠️ QuickBooks BU10 total Salaries and Wages isn't stored for this month yet. Re-import this
            month's QuickBooks P&amp;L to enable one-click reconciliation.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">QB BU10 total</div>
                <div className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">{money(bu10Total)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Your manual total</div>
                <div className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">{money(manualSum)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Variance</div>
                <div className={`tabular-nums font-semibold ${reconciled ? 'text-green-600' : variance < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                  {reconciled ? 'Reconciled ✓' : money(variance)}
                </div>
              </div>
            </div>
            <button
              onClick={handleReconcile}
              disabled={reconciled}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 sm:w-auto"
            >
              Reconcile to QuickBooks
            </button>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Adds the variance to each truck, prorated by Gross Income (Trucking Income − COGS). Review, then Save.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-2 rounded-2xl bg-white dark:bg-slate-800 p-3 shadow-sm sm:grid-cols-3 sm:gap-x-10">
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
