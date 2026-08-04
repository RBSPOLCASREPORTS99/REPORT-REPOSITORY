import { useEffect, useState } from 'react';

// In-app monthly data-upload manual, shown as a modal. Interactive checklist:
// tap a step to expand, tick it off (saved per device), reset for a new month.

type Badge = 'monthly' | 'cond' | 'need' | 'occ';
interface Section { h: string; items: string[] }
interface Step { id: string; n: number; name: string; where: string; badge: Badge; todo: string; sections: Section[]; note?: string }
interface Phase { letter: string; title: string; desc: string; steps: Step[] }

const PHASES: Phase[] = [
  {
    letter: 'A', title: 'Import the source files', desc: 'Import data screen · file type auto-detected',
    steps: [
      { id: 's1', n: 1, name: 'Upload the TRUCKING DASHBOARD', where: 'Import data', badge: 'monthly',
        todo: 'Drag the updated TRUCKING DASHBOARD workbook onto the Import screen. It carries the whole history and stores per-truck income and each BU’s trucking allocation for every month, then recomputes YTD / quarter.',
        sections: [
          { h: 'Check', items: ['The summary shows the truck count and income total — confirm the new month is present.'] },
          { h: 'Why first', items: ['The per-BU Trucking Cost shown in the P&L step pre-fills from this file.', 'Re-uploading the whole file each month is safe — no duplicates.'] },
        ] },
      { id: 's2', n: 2, name: 'Import the monthly P&L by Class', where: 'Import data', badge: 'monthly',
        todo: 'Drag the QuickBooks “P&L by Class” export (one month). This is the anchor — it creates the month and computes every BU’s Net Income. The other imports below line up to it.',
        sections: [
          { h: 'Do', items: ['Confirm the Month / Year (auto-detected from the file name).', 'Review the per-BU Trucking Cost (pre-filled from the dashboard) — edit if needed.', 'Import — YTD and quarter rebuild automatically.'] },
          { h: 'Check', items: ['Total Net Income (allocated) should reconcile to Total Raw NI (the QuickBooks grand-total column).', 'If the red “totals look empty / near-zero” warning shows, you picked the wrong file or sheet — stop.'] },
        ],
        note: 'Re-importing a month updates it (YTD/quarter recompute, publish state kept). Per-truck salaries are entered separately (step 7).' },
      { id: 's3', n: 3, name: 'Import the Expense report', where: 'Import data', badge: 'monthly',
        todo: 'Drag the QuickBooks expense workbook. It fills each BU’s Expenses tab with account-level detail.',
        sections: [
          { h: 'Check', items: ['Detected months must match the P&L you already imported.', 'Import a full expense workbook (with the classification tabs) at least once so later raw exports classify automatically.'] },
        ] },
      { id: 's4', n: 4, name: 'Import the Sales report', where: 'Import data', badge: 'monthly',
        todo: 'Drag the “QB Sales Data” workbook. It fills each BU’s Sales tab with item-level rows.',
        sections: [{ h: 'Check', items: ['Detected months line up with the imported P&L months.'] }] },
      { id: 's5', n: 5, name: 'Import the Support workbook (Finance / HR / Management)', where: 'Import data', badge: 'monthly',
        todo: 'Drag the FINANCE / HR / MANCOM support workbook. It loads the support-unit allocation values for the month.',
        sections: [
          { h: 'Check', items: ['“No matching periods found” means the month’s P&L isn’t imported yet — do step 2 first.', 'Support-unit expenses now also come from the P&L-by-Class import automatically.'] },
        ] },
      { id: 's6', n: 6, name: 'Import GFFC — Chickboy Meating Place', where: 'Import data', badge: 'monthly',
        todo: 'Drag the GFFC QuickBooks workbook. It reads whichever sheets are present — Total P&L, Expenses, Sales by Qty, and Per-Branch P&L. YTD / quarter are summed automatically; re-importing replaces the months present.',
        sections: [{ h: 'Check', items: ['The per-month preview (Gross Sales / Net Income / Total Expense) looks right — not all ₱0.'] }] },
    ],
  },
  {
    letter: 'B', title: 'Enter the by-hand figures', desc: 'Numbers not in QuickBooks',
    steps: [
      { id: 's7', n: 7, name: 'Truck Salaries — split per truck', where: 'Truck Salaries', badge: 'monthly',
        todo: 'QuickBooks posts BU10 salaries as one lump, so split them here. Select the month, type each truck’s Salaries and Wages (₱ thousands), then Save.',
        sections: [{ h: 'Tip', items: ['Click “Reconcile to QuickBooks” to prorate any variance (QB BU10 total − your sum) across trucks by Gross Income.'] }] },
      { id: 's8', n: 8, name: 'Lakatan Farm — manual P&L', where: 'Lakatan Farm', badge: 'monthly',
        todo: 'The Farm (BU08LF) isn’t in QuickBooks — enter it by hand. Pick the period, type the P&L lines (₱ thousands), review the computed Net Income, then Save Farm P&L.',
        sections: [{ h: 'Tip', items: ['Click “Auto-compute allocated & support centers” to fill Admin, Cost of Money and Finance / HR / Management, prorated by the Farm’s share of company Gross Sales.'] }] },
      { id: 's9', n: 9, name: 'BU Parameters — operational figures', where: 'BU Parameters', badge: 'monthly',
        todo: 'Pick a BU and the month, then type its manual parameters and STD (target) values. Rows marked auto come from the P&L or are derived — leave them alone. Save Parameters, and repeat for each BU that has manual inputs.',
        sections: [{ h: 'Tip', items: ['YTD / quarter combine automatically (quantities sum, rates average).', 'Standards rarely change — bulk-load them once from the Parameters workbook (see Occasional at the end).'] }] },
      { id: 's10', n: 10, name: 'Support per-BU counts', where: 'Finance / HR report → ✎ Per-BU counts', badge: 'cond',
        todo: 'Only if a support unit bills by per-transaction or per-PAX (not “% of Revenue”). Choose the Unit and Method, set the rate, select the month, and enter each service BU’s # Transactions or # PAX. Save.',
        sections: [{ h: 'Skip when', items: ['The unit uses % of Revenue — no counts needed, revenue auto-reads from the P&L import.', 'Method / rate is sticky across months; only the counts are monthly.'] }] },
      { id: 's11', n: 11, name: 'ROI on Labor — overrides', where: 'ROI on Labor → ✎ override', badge: 'need',
        todo: 'Net Income and Total Labor Cost auto-build from each BU’s P&L. Only if a BU needs correcting (e.g. BU09): select the period, type an override for Net Income and/or Total Labor Cost, then Save Overrides. Leave blank to keep the auto value (shown as the placeholder).',
        sections: [] },
    ],
  },
  {
    letter: 'C', title: 'Review, then publish', desc: 'Make it visible to BU Heads & the GM',
    steps: [
      { id: 's12', n: 12, name: 'Review on Home', where: 'Home', badge: 'monthly',
        todo: 'Pick the month and a comparison (vs Prior Month / vs Last Year, or YTD / QTR). Scan the BU boxes and the PAC Total P&L box before anyone else sees them.',
        sections: [{ h: 'Check', items: ['Use the Net Income / Net Income from Ops dropdown and the % of sales figures to sanity-check each box.', 'The company Total P&L should make sense against the sum of the BUs — investigate anything off before publishing.'] }] },
      { id: 's13', n: 13, name: 'Publish the period', where: 'Publish periods', badge: 'monthly',
        todo: 'Toggle the month (and its YTD / QTR) from Draft to Published so Business Unit Heads and the General Manager can see it. The toggle saves immediately — there’s no separate Save.',
        sections: [],
        note: 'Unpublished periods stay Finance-only drafts. This is the final gate — do it once the numbers are reviewed and correct.' },
    ],
  },
];

