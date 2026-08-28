import { formatMoney, formatPercent } from './format';
import type { TruckPnlResult } from './queries';

// Build a clean, paginated print document for the Simulated P&L per Truck —
// one truck (and a final "All Trucks" total) per page — and send it to print
// via a hidden iframe (works inside the app window; no popup blocker issues).
export function printTruckPnl(
  data: TruckPnlResult,
  priorLabel: string,
  currentLabel: string,
  units: 'thousands' | 'full',
) {
  if (!data.hasData) return;
  const money = (v: number) => formatMoney(v, 'thousands', units);
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] ?? c));

  const order = [...data.trucks, 'TOTAL'];
  const sections = order.map((code) => {
    const lines = data.pnl[code] ?? [];
    if (lines.length === 0) return '';
    const inc = lines.find((l) => l.kind === 'income');
    const incC = inc?.current || 0, incP = inc?.prior || 0;
    const body = lines.map((l) => {
      const bold = l.kind !== 'account';
      const diff = l.current - l.prior;
      const favorable = l.cost ? diff < 0 : diff >= 0;
      const cls = [bold ? 'b' : '', l.kind === 'net' ? 'net' : '', l.kind === 'gross' ? 'gross' : ''].filter(Boolean).join(' ');
      return `<tr class="${cls}">`
        + `<td class="lbl${l.kind === 'account' ? ' ind' : ''}">${esc(l.label)}</td>`
        + `<td class="num">${money(l.prior)}</td>`
        + `<td class="pct">${formatPercent(incP ? l.prior / incP : 0)}</td>`
        + `<td class="num">${money(l.current)}</td>`
        + `<td class="pct">${formatPercent(incC ? l.current / incC : 0)}</td>`
        + `<td class="num ${favorable ? 'fav' : 'unfav'}">${diff >= 0 ? '&#9650;' : '&#9660;'} ${money(Math.abs(diff))}</td>`
        + `<td class="num ${favorable ? 'fav' : 'unfav'}">${formatPercent(l.chg)}</td>`
        + `</tr>`;
    }).join('');
    return `<section class="pg">`
      + `<div class="hd"><div class="co">POLCAS AGRI TRADE CORP.</div>`
      + `<div class="ti">Simulated P&amp;L per Truck &mdash; ${code === 'TOTAL' ? 'All Trucks' : esc(code)}</div>`
      + `<div class="pd">${esc(currentLabel)} vs ${esc(priorLabel)} &nbsp;&middot;&nbsp; ₱ ${units === 'thousands' ? "'000" : 'full'}</div></div>`
      + `<table><thead><tr><th class="lbl">Line Item</th><th>${esc(priorLabel)}</th><th>%</th><th>${esc(currentLabel)}</th><th>%</th><th>Diff</th><th>%Diff</th></tr></thead>`
      + `<tbody>${body}</tbody></table></section>`;
  }).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Simulated P&L per Truck</title><style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .pg { page-break-after: always; }
    .pg:last-child { page-break-after: auto; }
    .hd { border-bottom: 2px solid #2f6b1e; padding-bottom: 6px; margin-bottom: 10px; }
    .co { font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: #2f6b1e; font-weight: 600; }
    .ti { font-size: 17px; font-weight: 700; margin-top: 2px; }
    .pd { font-size: 11px; color: #666; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { padding: 4px 7px; border-bottom: 1px solid #eaeaea; }
    thead th { text-align: right; background: #f2f4ef; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: #555; border-bottom: 1px solid #cfd8c5; }
    th.lbl, td.lbl { text-align: left; }
    td.num, td.pct { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    td.pct { color: #999; font-size: 10px; }
    td.ind { padding-left: 20px; color: #444; }
    tr.b td { font-weight: 700; background: #f7f8f5; }
    tr.gross td, tr.net td { color: #1b4d12; }
    tr.net td { border-top: 2px solid #333; font-size: 12px; }
    .fav { color: #087443; }    /* favourable movement — green */
    .unfav { color: #b91c1c; }  /* unfavourable movement — red */
  </style></head><body>${sections}</body></html>`;

  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  iframe.setAttribute('aria-hidden', 'true');
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) { iframe.remove(); return; }
    win.focus();
    win.onafterprint = () => iframe.remove();
    win.print();
    setTimeout(() => { if (iframe.parentNode) iframe.remove(); }, 60000);
  };
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}
