import { useEffect, useState } from 'react';
import { fetchRanges, setRangePublished, type RangeRow } from '../lib/queries';

// Finance-only screen to control which periods BU Heads and the GM can see.
export default function PublishManager() {
  const [ranges, setRanges] = useState<RangeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchRanges()
      .then(setRanges)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(range: RangeRow) {
    setBusyId(range.id);
    setError('');
    try {
      await setRangePublished(range.id, !range.is_published);
      setRanges((prev) => prev.map((r) => (r.id === range.id ? { ...r, is_published: !r.is_published } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Publish periods</h1>
      <p className="text-sm text-slate-500">
        Published periods are visible to Business Unit Heads and the General Manager. Unpublished
        periods are drafts only Finance can see.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="divide-y divide-slate-100 rounded-2xl bg-white shadow-sm">
        {ranges.length === 0 && <p className="px-4 py-6 text-slate-400">No periods imported yet.</p>}
        {ranges.map((r) => (
          <div key={r.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <span className="font-medium text-slate-900">{r.label}</span>
              <span className="ml-2 text-xs text-slate-400">
                {r.period_start} → {r.period_end}
              </span>
            </div>
            <button
              onClick={() => toggle(r)}
              disabled={busyId === r.id}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50 ${
                r.is_published
                  ? 'bg-green-100 text-green-800'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {busyId === r.id ? '…' : r.is_published ? 'Published' : 'Draft'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