const ALL_STEPS = PHASES.flatMap((p) => p.steps);
const KEY = 'polcas-manual-progress-v1';

const BADGE_LABEL: Record<Badge, string> = { monthly: 'Monthly', cond: 'If applicable', need: 'As needed', occ: 'Occasional' };
const BADGE_CLS: Record<Badge, string> = {
  monthly: 'bg-brand-50 text-brand-700 border-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:border-brand-900/50',
  cond: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-900/50',
  need: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600',
  occ: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-900/50',
};

export default function UserManualModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try { setDone(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { setDone({}); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const persist = (next: Record<string, boolean>) => {
    setDone(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const toggleDone = (id: string) => persist({ ...done, [id]: !done[id] });
  const toggleExp = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));
  const setAll = (v: boolean) => setExpanded(Object.fromEntries(ALL_STEPS.map((s) => [s.id, v])));
  const doneCount = ALL_STEPS.filter((s) => done[s.id]).length;
  const pct = Math.round((doneCount / ALL_STEPS.length) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Monthly data upload user manual">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm" />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-2xl ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10">

        {/* Header */}
        <div className="flex items-start gap-3 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-400">User Manual</p>
            <h2 className="font-serif text-xl font-bold leading-tight text-slate-900 dark:text-slate-100">Monthly data upload — step by step</h2>
          </div>
          <button onClick={onClose} aria-label="Close manual"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700">×</button>
        </div>

        {/* Progress bar */}
        <div className="border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              <span className="font-bold text-brand-600 dark:text-brand-400">{pct}%</span> complete · {doneCount} of {ALL_STEPS.length} steps
            </span>
            <div className="flex gap-1.5">
              <button onClick={() => setAll(true)} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700">Expand all</button>
              <button onClick={() => setAll(false)} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700">Collapse all</button>
              <button onClick={() => persist({})} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700">Reset for new month</button>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Every month, work top to bottom: import the source files, enter the by-hand figures, then review and publish. Tap a step to expand it and tick it off — progress is saved on this device.
          </p>

          {PHASES.map((phase) => (
            <div key={phase.letter} className="mb-5">
              <div className="mb-2 flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{phase.letter}</span>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{phase.title}</h3>
                <span className="truncate text-xs text-slate-400 dark:text-slate-500">{phase.desc}</span>
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              </div>

              <div className="space-y-2">
                {phase.steps.map((s) => {
                  const isDone = !!done[s.id];
                  const isOpen = !!expanded[s.id];
                  return (
                    <div key={s.id} className={`overflow-hidden rounded-xl border bg-white shadow-sm transition dark:bg-slate-800 ${isOpen ? 'border-brand-200 dark:border-brand-900/50' : 'border-slate-200 dark:border-slate-700'}`}>
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <input type="checkbox" checked={isDone} onChange={() => toggleDone(s.id)}
                          aria-label={`Mark “${s.name}” done`}
                          className="h-5 w-5 shrink-0 cursor-pointer rounded accent-brand-600" />
                        <button onClick={() => toggleExp(s.id)} aria-expanded={isOpen}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brand-100 bg-brand-50 text-xs font-bold text-brand-700 dark:border-brand-900/50 dark:bg-brand-500/10 dark:text-brand-300">{s.n}</span>
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-sm font-semibold ${isDone ? 'text-slate-400 line-through dark:text-slate-500' : isOpen ? 'text-brand-700 dark:text-brand-300' : 'text-slate-800 dark:text-slate-100'}`}>{s.name}</span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] text-slate-500 dark:text-slate-400"><span className="text-slate-400 dark:text-slate-500">Where:</span> {s.where}</span>
                              <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${BADGE_CLS[s.badge]}`}>{BADGE_LABEL[s.badge]}</span>
                            </span>
                          </span>
                          <span className={`shrink-0 text-lg text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
                        </button>
                      </div>

                      {isOpen && (
                        <div className="border-t border-slate-100 px-3 pb-3.5 pl-[3.4rem] pt-2.5 text-sm dark:border-slate-700/60">
                          <p className="text-slate-700 dark:text-slate-200">{s.todo}</p>
                          {s.sections.map((sec) => (
                            <div key={sec.h}>
                              <p className="mb-0.5 mt-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{sec.h}</p>
                              <ul className="list-disc space-y-1 pl-4 text-slate-600 dark:text-slate-300">
                                {sec.items.map((it, i) => <li key={i}>{it}</li>)}
                              </ul>
                            </div>
                          ))}
                          {s.note && (
                            <p className="mt-3 rounded-r-md border-l-[3px] border-brand-500 bg-brand-50 px-3 py-1.5 text-[13px] italic text-slate-600 dark:bg-brand-500/10 dark:text-slate-300">{s.note}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800 dark:border-brand-900/50 dark:bg-brand-500/10 dark:text-brand-200">
            <span className="font-semibold text-brand-700 dark:text-brand-300">Occasional (not every month):</span> when a BU’s STD targets change, bulk-load them from the Parameters workbook on the Import screen (auto-detected) instead of typing standards each period. Everything else above runs every month.
          </div>
        </div>
      </div>
    </div>
  );
}
