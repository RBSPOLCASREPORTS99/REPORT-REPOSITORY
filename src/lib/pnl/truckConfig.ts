import type { ParsedPivot } from '../importers/parsePivotTab';

// The BU10 - TRUCKING fleet shown in the Simulated P&L per Truck. Each truck is
// identified across three sources by its PLATE number:
//   - QuickBooks "P&L by Class" column: "BU10 - <plate> <code>" (expenses)
//   - TRUCKING DASHBOARD "Sales per Truck" row: keyed by plate (income)
//   - the finished SIM P&L sheet: keyed by code (WV01… / CT01…)
export interface TruckDef {
  code: string;  // short code used as the display/label (WV01, CT01, …)
  plate: string; // plate number — the universal join key across sources
}

export const TRUCKS: TruckDef[] = [
  { code: 'WV01', plate: 'CAD8043' },
  { code: 'WV02', plate: 'CAY4926' },
  { code: 'WV03', plate: 'CBN4192' },
  { code: 'WV04', plate: 'MAM1345' },
  { code: 'WV05', plate: 'MAU6759' },
  { code: 'WV06', plate: 'CBS4170' },
  { code: 'CT01', plate: 'CCE3645' },
  { code: 'CT02', plate: 'JAD6951' },
  { code: 'CT03', plate: 'CBR9033' },
];

const byPlate = new Map(TRUCKS.map((t) => [t.plate.toUpperCase(), t]));
export function truckByPlate(plate: string): TruckDef | undefined {
  return byPlate.get(plate.trim().toUpperCase());
}

// Find the QB pivot column header for a truck. QB headers embed the plate, e.g.
// "BU10 - CAD8043 WV1" or "BU10 - CT01 CCE3645", so we match on the plate.
export function truckPivotColumn(pivot: ParsedPivot, plate: string): string | null {
  const p = plate.trim().toUpperCase();
  const col = pivot.columns.find((c) => c.header.toUpperCase().includes(p));
  return col ? col.header : null;
}
