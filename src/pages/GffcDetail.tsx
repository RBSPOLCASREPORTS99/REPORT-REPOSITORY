import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ComparisonControl, { type ComparisonState } from '../components/ComparisonControl';
import SetMonthSelect from '../components/SetMonthSelect';
import GffcPnlTable from '../components/GffcPnlTable';
import { TableSkeleton } from '../components/Skeleton';
import { fetchRanges, type RangeRow } from '../lib/queries';
import { fetchGffcPnl, type GffcPnlLine, type Period } from '../lib/gffc/gffcQueries';
import { GFFC_LABEL } from '../lib/gffc/gffcConfig';

// GFFC - Chickboy Meating Place company screen. Phase 1: company Total P&L with
// the shared YTD / QTR / Month comparisons. (Expenses / Sales / per-branch next.)
export default function GffcDetail() {
  const [ranges, setRanges] = useState<RangeRow[]>([]);
  const [cmp, setCmp] = useState<ComparisonState | null>(null);
  const [lines, setLines] = useState<GffcPnlLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reqRef = useRef(0);

  useEffect(() => {
    fetchRanges().then(setRanges).catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const periodOf = (id?: string): Period | undefined => {
    const r = ranges.find((x) => x.id === id);
    return r ? { start: r.period_start, end: r.period_end } : undefined;
  };

  useEffect(() => {
    if (!cmp) return;
    const cur = periodOf(cmp.currentId);
    if (!cur) { setLines([]); setLoading(false); return; }
    const myReq = ++reqRef.current;
    setLoading(true);
    fetchGffcPnl(cur, periodOf(cmp.priorId))
      .then((res) => { if (myReq === reqRef.current) setLines(res.hasData ? res.lines : []); })
      .catch((e) => { if (myReq === reqRef.current) setError((e as Error).message); })
      .finally(() => { if (myReq === reqRef.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmp, ranges]);

  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="space-y-3">
      <Link to="/" className="text-sm text-slate-400 dark:text-slate-500">← All business units</Link>

      <div className="sticky top-14 z-30 -mx-4 space-y-2 border-b border-slate-200 bg-slate-50 px-4 py-2 lg:top-0 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 shrink truncate text-lg font-semibold text-slate-900 dark:text-slate-100">{GFFC_LABEL}</h1>
          <SetMonthSelect ranges={ranges} />
        </div>
        <ComparisonControl ranges={ranges} onChange={setCmp} showSetMonth={false} />
      </div>

      {loading ? (
        <TableSkeleton />
      ) : lines.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-slate-400 shadow-sm dark:bg-slate-800 dark:text-slate-500">
          No GFFC P&amp;L for this period yet. Import the GFFC workbook (P&amp;L 2025 / P&amp;L 2026).
        </p>
      ) : (
        <GffcPnlTable lines={lines} priorLabel={cmp?.priorLabel ?? 'Prior'} currentLabel={cmp?.currentLabel ?? 'Current'} />
      )}
    </div>
  );
}
