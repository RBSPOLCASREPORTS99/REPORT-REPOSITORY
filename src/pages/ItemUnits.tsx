import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSalesItems, fetchItemUnits, saveItemUnit } from '../lib/queries';
import { ListSkeleton } from '../components/Skeleton';

interface Row { item: string; importedUom: string; uom: string; dirty?: boolean }

// Finance screen to set the Unit of Measure (U/M) shown per item in Sales Qty.
// The set value overrides whatever the import carried and is remembered.
export default function ItemUnits() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  function reload() {
    setLoading(true);
    Promise.all([fetchSalesItems(), fetchItemUnits()])
      .then(([items, overrides]) => {
        setRows(items.map((it) => ({ item: it.item, importedUom: it.importedUom, uom: overrides.get(it.item) || it.importedUom || '' })));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(reload, []);

  const filtered = useMemo(
    () => rows.filter((r) => r.item.toLowerCase().includes(q.trim().toLowerCase())),
    [rows, q],
  );

  function edit(item: string, uom: string) {
    setRows((rs) => rs.map((r) => (r.item === item ? { ...r, uom, dirty: true } : r)));
  }
  async function save(row: Row) {
    setSavingItem(row.item);
    setError('');
    try {
      await saveItemUnit(row.item, row.uom);
      setRows((rs) => rs.map((r) => (r.item === row.item ? { ...r, dirty: false } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSavingItem(null);
    }
  }

  const missing = rows.filter((r) => !r.uom).length;

  return (
    <div className="space-y-5">
      <Link to="/" className="inline-block text-sm text-slate-500 dark:text-slate-400">← Back to Home</Link>
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Item Units (U/M)</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Set the unit of measure shown for each item in <span className="font-medium">Sales Qty</span>.
          What you set here overrides the imported unit and is remembered.
          {missing > 0 && <span className="text-amber-600 dark:text-amber-500"> {missing} item{missing === 1 ? '' : 's'} without a unit.</span>}
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40">{error}</p>}

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search items…"
        className="block w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />

      {loading ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <p className="text-slate-400 dark:text-slate-500">No sales items imported yet.</p>
      ) : (
        <div className="divide-y divide-slate-100 rounded-2xl bg-white shadow-sm dark:divide-slate-700 dark:bg-slate-800">
          {filtered.map((r) => (
            <div key={r.item} className="grid grid-cols-[1fr_7rem_auto] items-center gap-3 px-4 py-2.5">
              <span className="truncate text-sm text-slate-800 dark:text-slate-100" title={r.item}>{r.item}</span>
              <input
                value={r.uom}
                onChange={(e) => edit(r.item, e.target.value)}
                placeholder="e.g. kgs"
                className={`w-28 rounded-lg border px-2 py-1.5 text-sm ${r.uom ? 'border-slate-300 dark:border-slate-600' : 'border-amber-300 dark:border-amber-700'} dark:bg-slate-900 dark:text-slate-100`}
              />
              <button
                onClick={() => save(r)}
                disabled={!r.dirty || savingItem === r.item}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                {savingItem === r.item ? '…' : 'Save'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
