import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ComparisonControl, { type ComparisonState } from '../components/ComparisonControl';
import SetMonthSelect from '../components/SetMonthSelect';
import RoiLaborTable from '../components/RoiLaborTable';
import { TableSkeleton } from '../components/Skeleton';
import { fetchRanges, type RangeRow } from '../lib/queries';
import { fetchRoiLabor, type RoiRow } from '../lib/roiQueries';

// ROI on Labor per BU — ranked highest-first, with YTD / QTR / Month comparisons.
export default function RoiLabor() {
  const [ranges, setRanges] = useState<RangeRow[]>([]);
  const [cmp, setCmp] = useState<ComparisonState | null>(null);
  const [rows, setRows] = useState<RoiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reqRef = useRef(0);

  useEffect(() => { fetchRanges().then(setRanges).catch((e) => { setError(e.message); setLoading(false); }); }, []);

  useEffect(() => {
    if (!cmp?.currentId) { setRows([]); setLoading(false); return; }
    const myReq = ++reqRef.current;
    setLoading(true);
    fetchRoiLabor(cmp.currentId, cmp.priorId)
      .then((d) => { if (myReq === reqRef.current) setRows(d); })
      .catch((e) => { if (myReq === reqRef.current) setError((e as Error).message); })
      .finally(() => { if (myReq === reqRef.current) setLoading(false); });
  }, [cmp?.currentId, cmp?.priorId]);

  const priorLabel = cmp?.priorLabel ?? 'Prior';
  const currentLabel = cmp?.currentLabel ?? 'Current';
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="space-y-3">
      <Link to="/" className="text-sm text-slate-400 dark:text-slate-500">← All business units</Link>

      <div className="sticky top-14 z-30 -mx-4 space-y-2 border-b border-slate-200 bg-slate-50 px-4 py-2 lg:top-0 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 shrink truncate text-lg font-semibold text-slate-900 dark:text-slate-100">ROI on Labor per BU</h1>
          <div className="flex flex-1 justify-center"><SetMonthSelect ranges={ranges} /></div>
        </div>
        <ComparisonControl ranges={ranges} onChange={setCmp} showSetMonth={false} />
      </div>

      <p className="text-[11px] text-slate-400 dark:text-slate-500">ROI on Labor = Net Income from Ops ÷ Total Labor Cost. Auto-built from each BU's P&amp;L; Finance can override figures in Business Parameters.</p>
      {loading ? <TableSkeleton /> : <RoiLaborTable rows={rows} priorLabel={priorLabel} currentLabel={currentLabel} />}
    </div>
  );
}
