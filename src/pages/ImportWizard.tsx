import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { findPnlSheet, detectMonthFromName } from '../lib/importers/parseMonthlyPnl';
import { persistMonthlyPnl } from '../lib/importers/persistMonthlyPnl';
import { computeSide, type TruckingInputs } from '../lib/pnl/computeBuPnl';
import { BU_CONFIGS, TRUCKING_CODES, PULLS } from '../lib/pnl/buConfig';
import { lookupValue, type ParsedPivot } from '../lib/importers/parsePivotTab';
import { isSupportWorkbook, parseSupportWorkbook, type ParsedSupport } from '../lib/importers/parseSupportWorkbook';
import { persistSupportImport } from '../lib/importers/persistSupportImport';
import { isExpenseTxWorkbook, parseExpenseTransactions, type ParsedExpenseTx } from '../lib/importers/parseExpenseTransactions';
import { isSalesTxWorkbook, parseSalesTransactions, type ParsedSalesTx } from '../lib/importers/parseSalesTransactions';
import { persistExpenseTx, persistSalesTx } from '../lib/importers/persistRawImport';
import { loadTruckingByYearMonth } from '../lib/truckingRecompute';
import { monthLabel, formatThousands } from '../lib/format';
import { useAuth } from '../contexts/AuthContext';

type Step = 'upload' | 'month' | 'support' | 'expense' | 'sales' | 'done';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const YEARS = [2024, 2025, 2026, 2027];

export default function ImportWizard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [pivot, setPivot] = useState<ParsedPivot | null>(null);
  const [year, setYear] = useState(2025);
  const [month, setMonth] = useState(1);
  const [trucking, setTrucking] = useState<TruckingInputs>({});
  const [monthExists, setMonthExists] = useState(false);
  const [support, setSupport] = useState<ParsedSupport | null>(null);
  const [expense, setExpense] = useState<ParsedExpenseTx | null>(null);
  const [sales, setSales] = useState<ParsedSalesTx | null>(null);
  const [parseError, setParseError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  // On the monthly step, pre-fill this month's trucking if it was already
  // imported (so re-importing/updating a month keeps the trucking you entered).
  useEffect(() => {
    if (step !== 'month') return;
    let cancelled = false;
    loadTruckingByYearMonth(year, month)
      .then((existing) => {
        if (cancelled) return;
        setTrucking(existing ?? {});
        setMonthExists(!!existing);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [step, year, month]);

  async function handleFile(file: File) {
    setParseError('');
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      setFileBuffer(buf);
      const wb = XLSX.read(buf, { type: 'array' });

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
      const detected = detectMonthFromName(found.sheetName);
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
    const previews = BU_CONFIGS.filter((c) => !c.manualEntry).map((cfg) => ({
      cfg,
      netIncome: computeSide(pivot, cfg, trucking).net_income,
      // Raw QuickBooks Net Income for the BU column(s), before any BR
      // allocations/trucking — a check against the source workbook.
      rawNI: cfg.memberColumns.reduce((s, col) => s + lookupValue(pivot, PULLS.netIncome.hierCol, PULLS.netIncome.label, col), 0) / 1000,
    }));
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Import monthly P&L</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          One QuickBooks "P&L by Class" export. Confirm the month, enter that month's trucking cost per
          BU, then import — YTD and quarter figures are rebuilt automatically from your months.
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
            (YTD/quarter recompute, publish state kept). Trucking below is pre-filled from the last import; edit if it changed.
          </p>
        )}

        <div>
          <p className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">Trucking cost per BU (₱ '000)</p>
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white dark:bg-slate-800 p-3 shadow-sm sm:grid-cols-3">
            {TRUCKING_CODES.map((code) => (
              <label key={code} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-600 dark:text-slate-300">{code}</span>
                <input type="number" inputMode="decimal" value={trucking[code] || ''}
                  onChange={(e) => setTrucking((t) => ({ ...t, [code]: e.target.value === '' ? 0 : Number(e.target.value) }))}
                  className="w-24 rounded border border-slate-200 dark:border-slate-700 px-2 py-1 text-right tabular-nums focus:border-slate-400 focus:outline-none" placeholder="0" />
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

        {confirmError && <p className="text-sm text-red-600">{confirmError}</p>}
        <div className="flex gap-3">
          <button onClick={() => setStep('upload')} className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">Cancel</button>
          <button onClick={handleConfirmMonth} disabled={confirming} className="flex-1 rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
            {confirming ? (monthExists ? 'Updating…' : 'Importing…') : `${monthExists ? 'Update' : 'Import'} ${monthLabel(year, month)}`}
          </button>
        </div>
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
