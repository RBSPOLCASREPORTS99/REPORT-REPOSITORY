import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { findPnlSheet, detectMonthFromName } from '../lib/importers/parseMonthlyPnl';
import { persistMonthlyPnl } from '../lib/importers/persistMonthlyPnl';
import { computeSide, extractPools, type TruckingInputs } from '../lib/pnl/computeBuPnl';
import { BU_CONFIGS, TRUCKING_CODES, PULLS, type BuConfig } from '../lib/pnl/buConfig';
import { loadBuConfigs } from '../lib/pnl/loadBuConfigs';
import { supabase } from '../lib/supabaseClient';
import { lookupValue, type ParsedPivot } from '../lib/importers/parsePivotTab';
import { isSupportWorkbook, parseSupportWorkbook, type ParsedSupport } from '../lib/importers/parseSupportWorkbook';
import { persistSupportImport } from '../lib/importers/persistSupportImport';
import { isExpenseTxWorkbook, parseExpenseTransactions, type ParsedExpenseTx } from '../lib/importers/parseExpenseTransactions';
import { isSalesTxWorkbook, parseSalesTransactions, type ParsedSalesTx } from '../lib/importers/parseSalesTransactions';
import { isTruckingDashboard, parseTruckingDashboard, excelSerial, type ParsedDashboard } from '../lib/importers/parseTruckingDashboard';
import { persistTruckingDashboard } from '../lib/importers/persistTruckingDashboard';
import { isGffcWorkbook, parseGffcPnl, type GffcMonthInputs } from '../lib/importers/parseGffcPnl';
import { parseGffcExpense, parseGffcSales, type GffcExpenseRow, type GffcSalesRow } from '../lib/importers/parseGffcData';
import { persistGffcPnl } from '../lib/importers/persistGffcPnl';
import { persistGffcExpense, persistGffcSales } from '../lib/importers/persistGffcData';
import { GFFC_CATEGORIES, GFFC_EXPENSE_KEYS } from '../lib/gffc/gffcConfig';
import { persistExpenseTx, persistSalesTx } from '../lib/importers/persistRawImport';
import { loadStoredAlloc, truckIncomeExists } from '../lib/truckingRecompute';
import { monthLabel, formatThousands } from '../lib/format';
import { useAuth } from '../contexts/AuthContext';

type Step = 'upload' | 'month' | 'support' | 'expense' | 'sales' | 'dashboard' | 'gffc' | 'done';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const YEARS = [2024, 2025, 2026, 2027];

// Per-BU trucking cost is limited to 5 decimal places (both the pre-filled
// dashboard values and manual edits).
const round5 = (v: number) => Math.round(v * 1e5) / 1e5;

