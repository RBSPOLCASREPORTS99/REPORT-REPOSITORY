import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchRanges, type RangeRow } from '../lib/queries';
import { useBuLabels } from '../contexts/BuLabelsContext';
import { BU_PARAM_CONFIG, configWithCustomItems, customGroupsFor, type CustomItem } from '../lib/params/paramConfig';
import { addCustomItem, deleteCustomItem, fetchCustomItems, loadBuParameterInputs, loadBuParameterStd, renameCustomItem, saveBuParameters, saveBuParameterStd } from '../lib/params/paramQueries';
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
  const [items, setItems] = useState<CustomItem[]>([]);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [addDrafts, setAddDrafts] = useState<Record<string, string>>({});
  const [itemBusy, setItemBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchRanges()
      // Enter parameters per month; YTD / quarter figures auto-combine from these.
      .then((all) => { const r = all.filter((x) => x.kind === 'month'); setRanges(r); if (r.length > 0) setRangeId((id) => id || r[0].id); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!rangeId || !buCode) return;
    setSaved(false);
    Promise.all([loadBuParameterInputs(rangeId, buCode), loadBuParameterStd(buCode)])
      .then(([v, s]) => { setValues(v); setStd(s); })
      .catch((e) => setError(e.message));
  }, [rangeId, buCode]);

  // User-defined items for the selected BU (open-ended groups only).
  const reloadItems = () => fetchCustomItems(buCode).then((it) => {
    setItems(it);
    setLabelDrafts(Object.fromEntries(it.map((i) => [i.itemKey, i.label])));
  });
  useEffect(() => {
    setItems([]); setLabelDrafts({});
    if (buCode) reloadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buCode]);

  // Effective config = built-in params + injected custom items.
  const config = useMemo(() => configWithCustomItems(buCode, items) ?? BU_PARAM_CONFIG[buCode], [buCode, items]);
  const showStdCol = !config?.noStd;
  const customGroups = customGroupsFor(buCode);
  const customKeys = useMemo(() => new Set(items.map((i) => i.itemKey)), [items]);

  async function handleAddItem(groupKey: string) {
    const label = (addDrafts[groupKey] ?? '').trim();
    if (!label) return;
    setItemBusy(true); setError('');
    try { await addCustomItem(buCode, groupKey, label); setAddDrafts((d) => ({ ...d, [groupKey]: '' })); await reloadItems(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not add the item.'); }
    finally { setItemBusy(false); }
  }
  async function handleRenameItem(itemKey: string) {
    const label = (labelDrafts[itemKey] ?? '').trim();
    const current = items.find((i) => i.itemKey === itemKey)?.label ?? '';
    if (!label || label === current) { setLabelDrafts((d) => ({ ...d, [itemKey]: current })); return; }
    setItemBusy(true); setError('');
    try { await renameCustomItem(buCode, itemKey, label); await reloadItems(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not rename the item.'); }
    finally { setItemBusy(false); }
  }
  async function handleDeleteItem(itemKey: string, label: string) {
    if (!window.confirm(`Remove "${label}"? Its values in every period will be deleted.`)) return;
    setItemBusy(true); setError('');
    try {
      await deleteCustomItem(buCode, itemKey);
      setValues((v) => { const n = { ...v }; delete n[itemKey]; return n; });
      await reloadItems();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not remove the item.'); }
    finally { setItemBusy(false); }
  }

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
  if (!config) return null;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Business Parameters — entry</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Type each BU's operational parameters and STD (target) per <span className="font-medium">month</span> — YTD and
        quarter figures combine these automatically (quantities sum, rates average). Parameters marked
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
        <div className={`grid ${showStdCol ? 'grid-cols-[1fr_7rem_9rem]' : 'grid-cols-[1fr_9rem]'} items-center gap-3 border-b border-slate-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:text-slate-500`}>
          <span>Parameter</span>{showStdCol && <span className="text-right">STD</span>}<span className="text-right">Value (this period)</span>
        </div>
        {config.params.filter((p) => !p.hidden).map((p, i, list) => {
          const manual = p.source.kind === 'manual';
          const showHeader = !!p.group && p.group !== list[i - 1]?.group;
          const isCustom = customKeys.has(p.key);
          // Show the "Add item" control just above an open-ended group's Total row.
          const addGroup = p.groupTotal ? customGroups.find((g) => g.totalKey === p.key) : undefined;
          return (
            <Fragment key={p.key}>
            {showHeader && (
              <div className="border-b border-slate-200 bg-slate-100/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:border-slate-700/60 dark:bg-slate-700/50 dark:text-indigo-300">{p.group}</div>
            )}
            {addGroup && (
              <div className={`grid ${showStdCol ? 'grid-cols-[1fr_7rem_9rem]' : 'grid-cols-[1fr_9rem]'} items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-2 dark:border-slate-700/60 dark:bg-slate-700/20`}>
                <div className="flex items-center gap-2 pl-4">
                  <input
                    value={addDrafts[addGroup.groupKey] ?? ''}
                    onChange={(e) => setAddDrafts((d) => ({ ...d, [addGroup.groupKey]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddItem(addGroup.groupKey); } }}
                    placeholder="New item name…"
                    className="w-full max-w-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:border-slate-400 focus:outline-none" />
                  <button type="button" onClick={() => handleAddItem(addGroup.groupKey)} disabled={itemBusy || !(addDrafts[addGroup.groupKey] ?? '').trim()}
                    className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40">+ Add</button>
                </div>
                {showStdCol && <span />}<span />
              </div>
            )}
            <div className={`grid ${showStdCol ? 'grid-cols-[1fr_7rem_9rem]' : 'grid-cols-[1fr_9rem]'} items-center gap-3 border-b border-slate-100 px-4 py-2 dark:border-slate-700/60`}>
              {isCustom ? (
                <span className="flex items-center gap-1.5 pl-4">
                  <input
                    value={labelDrafts[p.key] ?? p.label}
                    onChange={(e) => setLabelDrafts((d) => ({ ...d, [p.key]: e.target.value }))}
                    onBlur={() => handleRenameItem(p.key)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    disabled={itemBusy}
                    title="Rename this item"
                    className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-slate-700 hover:border-slate-200 focus:border-slate-400 focus:bg-white focus:outline-none dark:text-slate-200 dark:hover:border-slate-700 dark:focus:bg-slate-800" />
                  <button type="button" onClick={() => handleDeleteItem(p.key, p.label)} disabled={itemBusy}
                    title="Remove this item" aria-label={`Remove ${p.label}`}
                    className="shrink-0 rounded px-1.5 text-slate-400 hover:text-red-600 disabled:opacity-40">✕</button>
                </span>
              ) : (
                <span className={`text-sm text-slate-700 dark:text-slate-200 ${p.group ? 'pl-4' : ''}`}>{p.label}</span>
              )}
              {showStdCol && <NumberInput value={std[p.key]}
                onChange={(n) => { setStd((s) => ({ ...s, [p.key]: n })); setSaved(false); }}
                className="w-28 rounded border border-slate-200 dark:border-slate-700 px-2 py-1 text-right tabular-nums focus:border-slate-400 focus:outline-none" />}
              {manual ? (
                <NumberInput value={values[p.key]}
                  onChange={(n) => { setValues((v) => ({ ...v, [p.key]: n })); setSaved(false); }}
                  className="w-32 rounded border border-slate-200 dark:border-slate-700 px-2 py-1 text-right tabular-nums focus:border-slate-400 focus:outline-none" />
              ) : (
                <span className="text-right text-xs text-slate-400 dark:text-slate-500">auto ({p.source.kind === 'pnl' ? 'from P&L' : p.source.kind === 'external' ? 'computed' : 'derived'})</span>
              )}
            </div>
            </Fragment>
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
