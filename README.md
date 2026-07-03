# POLCAS Business Review App

Mobile-first dashboard replacing the monthly "BR per BU" Excel workbook. Finance uploads the
QuickBooks-derived P&L export; BU Heads and the GM read a live dashboard instead of a spreadsheet.

## Monthly workflow (all in-app)

1. **Export from QuickBooks** and sign in as a Finance user.
2. **Import the month's P&L** on the **Import** screen: upload that month's QuickBooks "P&L by Class"
   export (one file per month), confirm the month, and enter that month's trucking cost per BU.
   The app stores the month and **rebuilds YTD and quarter figures automatically by summing months**
   (allocations recomputed on the totals). Re-importing a month updates it and refreshes everything.
3. **Import Expense / Sales / support** workbooks (auto-detected by type). The Expense and Sales
   workbooks are single accumulating files — the app reads the raw `QB Exp Data` / `QB Sales Data`
   transaction tabs, computes per-account / per-item figures **by date**, and derives every range
   (month / YTD / quarter) the same way as the P&L. Each shows the detected months before you confirm.
4. **Enter the Lakatan Farm** P&L on the **Farm** screen (hand-typed, not in QuickBooks). Adjust
   trucking anytime on the **Trucking** screen (recomputes the P&L).
5. **Publish** the period on the **Publish** screen so BU Heads and the GM can see it.
6. **Review / present**: viewers pick a **set month** and a comparison — **YTD Comp**, **QTR Comp**
   (quarter-end months), or **Month Comp** — and read the per-BU P&L, Expenses, and Sales tabs, or
   run **Present mode** for the meeting.

To build full history, import each month from **January 2025** onward; YTD/quarter figures fill in
as the months are added.

## Local development

```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Apply the migrations in `supabase/migrations/` in order (`0001` … `0009`) to your Supabase project
(SQL Editor or CLI) before using the app — they create the schema, seed the business unit list and
per-BU config, and set up RLS.

New sign-ups default to the `bu_head` role with no assigned BU (so they see nothing until
Finance assigns them). Set a user's `role` and `assigned_bu_code` in the `profiles` table via the
Supabase table editor:

- `role = 'finance'` — can import data and see every BU, published or not.
- `role = 'gm'` — sees every BU, published periods only.
- `role = 'bu_head'` with `assigned_bu_code = 'BU05'` (etc.) — sees only that BU, published
  periods only. For BU08's sub-units, assigning `BU08` shows both `BU08LF` and `BU08PH`.

## What's implemented so far

- **Monthly P&L**: computed from raw QuickBooks "P&L by Class" pivots (validated to the peso);
  YTD/quarter derived by summing months with allocations recomputed on the totals.
- **Expenses & Sales**: computed from the raw `QB Exp Data` / `QB Sales Data` transaction tabs by
  date — per-account (Controllable / Non-controllable) and per-item (with U/M) — for any range.
- Home page: BU card grid; BU detail with P&L · Expenses · Sales Qty tabs, full comparison columns
  (Prior · % · Current · % · DIFF · %DIFF), and a trend chart.
- Set-month + **YTD / QTR / Month Comp** buttons; **Gross Sales / % Revenue / Per Transaction**
  allocation toggle; trucking entry; Lakatan Farm entry; Publish control; Present mode.
- Auth via Supabase email magic link (+ code fallback), role-gated import, RLS-enforced access.

- **Flexible periods:** each imported QB pivot becomes a dated range; the viewer compares any
  two ranges (month vs month, YTD vs YTD, quarter vs quarter, custom).
- **Alternative allocation methods:** import the FINANCE/HR/MANCOM support workbook and toggle
  support-center allocation between Gross Sales · % Revenue · Per Transaction (Net Income
  recomputes live).

- **Lakatan Farm** manual entry: the Farm's P&L is hand-typed (not in QuickBooks), so Finance
  enters it per period on the **Farm** screen; the app computes the subtotals and Net Income and
  shows it alongside the computed BUs.

- **Publish control:** the finance-only **Publish** screen toggles each period between Published
  (visible to BU Heads / GM) and Draft (Finance only).
- **Expense detail:** import the Expense Report workbook and view per-BU expense accounts on the
  BU detail page's **Expenses** tab — grouped Controllable / Non-controllable, sorted largest-first,
  with share-of-total bars and comparison to the prior period (full pesos).
- **Sales volume:** import the Sales-in-Qty workbook and view quantity sold per item on the
  **Sales Qty** tab — with unit of measure and a comparison-block selector (annual, same-month YoY,
  vs last month, quarter-vs-quarter), each showing prior / current / DIFF / %DIFF.

- **Present mode:** a full-screen, large-font meeting view (**▶ Present** on Home) — one BU per
  screen with the headline Gross Sales / Gross Income / Net Income, navigable by swipe, on-screen
  arrows, or keyboard ← / →, with the period + comparison picker at the top.

All three source workbooks (BR/P&L, Expense Report, Sales-in-Qty) are replaced, and the full
original brief — including Present mode — is implemented.

## How the P&L is built (compute-from-raw)

The app **computes** each per-BU P&L itself from the raw QuickBooks "P&L by Class" pivot tabs
(`2025`, `2026`, `<Month> <Year>`), reproducing the Excel workbook's logic exactly — validated to
the peso against the finished May 2026 tabs (`scripts/validate-compute.ts`, 1188 checks, 0
mismatches). Finance no longer hand-builds the per-BU tabs.

- Each line (Gross Sales, COGS, expenses) is summed from the BU's pivot column(s).
- **Trucking** is allocated from Finance's manual per-BU trucking cost (entered in the import
  wizard): each BU's cost → % share × the total BU10 trucking cost pulled from QuickBooks.
- **Support centers** (Finance/HR/Management) and **Admin / Cost-of-Money** are allocated by
  gross-sales pro-rata: (BU gross sales ÷ company gross sales) × the relevant company-wide pool.

The compute engine lives in `src/lib/pnl/` (`computeBuPnl.ts`, `buConfig.ts`, `buildBrFromRaw.ts`);
the raw-pivot parser is `src/lib/importers/parsePivotTab.ts`. At import the results are materialized
into `pnl_lines` (RLS-scoped per BU) so viewers read fast, scoped data; the raw workbook is kept in
Storage for audit and future re-compute.