export default function ImportWizard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [pivot, setPivot] = useState<ParsedPivot | null>(null);
  // Hardcoded BUs + any user-added ones (auto-read from this pivot by code).
  const [configs, setConfigs] = useState<BuConfig[]>(BU_CONFIGS);
  const [year, setYear] = useState(2025);
  const [month, setMonth] = useState(1);
  const [trucking, setTrucking] = useState<TruckingInputs>({}); // per-BU trucking cost (grid + preview), pre-filled from the dashboard
  const [monthExists, setMonthExists] = useState(false);
  const [support, setSupport] = useState<ParsedSupport | null>(null);
  const [dashboard, setDashboard] = useState<ParsedDashboard | null>(null);
  const [dashMonthExists, setDashMonthExists] = useState(false);
  const [gffcMonths, setGffcMonths] = useState<GffcMonthInputs[] | null>(null);
  const [gffcExpense, setGffcExpense] = useState<GffcExpenseRow[]>([]);
  const [gffcSales, setGffcSales] = useState<GffcSalesRow[]>([]);
  const [expense, setExpense] = useState<ParsedExpenseTx | null>(null);
  const [sales, setSales] = useState<ParsedSalesTx | null>(null);
  const [parseError, setParseError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false); // final double-check modal

  // When a P&L pivot is loaded, resolve the compute list: hardcoded BUs plus any
  // user-added BUs, whose columns are matched from this pivot by their code.
  useEffect(() => {
    if (!pivot) { setConfigs(BU_CONFIGS); return; }
    let cancelled = false;
    loadBuConfigs(supabase, pivot)
      .then((cs) => { if (!cancelled) setConfigs(cs); })
      .catch(() => { if (!cancelled) setConfigs(BU_CONFIGS); });
    return () => { cancelled = true; };
  }, [pivot]);

  // On the monthly step, pre-fill the per-BU trucking cost from the stored
  // dashboard allocation (editable), and flag whether the month exists.
  useEffect(() => {
    if (step !== 'month') return;
    let cancelled = false;
    (async () => {
      const a = await loadStoredAlloc(year, month);
      const { data: pm } = await supabase.from('pnl_months').select('id').eq('year', year).eq('month', month).maybeSingle();
      if (cancelled) return;
      setTrucking(Object.fromEntries(Object.entries(a).map(([k, v]) => [k, round5(v as number)])));
      setMonthExists(!!pm);
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [step, year, month]);

  // On the dashboard step, flag if the selected month's per-truck income already
  // exists (so we can warn but still allow an update).
  useEffect(() => {
    if (step !== 'dashboard') return;
    let cancelled = false;
    truckIncomeExists(year, month).then((e) => { if (!cancelled) setDashMonthExists(e); }).catch(() => {});
    return () => { cancelled = true; };
  }, [step, year, month]);

  async function handleFile(file: File) {
    setParseError('');
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      setFileBuffer(buf);
      const wb = XLSX.read(buf, { type: 'array' });

      if (isGffcWorkbook(wb)) {
        const months = parseGffcPnl(buf);
        const exp = parseGffcExpense(wb);
        const sal = parseGffcSales(wb);
        if (months.length === 0 && exp.length === 0 && sal.length === 0) {
          setParseError('No GFFC P&L / Expense / Sales data found in this workbook.');
          return;
        }
        setGffcMonths(months.length ? months : null);
        setGffcExpense(exp);
        setGffcSales(sal);
        setStep('gffc');
        return;
      }
      if (isTruckingDashboard(wb)) {
        const parsed = parseTruckingDashboard(buf);
        if (parsed.months.length === 0) { setParseError('No dated month columns found in the TRUCKING DASHBOARD (Sales per Truck / Sales per BU).'); return; }
        setDashboard(parsed);
        setYear(parsed.months[0].year);
        setMonth(parsed.months[0].month);
        setStep('dashboard');
        return;
      }
      if (isSalesTxWorkbook(wb)) {
        const parsed = parseSalesTransactions(buf);
        if (parsed.months.length === 0) { setParseError('No dated sales transactions found in "QB Sales Data".'); return; }
        setSales(parsed); setStep('sales'); return;
      }
      if (isExpenseTxWorkbook(wb)) {
        const parsed = parseExpenseTransactions(buf);
        if (parsed.months.length === 0) { setParseError('No dated expense transactions found in "QB Exp Data".'); return; }
        setExpense(parsed); setStep('expense'); return;
      }
      if (isSupportWorkbook(wb)) {
        const parsed = parseSupportWorkbook(buf);
        if (parsed.currentMonth.month === 0) { setParseError('Could not read the support workbook period headers.'); return; }
        setSupport(parsed); setStep('support'); return;
      }

      // Otherwise: a single-month QuickBooks "P&L by Class" export.
      const found = findPnlSheet(wb);
      if (!found) {
        setParseError('No QuickBooks "P&L by Class" sheet found (needs BU columns and a "Total Income" row).');
        return;
      }
      setPivot(found);
      // Detect the month/year from the file name first (e.g. "Jan 2025 P&L.xlsx"),
      // then the sheet name — QB single-month exports often use a generic sheet.
      const detected = detectMonthFromName(file.name) ?? detectMonthFromName(found.sheetName);
      if (detected) { setYear(detected.year); setMonth(detected.month); }
      setTrucking({});
      setStep('month');
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Failed to read the file.');
    }
  }

  async function handleConfirmMonth() {
    if (!pivot || !fileBuffer || !user) return;
    setConfirming(true);
    setConfirmError('');
    try {
      await persistMonthlyPnl({ year, month, pivot, trucking, fileName, fileBuffer, userId: user.id });
      setStep('done');
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setConfirming(false);
    }
  }

  async function handleConfirmSupport() {
    if (!support || !fileBuffer || !user) return;
    setConfirming(true); setConfirmError('');
    try {
      const res = await persistSupportImport({ fileName, fileBuffer, parsed: support, userId: user.id });
      if (res.stored === 0) { setConfirmError('No matching periods found. Import that month\'s P&L first.'); return; }
      setStep('done');
    } catch (e) { setConfirmError(e instanceof Error ? e.message : 'Import failed.'); } finally { setConfirming(false); }
  }
  async function handleConfirmExpense() {
    if (!expense || !fileBuffer || !user) return;
    setConfirming(true); setConfirmError('');
    try {
      const res = await persistExpenseTx(expense, fileName, fileBuffer, user.id);
      if (res.ranges === 0) { setConfirmError('No matching periods found. Import the P&L for these months first.'); return; }
      setStep('done');
    } catch (e) { setConfirmError(e instanceof Error ? e.message : 'Import failed.'); } finally { setConfirming(false); }
  }
  async function handleConfirmDashboard() {
    if (!dashboard || !user) return;
    setConfirming(true); setConfirmError('');
    try {
      const res = await persistTruckingDashboard({ year, month, parsed: dashboard, fileName, userId: user.id });
      if (res.truckMonths === 0 && res.allocMonths === 0) { setConfirmError(`No truck or BU data found in this dashboard.`); return; }
      setStep('done');
    } catch (e) { setConfirmError(e instanceof Error ? e.message : 'Import failed.'); } finally { setConfirming(false); }
  }
  async function handleConfirmGffc() {
    if (!user) return;
    setConfirming(true); setConfirmError('');
    try {
      if (gffcMonths?.length) await persistGffcPnl(gffcMonths, fileName, user.id);
      await persistGffcExpense(gffcExpense);
      await persistGffcSales(gffcSales);
      setStep('done');
    } catch (e) { setConfirmError(e instanceof Error ? e.message : 'Import failed.'); } finally { setConfirming(false); }
  }
  async function handleConfirmSales() {
    if (!sales || !fileBuffer || !user) return;
    setConfirming(true); setConfirmError('');
    try {
      const res = await persistSalesTx(sales, fileName, fileBuffer, user.id);
      if (res.ranges === 0) { setConfirmError('No matching periods found. Import the P&L for these months first.'); return; }
      setStep('done');
    } catch (e) { setConfirmError(e instanceof Error ? e.message : 'Import failed.'); } finally { setConfirming(false); }
  }

  // ---- Done ---------------------------------------------------------------
  if (step === 'done') {
    return (
      <div className="space-y-4 rounded-2xl bg-white dark:bg-slate-800 p-6 text-center shadow-sm">
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Import confirmed</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">YTD and quarter figures were refreshed from your imported months. Publish the period so BU Heads and the GM can see it.</p>
        <button onClick={() => navigate('/')} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">Back to Home</button>
      </div>
    );
  }

  // ---- Monthly P&L: pick month + trucking + preview ----------------------
  if (step === 'month' && pivot) {
    const previews = configs.filter((c) => !c.manualEntry).map((cfg) => ({
      cfg,
      netIncome: computeSide(pivot, cfg, trucking).net_income,
      // Raw QuickBooks Net Income for the BU column(s), before any BR
      // allocations/trucking — a check against the source workbook.
      rawNI: cfg.memberColumns.reduce((s, col) => s + lookupValue(pivot, PULLS.netIncome.hierCol, PULLS.netIncome.label, col), 0) / 1000,
    }));
    // Safety check: a wrong/empty file yields near-zero totals.
    const companyGross = extractPools(pivot).company_gross_sales; // ₱'000
    const suspicious = companyGross <= 0 || previews.every((p) => p.rawNI === 0);
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Import monthly P&L</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          One QuickBooks "P&L by Class" export. Confirm the month and the per-BU trucking cost (pre-filled
          from the TRUCKING DASHBOARD, editable), then import — YTD and quarter figures rebuild automatically.
          Per-truck Salaries are entered separately on the Truck Salaries screen.
        </p>

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500 dark:text-slate-400">Month</span>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm">
            {MONTH_NAMES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm">
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className="text-xs text-slate-400 dark:text-slate-500">detected sheet: {pivot.sheetName}</span>
        </div>

        {monthExists && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {monthLabel(year, month)} is already imported — importing will <span className="font-medium">update</span> it
            (YTD/quarter recompute, publish state kept). Trucking below is pre-filled from the dashboard; edit if needed.
          </p>
        )}

        <div>
          <p className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">Trucking Cost per BU (₱ '000)</p>
          <p className="mb-1 text-xs text-slate-400 dark:text-slate-500">Pre-filled from the imported TRUCKING DASHBOARD (Sales per BU) — edit if needed.</p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 rounded-2xl bg-white dark:bg-slate-800 p-3 shadow-sm sm:grid-cols-3 sm:gap-x-10">
            {TRUCKING_CODES.map((code) => (
              <label key={code} className="flex items-center gap-2 text-sm">
                <span className="w-14 shrink-0 text-slate-600 dark:text-slate-300">{code}</span>
                <input type="number" inputMode="decimal" step="0.00001" value={trucking[code] || ''}
                  onChange={(e) => setTrucking((t) => ({ ...t, [code]: e.target.value === '' ? 0 : round5(Number(e.target.value)) }))}
                  className="min-w-0 flex-1 rounded border border-slate-200 dark:border-slate-700 px-2 py-1 text-right tabular-nums focus:border-slate-400 focus:outline-none" placeholder="0" />
              </label>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl bg-white dark:bg-slate-800 shadow-sm">
          <div className="grid grid-cols-[1fr_7rem_7rem] items-end gap-x-3 px-4 py-2 text-xs font-medium text-slate-400 dark:text-slate-500">
            <span>{monthLabel(year, month)} · ₱'000</span>
            <span className="text-right">Raw NI in Excel</span>
            <span className="text-right">Net Income</span>
          </div>
          {previews.map(({ cfg, netIncome, rawNI }) => (
            <div key={cfg.buCode} className="grid grid-cols-[1fr_7rem_7rem] items-center gap-x-3 px-4 py-2.5">
              <span className="text-sm text-slate-900 dark:text-slate-100">{cfg.buName}</span>
              <span className={`text-right text-sm tabular-nums ${rawNI < 0 ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>₱{formatThousands(rawNI)}k</span>
              <span className={`text-right text-sm font-medium tabular-nums ${netIncome < 0 ? 'text-red-600' : 'text-slate-900 dark:text-slate-100'}`}>₱{formatThousands(netIncome)}k</span>
            </div>
          ))}
          <p className="px-4 py-2 text-[11px] text-slate-400 dark:text-slate-500">
            <span className="font-medium">Raw NI in Excel</span> = the BU's own Net Income from the QuickBooks
            sheet (before Admin / Cost-of-Money / support allocations and trucking) — for checking only.
            <span className="font-medium"> Net Income</span> is the final figure after allocations.
          </p>
        </div>

        {suspicious && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            ⚠️ This file's totals look empty / near-zero (company Gross Sales = ₱{formatThousands(companyGross)}k).
            Double-check you picked the correct file and sheet before importing — importing an empty file would overwrite {monthLabel(year, month)}.
          </p>
        )}

        {confirmError && <p className="text-sm text-red-600">{confirmError}</p>}
        <div className="flex gap-3">
          <button onClick={() => setStep('upload')} className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">Cancel</button>
          <button onClick={() => setShowConfirm(true)} disabled={confirming} className="flex-1 rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
            {`${monthExists ? 'Update' : 'Import'} ${monthLabel(year, month)}`}
          </button>
        </div>

        {/* Final double-check dialog */}
        {showConfirm && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={() => !confirming && setShowConfirm(false)}>
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {monthExists ? 'Update' : 'Import'} {monthLabel(year, month)}?
              </h2>
              <div className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                <p>File: <span className="font-medium">{fileName}</span></p>
                <p>Sheet: <span className="font-medium">{pivot.sheetName}</span></p>
                <p>Company Gross Sales: <span className="font-medium">₱{formatThousands(companyGross)}k</span> · {previews.length} BUs</p>
                {monthExists && (
                  <p className="text-amber-700 dark:text-amber-400">
                    This replaces the existing {monthLabel(year, month)} data (YTD/quarter recompute; publish state kept).
                  </p>
                )}
                {suspicious && (
                  <p className="font-medium text-red-600 dark:text-red-400">
                    ⚠️ Totals look empty/near-zero — please make sure this is the right file.
                  </p>
                )}
              </div>
              {confirmError && <p className="mt-2 text-sm text-red-600">{confirmError}</p>}
              <div className="mt-4 flex gap-3">
                <button onClick={() => setShowConfirm(false)} disabled={confirming}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200">
                  Go back
                </button>
                <button onClick={handleConfirmMonth} disabled={confirming}
                  className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
                  {confirming ? (monthExists ? 'Updating…' : 'Importing…') : `Yes, ${monthExists ? 'update' : 'import'}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- Sales / Expense / Support previews (with detected-month helper) ----
  const secondaryPreview = (
    title: string, detected: string, summary: string, onConfirm: () => void, warnings?: string[],
  ) => (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
      <div className="rounded-xl bg-blue-50 px-4 py-2 text-sm text-blue-800">
        {detected}. Import the P&L for these months first so the periods line up.
      </div>
      {warnings && warnings.length > 0 && (
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800"><ul className="list-disc space-y-0.5 pl-4">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>
      )}
      <div className="rounded-2xl bg-white dark:bg-slate-800 p-4 text-sm shadow-sm"><p className="text-slate-600 dark:text-slate-300">{summary}</p></div>
      {confirmError && <p className="text-sm text-red-600">{confirmError}</p>}
      <div className="flex gap-3">
        <button onClick={() => setStep('upload')} className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">Cancel</button>
        <button onClick={onConfirm} disabled={confirming} className="flex-1 rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
          {confirming ? 'Importing…' : 'Confirm import'}
        </button>
      </div>
    </div>
  );

  const monthsRange = (ms: { year: number; month: number }[]) => {
    if (ms.length === 0) return 'no months';
    const first = ms[0], last = ms[ms.length - 1];
    return `Detected months: ${monthLabel(first.year, first.month)} – ${monthLabel(last.year, last.month)} (${ms.length})`;
  };

  if (step === 'sales' && sales) {
    return secondaryPreview('Import sales report', monthsRange(sales.months), `${sales.buCodes.length} business units · ${sales.rows.length} item-month rows.`, handleConfirmSales, sales.warnings);
  }
  if (step === 'expense' && expense) {
    return secondaryPreview('Import expense report', monthsRange(expense.months), `${expense.buCodes.length} business units · ${expense.rows.length} account-month rows.`, handleConfirmExpense, expense.warnings);
  }
  if (step === 'support' && support) {
    return secondaryPreview('Import support allocations', `Detected month: ${monthLabel(support.currentMonth.year, support.currentMonth.month)}`, `${support.buCodes.length} business units · ${support.values.length} allocation values (Finance, HR, Management).`, handleConfirmSupport, support.warnings);
  }

  // ---- TRUCKING DASHBOARD: per-truck income + per-BU allocation -----------
  if (step === 'dashboard' && dashboard) {
    const serial = excelSerial(year, month);
    const truckInc = dashboard.truckIncome.get(serial) ?? {};
    const buAlloc = dashboard.buAlloc.get(serial) ?? {};
    const truckTotal = Object.values(truckInc).reduce((s, v) => s + v, 0); // full pesos
    const buTotal = Object.values(buAlloc).reduce((s, v) => s + v, 0);     // ₱'000
    const truckCount = Object.values(truckInc).filter((v) => v !== 0).length;
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Import TRUCKING DASHBOARD</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          One-time upload of the <span className="font-medium">whole history</span> ({dashboard.months.length} months):
          per-truck income and per-BU trucking allocation are stored for <span className="font-medium">every imported P&amp;L month</span>,
          then YTD/quarter figures recompute. The month picker below is just for the summary shown.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500 dark:text-slate-400">Month</span>
          <select
            value={`${year}-${month}`}
            onChange={(e) => { const [y, m] = e.target.value.split('-').map(Number); setYear(y); setMonth(m); }}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
          >
            {dashboard.months.map((m) => <option key={m.serial} value={`${m.year}-${m.month}`}>{monthLabel(m.year, m.month)}</option>)}
          </select>
        </div>
        {dashMonthExists && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {monthLabel(year, month)} per-truck income is already stored — importing will <span className="font-medium">update</span> it.
          </p>
        )}
        <div className="space-y-1 rounded-2xl bg-white p-4 text-sm shadow-sm dark:bg-slate-800">
          <p className="text-slate-700 dark:text-slate-200"><span className="font-medium">{truckCount}</span> trucks · income total <span className="font-medium">₱{formatThousands(truckTotal / 1000)}k</span></p>
          <p className="text-slate-700 dark:text-slate-200">Per-BU trucking allocation total <span className="font-medium">{formatThousands(buTotal)}k</span> — auto-fills the P&amp;L trucking</p>
          {truckCount === 0 && <p className="text-amber-700 dark:text-amber-400">No truck income found for this month — pick another month.</p>}
        </div>
        {confirmError && <p className="text-sm text-red-600">{confirmError}</p>}
        <div className="flex gap-3">
          <button onClick={() => setStep('upload')} className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">Cancel</button>
          <button onClick={handleConfirmDashboard} disabled={confirming} className="flex-1 rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
            {confirming ? 'Importing…' : `Import ${monthLabel(year, month)}`}
          </button>
        </div>
      </div>
    );
  }

  // ---- GFFC - Chickboy Meating Place: Total P&L + Expenses + Sales --------
  if (step === 'gffc') {
    const pnlRange = () => {
      if (!gffcMonths?.length) return null;
      const s = [...gffcMonths].sort((a, b) => a.year - b.year || a.month - b.month);
      return `${monthLabel(s[0].year, s[0].month)} – ${monthLabel(s[s.length - 1].year, s[s.length - 1].month)} (${gffcMonths.length})`;
    };
    const expMonths = new Set(gffcExpense.map((r) => `${r.year}-${r.month}`)).size;
    const salesItems = new Set(gffcSales.map((r) => r.item)).size;
    const salesMonths = new Set(gffcSales.map((r) => `${r.year}-${r.month}`)).size;
    const catKeys = GFFC_CATEGORIES.map((c) => c.key);
    // Per-month preview to check the parsed P&L (full pesos). Total Expense =
    // sum of the 5 expense groups from the P&L (the "Total Expense" row).
    const pnlPreview = (gffcMonths ?? []).slice().sort((a, b) => a.year - b.year || a.month - b.month).map((m) => {
      const gross = catKeys.reduce((s, k) => s + (m.lines[k] ?? 0), 0);
      const totalExp = GFFC_EXPENSE_KEYS.reduce((s, k) => s + (m.lines[k] ?? 0), 0);
      const net = gross - (m.lines.cogs ?? 0) - totalExp;
      return { label: monthLabel(m.year, m.month), gross, net, totalExp };
    });
    const suspicious = pnlPreview.length > 0 && pnlPreview.every((p) => p.gross === 0);
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Import GFFC - Chickboy Meating Place</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Reads whichever GFFC QuickBooks sheets are present. YTD/quarter figures are summed automatically.
          Re-importing replaces the months present (no duplicates).
        </p>
        <div className="space-y-1 rounded-2xl bg-white p-4 text-sm text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200">
          {pnlRange() && <p>Total P&amp;L (P&amp;L 2025 / 2026): <span className="font-medium">{pnlRange()}</span></p>}
          {gffcExpense.length > 0 && <p>Expense Report (QB Exp Details): <span className="font-medium">{gffcExpense.length} account-months</span> across {expMonths} months</p>}
          {gffcSales.length > 0 && <p>Sales by Qty: <span className="font-medium">{salesItems} items</span> across {salesMonths} months</p>}
        </div>

        {pnlPreview.length > 0 && (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl bg-white dark:bg-slate-800 shadow-sm">
            <div className="grid grid-cols-[1fr_9rem_8rem_9rem] gap-x-3 px-4 py-2 text-xs font-medium text-slate-400 dark:text-slate-500">
              <span>Month · ₱</span>
              <span className="text-right">Gross Sales</span>
              <span className="text-right">Net Income</span>
              <span className="text-right">Total Expense</span>
            </div>
            {pnlPreview.map((p) => (
              <div key={p.label} className="grid grid-cols-[1fr_9rem_8rem_9rem] items-center gap-x-3 px-4 py-2">
                <span className="text-sm text-slate-900 dark:text-slate-100">{p.label}</span>
                <span className="text-right text-sm tabular-nums text-slate-600 dark:text-slate-300">₱{formatThousands(p.gross)}</span>
                <span className={`text-right text-sm font-medium tabular-nums ${p.net < 0 ? 'text-red-600' : 'text-slate-900 dark:text-slate-100'}`}>₱{formatThousands(p.net)}</span>
                <span className="text-right text-sm tabular-nums text-slate-500 dark:text-slate-400">₱{formatThousands(p.totalExp)}</span>
              </div>
            ))}
          </div>
        )}

        {suspicious && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            ⚠️ All months show ₱0 Gross Sales — double-check this is the GFFC QuickBooks export before importing.
          </p>
        )}
        {confirmError && <p className="text-sm text-red-600">{confirmError}</p>}
        <div className="flex gap-3">
          <button onClick={() => setStep('upload')} className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">Cancel</button>
          <button onClick={handleConfirmGffc} disabled={confirming} className="flex-1 rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
            {confirming ? 'Importing…' : 'Import GFFC data'}
          </button>
        </div>
      </div>
    );
  }

  // ---- Upload step --------------------------------------------------------
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Import</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Upload a monthly QuickBooks <strong>P&L by Class</strong> export (one per month), or the Expense,
        Sales-in-Qty, or FINANCE/HR/MANCOM support workbook — the type is detected automatically.
      </p>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => fileInputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-12 text-center"
      >
        <p className="font-medium text-slate-700 dark:text-slate-200">Drag and drop a workbook here</p>
        <p className="text-sm text-slate-400 dark:text-slate-500">or tap to browse — .xlsx / .xlsm</p>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xlsm" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>
      {parseError && <p className="text-sm text-red-600">{parseError}</p>}
    </div>
  );
}
