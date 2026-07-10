import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ComparisonControl, { type ComparisonState } from '../components/ComparisonControl';
import SetMonthSelect from '../components/SetMonthSelect';
import PnlTable from '../components/PnlTable';
import { TableSkeleton } from '../components/Skeleton';
import { fetchRanges, type RangeRow, type ComparisonLine } from '../lib/queries';
import { fetchCompanyPnl, PCAC_LABEL, type CompanyPeriod } from '../lib/companyQueries';

// Company-wide Total P&L for POLCAS AGRI TRADE CORP. — the QuickBooks grand-total
// column summed over the selected period, with the same YTD / QTR / Month
// comparisons as the BUs.
export default function CompanyPnl() {
  const [ranges, setRanges] = useState<RangeRow[]>([]);
  const [cmp, setCmp] = useState<ComparisonState | null>(null);
  const [lines, setLines] = useState<ComparisonLine[]>([]);
  const [hasData, setHasData] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reqRef = useRef(0);

  useEffect(() => {
    fetchRanges().then(setRanges).catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const periodOf = (id?: string): CompanyPeriod | undefined => {
    const r = ranges.find((x) => x.id === id);
    return r ? { start: r.period_start, end: r.period_end } : undefined;
  };

  useEffect(() => {
    if (!cmp) return;
    const cur = periodOf(cmp.currentId);
    if (!cur) { setLines([]); setHasData(false); setLoading(false); return; }
    const myReq = ++reqRef.current;
    setLoading(true);
    fetchCompanyPnl(cur, periodOf(cmp.priorId))
      .then((res) => { if (myReq === reqRef.current) { setLines(res.lines); setHasData(res.hasData); } })
      .catch((e) => { if (myReq === reqRef.current) setError((e as Error).message); })
      .finally(() => { if (myReq === reqRef.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmp, ranges]);

  const priorLabel = cmp?.priorLabel ?? 'Prior';
  const currentLabel = cmp?.currentLabel ?? 'Current';

  return (
    <div className="space-y-3">
      <Link to="/" className="text-sm text-slate-400 dark:text-slate-500">← Back to Home</Link>

      <div className="sticky top-14 z-30 -mx-4 space-y-2 border-b border-slate-200 bg-slate-50 px-4 py-2 lg:top-0 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 shrink truncate text-lg font-semibold text-slate-900 dark:text-slate-100">{PCAC_LABEL} · Total P&amp;L</h1>
          <SetMonthSelect ranges={ranges} />
        </div>
        <ComparisonControl ranges={ranges} onChange={setCmp} showSetMonth={false} />
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40">{error}</p>}

      {loading ? (
        <TableSkeleton />
      ) : !hasData || lines.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-slate-400 shadow-sm dark:bg-slate-800 dark:text-slate-500">
          No company P&amp;L for this period. Import the months' QuickBooks P&amp;L.
        </p>
      ) : (
        <PnlTable lines={lines} priorLabel={priorLabel} currentLabel={currentLabel} />
      )}
    </div>
  );
}
