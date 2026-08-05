// BU10 Trucking parameters — shared constants for the config, the TRUCKING
// DASHBOARD parser, and the persist step. The base quantities (kilos delivered,
// fuel/maint/payroll cost, trips, km run, weeks) are aggregated from the
// dashboard's weekly "Parameters Data" into months and stored like manual
// parameters; the KPIs are ratios over them (recomputed per period), so the
// system's Month / YTD / Quarter comparison replaces the sheet's weekly one.

export interface Bu10Truck { data: string; code: string; plate: string; std: number }

// data = the row label in "Parameters Data" (WV1..CT03); code/plate = display.
export const BU10_TRUCKS: Bu10Truck[] = [
  { data: 'WV1', code: 'WV01', plate: 'CAD8043', std: 2.5 },
  { data: 'WV2', code: 'WV02', plate: 'CAY4926', std: 2.5 },
  { data: 'WV3', code: 'WV03', plate: 'CBN4192', std: 2.5 },
  { data: 'WV4', code: 'WV04', plate: 'MAM1345', std: 2.5 },
  { data: 'WV5', code: 'WV05', plate: 'MAU6759', std: 2.5 },
  { data: 'WV6', code: 'WV06', plate: 'CBS4170', std: 2.5 },
  { data: 'CT01', code: 'CT01', plate: 'CCE3645', std: 2.5 },
  { data: 'CT02', code: 'CT02', plate: 'JAD6951', std: 9.5 },
  { data: 'CT03', code: 'CT03', plate: 'CBR9033', std: 4 },
];

export const bu10KmplKey = (code: string) => `kmpl_${code}`;

// Base quantity keys the importer writes into bu_parameters for BU10.
export const BU10_BASE_KEYS = [
  'del_kilos', 'fuel_cost', 'maint_cost', 'payroll', 'trips', 'km_run', 'weeks', 'ave_trips_wk',
  ...BU10_TRUCKS.map((t) => bu10KmplKey(t.code)),
];

// STD (target) values from the dashboard "Parameters" sheet's STD column.
export const BU10_STD: Record<string, number> = {
  trucking_cost_per_kilo: 0.40,
  fuel_cost_per_kilo: 0.15,
  maint_cost_per_kilo: 0.10,
  kilos_delivered_wk: 344181,
  ave_trips_wk: 6,
  trips_per_week: 54,
  ...Object.fromEntries(BU10_TRUCKS.map((t) => [bu10KmplKey(t.code), t.std])),
};
