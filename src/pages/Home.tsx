import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ComparisonControl, { type ComparisonState } from '../components/ComparisonControl';
import SetMonthSelect from '../components/SetMonthSelect';
import BuCard, { type CardDnd } from '../components/BuCard';
import CombinedCard, { type CombinedCardData } from '../components/CombinedCard';
import TruckingCard from '../components/TruckingCard';
import GffcCard from '../components/GffcCard';
import CompanyCard from '../components/CompanyCard';
import { BuCardsSkeleton } from '../components/Skeleton';
import { fetchGffcPnl, type GffcPnlResult } from '../lib/gffc/gffcQueries';
import { fetchCompanyPnl } from '../lib/companyQueries';
import AllocMethodToggle from '../components/AllocMethodToggle';
import { useBuLabels } from '../contexts/BuLabelsContext';
import { useCombine } from '../contexts/CombineContext';
import { fetchBuCards, fetchRanges, rangesWithSupport, fetchTruckPnl, type BuCardData, type BuMetric, type RangeRow, type AllocMethod, type TruckPnlResult } from '../lib/queries';

export default function Home() {
  const { profile } = useAuth();
  const canSeeReports = profile?.role === 'finance' || profile?.role === 'gm';
  const { refresh: refreshLabels, labelFor } = useBuLabels();
  const { groups, combine, uncombine } = useCombine();
  const [dragCode, setDragCode] = useState<string | null>(null);
  const [overCode, setOverCode] = useState<string | null>(null);
  const [ranges, setRanges] = useState<RangeRow[]>([]);
  const [cmp, setCmp] = useState<ComparisonState | null>(null);
  const [cards, setCards] = useState<BuCardData[]>([]);
  const [truck, setTruck] = useState<TruckPnlResult | null>(null);
  const [gffc, setGffc] = useState<GffcPnlResult | null>(null);
  const [company, setCompany] = useState<{ net: number; priorNet: number; grossSales: number } | null>(null);
  const [method, setMethod] = useState<AllocMethod>('gross_sales');
  const [buMetric, setBuMetric] = useState<BuMetric>('net_income');
  const [supportRanges, setSupportRanges] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0); // bump to re-fetch
  const [error, setError] = useState('');

  const currentId = cmp?.currentId;
  const methodAvailable = !!currentId && supportRanges.has(currentId);
  const reqRef = useRef(0); // guards against out-of-order responses

  useEffect(() => {
    Promise.all([fetchRanges(), rangesWithSupport()])
      .then(([r, sup]) => {
        setRanges(r);
        setSupportRanges(sup);
        if (r.length === 0) setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [tick]);

  useEffect(() => {
    if (!methodAvailable && method !== 'gross_sales') setMethod('gross_sales');
  }, [methodAvailable, method]);

  useEffect(() => {
    const cur = cmp?.currentId;
    if (!cur) { setCards([]); return; }
    const prior = cmp?.priorId;
    const myReq = ++reqRef.current;
    setLoading(true);

    // Fetch, with one automatic retry if an unexpected empty result comes back
    // (covers a transient race just after import / range publish).
    const run = (attempt: number): Promise<void> =>
      fetchBuCards(cur, prior, method).then((data) => {
        if (myReq !== reqRef.current) return; // superseded by a newer request
        if (data.length === 0 && attempt === 0) {
          return new Promise<void>((res) => setTimeout(() => res(run(1)), 500));
        }
        setCards(data);
      });

    run(0)
      .catch((e) => { if (myReq === reqRef.current) setError(e.message); })
      .finally(() => { if (myReq === reqRef.current) setLoading(false); });
  }, [cmp?.currentId, cmp?.priorId, method, tick]);

  // BU10 - TRUCKING card: Simulated per-truck P&L for the current comparison
  // (finance-only). Hidden when there's no truck data / the viewer can't read it.
  useEffect(() => {
    const curR = ranges.find((r) => r.id === cmp?.currentId);
    if (!curR) { setTruck(null); return; }
    const priR = ranges.find((r) => r.id === cmp?.priorId);
    let cancelled = false;
    fetchTruckPnl(
      { start: curR.period_start, end: curR.period_end },
      priR ? { start: priR.period_start, end: priR.period_end } : undefined,
    )
      .then((t) => { if (!cancelled) setTruck(t.hasData ? t : null); })
      .catch(() => { if (!cancelled) setTruck(null); });
    return () => { cancelled = true; };
  }, [cmp?.currentId, cmp?.priorId, ranges, tick]);

  // GFFC - Chickboy Meating Place card: company Net Income for the current
  // comparison (finance-only data; hidden for others / when empty).
  useEffect(() => {
    const curR = ranges.find((r) => r.id === cmp?.currentId);
    if (!curR) { setGffc(null); return; }
    const priR = ranges.find((r) => r.id === cmp?.priorId);
    let cancelled = false;
    fetchGffcPnl(
      { start: curR.period_start, end: curR.period_end },
      priR ? { start: priR.period_start, end: priR.period_end } : undefined,
    )
      .then((g) => { if (!cancelled) setGffc(g.hasData ? g : null); })
      .catch(() => { if (!cancelled) setGffc(null); });
    return () => { cancelled = true; };
  }, [cmp?.currentId, cmp?.priorId, ranges, tick]);

  // Company-wide Total P&L card (POLCAS AGRI TRADE CORP.) — finance-only; hidden
  // for others / when there's no company data.
  useEffect(() => {
    const curR = ranges.find((r) => r.id === cmp?.currentId);
    if (!curR) { setCompany(null); return; }
    const priR = ranges.find((r) => r.id === cmp?.priorId);
    let cancelled = false;
    fetchCompanyPnl(
      { start: curR.period_start, end: curR.period_end },
      priR ? { start: priR.period_start, end: priR.period_end } : undefined,
    )
      .then((c) => { if (!cancelled) setCompany(c.hasData ? { net: c.net, priorNet: c.priorNet, grossSales: c.grossSales } : null); })
      .catch(() => { if (!cancelled) setCompany(null); });
    return () => { cancelled = true; };
  }, [cmp?.currentId, cmp?.priorId, ranges, tick]);

  const refresh = useCallback(() => {
    setError('');
    refreshLabels();
    setTick((t) => t + 1);
  }, [refreshLabels]);

  // Combined boxes (session-only): each group of 2+ BUs sums its members' cards.
  const groupedCodes = new Set(groups.flat());
  const groupCards = groups
    .map((g) => {
      const members = cards.filter((c) => g.includes(c.buCode));
      if (members.length < 2) return null;
      const sum = (get: (m: BuCardData) => number) => members.reduce((s, m) => s + get(m), 0);
      const netIncome = sum((m) => m.netIncome);
      const diff = sum((m) => m.diff);
      const prior = netIncome - diff;
      const netIncomeOps = sum((m) => m.netIncomeOps);
      const opsDiff = sum((m) => m.opsDiff);
      const opsPrior = netIncomeOps - opsDiff;
      const data: CombinedCardData = {
        codes: members.map((m) => m.buCode),
        labels: members.map((m) => labelFor(m.buCode)),
        netIncome, diff, pctDiff: prior !== 0 ? diff / prior : 0,
        netIncomeOps, opsDiff, opsPctDiff: opsPrior !== 0 ? opsDiff / opsPrior : 0,
        grossSales: sum((m) => m.grossSales),
      };
      return { key: data.codes.join('+'), data };
    })
    .filter((x): x is { key: string; data: CombinedCardData } => x !== null);
  // Auto-hide BUs with zero Net Income (no transactions this period, or closed).
  const standalone = cards.filter((c) => !groupedCodes.has(c.buCode) && c.netIncome !== 0);

  const dndFor = (code: string): CardDnd => ({
    onDragStart: () => setDragCode(code),
    onDragEnd: () => { setDragCode(null); setOverCode(null); },
    onDragOver: () => setOverCode(code),
    onDragLeave: () => setOverCode((k) => (k === code ? null : k)),
    onDrop: () => { if (dragCode && dragCode !== code) combine(dragCode, code); setDragCode(null); setOverCode(null); },
    isOver: overCode === code && dragCode !== null && dragCode !== code,
    isDragging: dragCode === code,
  });

  if (error) return (
    <div className="space-y-3">
      <p className="text-red-600">{error}</p>
      <button onClick={refresh} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">↻ Try again</button>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="min-w-0 shrink truncate text-lg font-semibold text-slate-900 dark:text-slate-100">Business Units</h1>
        <div className="flex flex-1 justify-center">
          <SetMonthSelect ranges={ranges} />
        </div>
        <select value={buMetric} onChange={(e) => setBuMetric(e.target.value as BuMetric)}
          title="Value shown in each BU box"
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <option value="net_income">Net Income</option>
          <option value="net_income_ops">Net Income from Ops</option>
        </select>
        <button onClick={refresh} title="Reload data" aria-label="Refresh"
          className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1.5 text-base font-medium leading-none text-slate-700 dark:bg-slate-700 dark:text-slate-200">
          ↻
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ComparisonControl ranges={ranges} onChange={setCmp} showSetMonth={false} />
        {methodAvailable && (
          <div className="ml-auto">
            <AllocMethodToggle method={method} available={methodAvailable} onChange={setMethod} />
          </div>
        )}
      </div>

      {loading ? (
        <BuCardsSkeleton />
      ) : ranges.length === 0 ? (
        <p className="text-center text-slate-400 dark:text-slate-500">No published reports yet.</p>
      ) : cards.length === 0 && !truck?.hasData && !gffc?.hasData && !company ? (
        <p className="text-center text-slate-400 dark:text-slate-500">No data for this comparison. Try ↻ Refresh.</p>
      ) : (
        <>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">Tip: drag a BU box onto another to combine their P&amp;L, Expenses &amp; Sales. Uncheck a combined box to split it.</p>
        {/* Finer tracks (2× the columns, every card spans 2) so the company
            Total P&L card can span 4 — i.e. 2× a normal BU box. */}
        <div className="grid grid-cols-4 items-start gap-2.5 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 [&>*]:col-span-2">
          {company && <CompanyCard net={company.net} priorNet={company.priorNet} grossSales={company.grossSales} priorLabel={cmp?.priorLabel} index={0} />}
          {groupCards.map((gc, i) => (
            <CombinedCard key={gc.key} data={gc.data} priorLabel={cmp?.priorLabel} metric={buMetric} index={i}
              onUncombine={() => uncombine(gc.data.codes[0])} dnd={dndFor(gc.data.codes[0])} />
          ))}
          {standalone.map((bu, i) => (
            <BuCard key={bu.buCode} bu={bu} priorLabel={cmp?.priorLabel} metric={buMetric} index={groupCards.length + i} dnd={dndFor(bu.buCode)} />
          ))}
          {truck?.hasData && <TruckingCard truck={truck} priorLabel={cmp?.priorLabel} index={cards.length} />}
          {gffc?.hasData && <GffcCard net={gffc.net} priorNet={gffc.priorNet} priorLabel={cmp?.priorLabel} index={cards.length + 1} />}
        </div>

        {/* Section for other (non-BU) reports. */}
        <div className="flex items-center gap-3 pt-3">
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Other Reports</span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>
        {canSeeReports && (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            <Link to="/roi-labor" className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">ROI on Labor per BU</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">Net Income from Ops ÷ Total Labor Cost, ranked</span>
            </Link>
            {[{ slug: 'finance', label: 'Finance P&L' }, { slug: 'hr', label: 'HR P&L' }, { slug: 'management', label: 'Management P&L' }].map((s) => (
              <Link key={s.slug} to={`/support/${s.slug}`} className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{s.label}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">Simulated support-unit P&amp;L (% of revenue)</span>
              </Link>
            ))}
          </div>
        )}
        </>
      )}
    </div>
  );
}
