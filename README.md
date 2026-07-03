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

Apply the migrations in `supabase/migrations/` in order (`0001` … `0010`) to your Supabase project
(SQL Editor or CLI) before using the app — they create the schema, seed the business unit list and
per-BU config, and set up RLS. In **Auth → Providers → Email**, turn **Confirm email off** so a
user's PIN signs them in immediately (only pre-authorized emails can register — see below).

**Users & access.** Finance manages people on the in-app **Users** screen: add an email, pick a
designation, and (for BU Heads) tick the approved BUs. Each person then signs in with that email and
a **6-digit PIN they set themselves** the first time (magic link stays available as a fallback, and
anyone can set/replace their PIN on the **Account** screen). Only emails Finance has added may
register. Designations:

- **Finance** — imports data and sees every BU, published or not; manages users.
- **General Manager** — sees every BU, published periods only.
- **BU Head** — sees only the BUs assigned to them (one or several, e.g. BU01&BU02), published
  periods only. Assigning `BU08` also grants its children `BU08LF` / `BU08PH`.

## What's implemented so far

- **Monthly P&L**: computed from raw QuickBooks "P&L by Class" pivots (validated to the peso);
  YTD/quarter derived by summing months with allocations recomputed on the totals.
- **Expenses & Sales**: computed from the raw `QB Exp Data` / `QB Sales Data` transaction tabs by
  date — per-account (Controllable / Non-controllable) and per-item (with U/M) — for any range.
- Home page: BU card grid; BU detail with P&L · Expenses · Sales Qty tabs, full comparison columns
  (Prior · % · Current · % · DIFF · %DIFF), and a trend chart.
- Set-month + **YTD / QTR / Month Comp** buttons; **Gross Sales / % Revenue / Per Transaction**
  allocation toggle; trucking entry; Lakatan Farm entry; Publish control; Present mode.
- Auth via **email + 6-digit PIN** (magic-link fallback); in-app **Users** admin for Finance to
  authorize people and scope each BU Head to one or more approved BUs; RLS-enforced access.

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
