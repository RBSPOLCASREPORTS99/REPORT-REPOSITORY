import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchRanges, type RangeRow } from '../lib/queries';
import { FARM_INPUT_LINES, deriveFarmLines, loadFarmInputs, saveFarmEntry, computeFarmAllocations, type FarmInputs } from '../lib/farmEntry';
import { formatThousands } from '../lib/format';

// Manual entry for Lakatan Farm (BU08LF), which is hand-typed in the Excel
// workbook rather than computed from QuickBooks.
export default function FarmEntry() {
  const navigate = useNavigate();
  const [ranges, setRanges] = useState<RangeRow[]>([]);
  const [rangeId, setRangeId] = useState<string>('');
  const [inputs, setInputs] = useState<FarmInputs>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchRanges()
      .then((r) => {
        setRanges(r);
        if (r.length > 0) setRangeId(r[0].id);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!rangeId) return;
    setSaved(false);
    loadFarmInputs(rangeId).then(setInputs).catch((e) => setError(e.message));
  }, [rangeId]);

  const derived = deriveFarmLines(inputs);

  function setField(key: string, raw: string) {
    const num = raw === '' ? 0 : Number(raw);
    if (Number.isNaN(num)) return;
    setInputs((prev) => ({ ...prev, [key]: num }));
    setSaved(false);
  }

  async function autoAllocate() {
    setError('');
    try {
      const res = await computeFarmAllocations(rangeId, inputs.gross_sales ?? 0);
      if (!res) { setError("This period's company pools aren't imported yet — import the month's P&L first."); return; }
      setInputs((prev) => ({ ...prev, ...res }));
      setSaved(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Auto-compute failed.');
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await saveFarmEntry(rangeId, inputs);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-slate-400 dark:text-slate-500">Loading…</p>;
  if (ranges.length === 0) return <p className="text-slate-400 dark:text-slate-500">Import a BR report first to create periods.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Lakatan Farm — manual entry</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        The Farm's P&amp;L is entered by hand (it isn't in QuickBooks). Values in ₱ thousands.
        Subtotals and Net Income are computed automatically.
      </p>

      <label className="block text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-200">Period</span>
        <select value={rangeId} onChange={(e) => setRangeId(e.target.value)}
          className="mt-1 block rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-base">
          {ranges.map((r) => <option key={r.id} value={r.id}>{r.label}{!r.is_published ? ' (draft)' : ''}</option>)}
        </select>
      </label>

      <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl bg-white dark:bg-slate-800 shadow-sm">
        {FARM_INPUT_LINES.map((line) => (
          <div key={line.key} className="grid grid-cols-[1fr_auto] items-center gap-2 px-4 py-2">
            <span className="text-sm text-slate-600 dark:text-slate-300">
              {line.label}
              {line.farmHint && <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">({line.farmHint})</span>}
            </span>
            <input type="number" inputMode="decimal" value={inputs[line.key] || ''}
              onChange={(e) => setField(line.key, e.target.value)}
              className="w-32 rounded border border-slate-200 dark:border-slate-700 px-2 py-1 text-right tabular-nums focus:border-slate-400 focus:outline-none"
              placeholder="0" />
          </div>
        ))}
      </div>

      <button onClick={autoAllocate}
        className="w-full rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-300 sm:w-auto">
        ⚙ Auto-compute allocated &amp; support centers (% of Gross Sales)
      </button>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Fills Admin (allocated), Cost of Money, and Support Finance / HR / Management as (Farm Gross Sales ÷ company Gross Sales) × each company pool for this period. Review, then Save.
      </p>

      <div className="flex items-center justify-between rounded-2xl bg-brand-600 px-4 py-3 text-white">
        <span className="text-sm">Net Income (computed)</span>
        <span className="text-lg font-semibold tabular-nums">₱{formatThousands(derived.net_income)}k</span>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">Saved.</p>}

      <div className="flex gap-3">
        <button onClick={() => navigate('/')} className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">Done</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Farm P&L'}
        </button>
      </div>
    </div>
  );
}
