import * as XLSX from 'xlsx';

// Import the persistent "STD" (standard/target) column from the BR "Parameters"
// workbook into each BU's stored parameter standards, so Finance no longer types
// them in by hand every period — they only edit a standard when it actually
// changes. Only the line items whose STD maps to a system parameter are read;
// the material-formulation rows (G1/G2/G3) and columns without a system
// parameter are ignored.

export interface BuStdImport { buCode: string; std: Record<string, number> }

type Cell = string | number;

// Normalise an Excel label for matching: upper-case, drop punctuation, collapse
// spaces. So "% MORTALITY based on HRVSTD PENS" → "MORTALITY BASED ON HRVSTD PENS".
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Per-BU map of the Excel STD line-item label (normalised) → system parameter key.
const STD_MAP: Record<string, Record<string, string>> = {
  BU0102: {
    'PROD KILOS PER MAN HOURS': 'prod_kilos_per_manhour',
    'REJECTION': 'rejection_count', // "# REJECTION"
    'KILOS PER BAG': 'kilos_per_bag',
    'LABOR CPK PROD DELIVERY': 'labor_cpk',
    'OPERATING CPK': 'operating_cpk',
    'PRODUCTION COST PER KILO': 'production_cost_per_kilo',
  },
  BU04: {
    'LUMBER COST PER PALLET': 'lumber_cost_per_pallet',
    'OPERATING COST PER PALLET': 'operating_cost_per_pallet',
    'OVERHEAD COST PER PALLET': 'overhead_cost_per_pallet',
    'TRUCKING COST PER PALLET': 'trucking_cost_per_pallet',
    'COST PER PALLET': 'cost_per_pallet',
    'BOARD FOOT PER PALLET': 'board_foot_per_pallet',
    'REJECTION': 'pct_rejection', // "% REJECTION"
  },
  BU07: {
    'GROWING COST PER KILO': 'growing_cost_per_kilo',
    'OPERATIONS COST PER KILO': 'ops_cost_per_kilo',
    'FEEDS COST PER HOGS KILO': 'feeds_cost_per_kilo',
    'SOLD FEEDS PPK': 'sold_feeds_ppk',
    'AVERAGE DAILY GAIN': 'adg',
    'FEED CONVERSION RATIO': 'fcr',
    'MORTALITY BASED ON HRVSTD PENS': 'mortality_pct',
    'AVERAGE WEIGHT PER HOG KG': 'avg_weight',
  },
};

// Sheet name → internal BU code ("BU01&BU02 Parameters" → BU0102, "BU04 …" → BU04).
function buFromSheet(name: string): string | null {
  const s = name.toUpperCase();
  if (/BU\s*0?1.*BU\s*0?2/.test(s)) return 'BU0102';
  const m = /BU\s*0*(\d+)/.exec(s);
  return m ? `BU${m[1].padStart(2, '0')}` : null;
}

// A BR "Parameters" workbook has one or more "<BU> Parameters" sheets.
export function isBuParametersWorkbook(wb: XLSX.WorkBook): boolean {
  return wb.SheetNames.some((n) => /parameters/i.test(n) && buFromSheet(n) !== null);
}

export function parseBuParameterStd(wb: XLSX.WorkBook): BuStdImport[] {
  const out: BuStdImport[] = [];
  for (const name of wb.SheetNames) {
    if (!/parameters/i.test(name)) continue;
    const buCode = buFromSheet(name);
    const map = buCode ? STD_MAP[buCode] : undefined;
    if (!buCode || !map) continue;

    const rows = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' });
    // Find the STD column (its header cell reads "STD").
    let stdCol = -1, hdrRow = -1;
    for (let r = 0; r < 10 && stdCol < 0; r++) {
      const i = (rows[r] ?? []).findIndex((v) => typeof v === 'string' && v.trim().toUpperCase() === 'STD');
      if (i >= 0) { stdCol = i; hdrRow = r; }
    }
    if (stdCol < 0) continue;

    const std: Record<string, number> = {};
    for (let r = hdrRow + 1; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue;
      const v = row[stdCol];
      if (typeof v !== 'number') continue;
      // Label = the last text cell before the STD column.
      let label = '';
      for (let c = stdCol - 1; c >= 0; c--) { const s = row[c]; if (typeof s === 'string' && s.trim()) { label = s.trim(); break; } }
      const key = map[norm(label)];
      if (key && !(key in std)) std[key] = v; // first occurrence wins
    }
    if (Object.keys(std).length) out.push({ buCode, std });
  }
  return out;
}
