import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchBuLabels, saveBuName, createBusinessUnit, type BuLabel } from '../lib/queries';
import { useBuLabels } from '../contexts/BuLabelsContext';

interface Row extends BuLabel { dirty?: boolean }

// Finance screen to set the proper display name (BU code + name) shown on the
// dashboard and BU detail, e.g. "BU01/02 - BODEGA 1 & 2".
export default function BuNames() {
  const { refresh } = useBuLabels();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [nu, setNu] = useState({ code: '', displayCode: '', name: '' });
  const [adding, setAdding] = useState(false);

  function reload() {
    setLoading(true);
    fetchBuLabels()
      .then((m) => setRows([...m.values()]))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(reload, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setAdding(true);
    try {
      await createBusinessUnit(nu.code, nu.displayCode, nu.name);
      setNu({ code: '', displayCode: '', name: '' });
      refresh();
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add failed.');
    } finally {
      setAdding(false);
    }
  }

  function edit(code: string, field: 'displayCode' | 'name', value: string) {
    setRows((rs) => rs.map((r) => (r.code === code ? { ...r, [field]: value, dirty: true } : r)));
  }

  async function save(row: Row) {
    setSavingCode(row.code);
    setError('');
    try {
      await saveBuName(row.code, row.displayCode, row.name);
      setRows((rs) => rs.map((r) => (r.code === row.code ? { ...r, dirty: false, label: `${row.displayCode || row.code} - ${row.name}`.toUpperCase() } : r)));
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSavingCode(null);
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-block text-sm text-slate-500 dark:text-slate-400">← Back to Home</Link>
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Business Unit Names</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Set how each unit is labelled on the dashboard and detail screens, shown as
          <span className="font-medium"> CODE - NAME</span> (e.g. <span className="font-medium">BU01/02 - BODEGA 1 &amp; 2</span>).
          BU01 and BU02 are always combined into one unit.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40">{error}</p>}

      {/* Add a new business unit */}
      <form onSubmit={handleAdd} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Add a new business unit</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Internal code *</label>
            <input value={nu.code} onChange={(e) => setNu({ ...nu, code: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" placeholder="BU12" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Shown code</label>
            <input value={nu.displayCode} onChange={(e) => setNu({ ...nu, displayCode: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" placeholder="BU12" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Name *</label>
            <input value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" placeholder="New Unit" />
          </div>
          <button type="submit" disabled={adding}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
            {adding ? 'Adding…' : 'Add unit'}
          </button>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Use the <span className="font-medium">same code it carries in QuickBooks</span> (e.g. <span className="font-medium">BU12</span>).
          The next P&L import will automatically read this unit's figures from the matching
          QuickBooks column — no further setup needed.
        </p>
      </form>

      {loading ? (
        <p className="text-slate-400 dark:text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.code} className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Internal code: {r.code}
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">BU Code (shown)</label>
                  <input
                    value={r.displayCode}
                    onChange={(e) => edit(r.code, 'displayCode', e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="BU01/02"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Business Unit Name</label>
                  <input
                    value={r.name}
                    onChange={(e) => edit(r.code, 'name', e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="Bodega 1 & 2"
                  />
                </div>
                <button
                  onClick={() => save(r)}
                  disabled={!r.dirty || savingCode === r.code}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {savingCode === r.code ? 'Saving…' : 'Save'}
                </button>
              </div>
              <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                Preview: <span className="font-semibold text-slate-600 dark:text-slate-300">{`${r.displayCode || r.code} - ${r.name}`.toUpperCase()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
