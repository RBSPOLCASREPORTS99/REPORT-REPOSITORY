// Money values in pnl_lines are stored in ₱ thousands, matching the source
// workbook's own convention (see PROJECT brief §3 — "CRITICAL RULE").
export function formatThousands(value: number): string {
  const abs = Math.abs(value).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return value < 0 ? `(${abs})` : abs;
}

// Full pesos with thousands separators (expense detail is NOT in thousands).
export function formatPesos(value: number): string {
  const abs = Math.abs(value).toLocaleString('en-PH', { maximumFractionDigits: 0 });
  return value < 0 ? `(${abs})` : abs;
}

export function formatPercent(value: number): string {
  const pct = value * 100;
  const abs = Math.abs(pct).toFixed(1);
  return value < 0 ? `(${abs}%)` : `${abs}%`;
}

export function monthLabel(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1));
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function monthShortLabel(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1));
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}
