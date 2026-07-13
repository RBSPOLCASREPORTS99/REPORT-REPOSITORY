import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ComparisonControl, { type ComparisonState } from '../components/ComparisonControl';
import SetMonthSelect from '../components/SetMonthSelect';
import GffcPnlTable from '../components/GffcPnlTable';
import { TableSkeleton } from '../components/Skeleton';
import { fetchRanges, type RangeRow } from '../lib/queries';
import { fetchSupportPnl, saveSupportPct, unitBySlug, type SupportPnlResult } from '../lib/supportQueries';
import type { GffcPnlLine } from '../lib/gffc/gffcQueries';
import { useAuth } from '../contexts/AuthContext';

// Simulated Support-Unit P&L (Finance / HR / Management): revenue = % of company
// revenue (manual %), expenses actual from the P&L-per-Class import.
export default function SupportPnl() {
  const { unit: slug } = useParams<{ unit: string }>();
  const meta = unitBySlug(slug);
  const { profile } = useAuth();
  const [ranges, setRanges] = useState<RangeRow[]>([]);
  const [cmp, setCmp] = useState<ComparisonState | null>(null);
  const [res, setRes] = useState<SupportPnlResult | null>(null);
  const [pctText, setPctText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reqRef = useRef(0);

  useEffect(() => { fetchRanges().then(setRanges).catch((e) => { setError(e.message); setLoading(false); }); }, []);

  useEffect(() => {
    if (!meta || !cmp?.currentId) { setRes(null); setLoading(false); return; }
    const myReq = ++reqRef.current;
    setLoading(true);
    fetchSupportPnl(meta.unit, cmp.currentId, cmp.priorId)
      .then((d) => { if (myReq === reqRef.current) { setRes(d); setPctText((d.pct * 100).toString()); } })
      .catch((e) => { if (myReq === reqRef.current) setError((e as Error).message); })
      .finally(() => { if (myReq === reqRef.current) setLoading(false); });
  }, [meta, cmp?.currentId, cmp?.priorId]);

  async function savePct() {
    if (!meta) return;
    const pct = Number(pctText.replace(/,/g, '')) / 100;
    if (Number.isNaN(pct)) return;
    try { await saveSupportPct(meta.unit, pct); if (cmp?.currentId) { const d = await fetchSupportPnl(meta.unit, cmp.currentId, cmp.priorId); setRes(d); } }
    catch (e) { setError((e as Error).message); }
  }

  if (!meta) return <p className="text-red-600">Unknown report.</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  const priorLabel = cmp?.priorLabel ?? 'Prior';
  const currentLabel = cmp?.currentLabel ?? 'Current';

  return (
    <div className="space-y-3">
      <Link to="/" className="text-sm text-slate-400 dark:text-slate-500">← All business units</Link>

      <div className="sticky top-14 z-30 -mx-4 space-y-2 border-b border-slate-200 bg-slate-50 px-4 py-2 lg:top-0 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 shrink truncate text-lg font-semibold text-slate-900 dark:text-slate-100">{meta.label} <span className="text-xs font-normal text-slate-400">· simulated</span></h1>
          <div className="flex flex-1 justify-center"><SetMonthSelect ranges={ranges} /></div>
        </div>
        <ComparisonControl ranges={ranges} onChange={setCmp} showSetMonth={false} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-400 dark:text-slate-500">Revenue = % of revenue (or per transaction / PAX); expenses actual from the P&amp;L-per-Class import.</p>
        <div className="flex shrink-0 items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            % of Revenue
            {profile?.role === 'finance' ? (
              <input value={pctText} onChange={(e) => setPctText(e.target.value)} onBlur={savePct}
                className="w-16 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-0.5 text-right tabular-nums focus:border-slate-400 focus:outline-none" />
            ) : <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">{((res?.pct ?? 0) * 100).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>}
            %
          </label>
          {profile?.role === 'finance' && (
            <Link to="/support-entry" title="Method & inputs" aria-label="Method and inputs"
              className="rounded-lg bg-slate-100 px-2 py-1 text-sm text-slate-600 dark:bg-slate-700 dark:text-slate-300">✎</Link>
          )}
        </div>
      </div>

      {loading ? <TableSkeleton /> : !res?.hasData ? (
        <p className="rounded-2xl bg-white p-6 text-center text-slate-400 shadow-sm dark:bg-slate-800 dark:text-slate-500">No data for this period. Import the monthly P&amp;L (which now captures Finance / HR / Management expenses).</p>
      ) : (
        <GffcPnlTable lines={res.lines as GffcPnlLine[]} priorLabel={priorLabel} currentLabel={currentLabel} />
      )}
    </div>
  );
}
