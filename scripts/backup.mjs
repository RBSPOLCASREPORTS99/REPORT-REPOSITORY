// Data backup: dump every app table to backups/<table>.json via the Supabase
// REST API using the secret (service-role) key. Combined with the SQL migrations
// in supabase/migrations, these snapshots are a full restore point. Run by the
// "Supabase backup" GitHub Action on a schedule (SUPABASE_URL + SUPABASE_SECRET_KEY
// from env / repo secret).
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!URL || !KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SECRET_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const TABLES = [
  'business_units', 'periods', 'profiles', 'allowed_users', 'allowed_user_bus',
  'profile_bus', 'item_units', 'pnl_months', 'monthly_pnl_inputs',
  'monthly_pnl_pools', 'monthly_trucking', 'report_ranges', 'computed_pnl',
  'expense_lines', 'sales_qty_lines', 'monthly_expense', 'monthly_sales',
  'support_sim', 'import_batches', 'pnl_lines',
];

async function dump(table) {
  const rows = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const res = await fetch(`${URL}/rest/v1/${table}?select=*&limit=${page}&offset=${offset}`, { headers: H });
    if (!res.ok) { console.error(`  ${table}: ${res.status} ${(await res.text()).slice(0, 120)}`); return null; }
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < page) break;
  }
  return rows;
}

mkdirSync('backups', { recursive: true });
let total = 0;
const summary = { generatedAt: new Date().toISOString(), tables: {} };
for (const t of TABLES) {
  const rows = await dump(t);
  if (rows === null) continue;
  writeFileSync(`backups/${t}.json`, JSON.stringify(rows, null, 0));
  summary.tables[t] = rows.length;
  total += rows.length;
  console.log(`  ${t}: ${rows.length} rows`);
}
writeFileSync('backups/_manifest.json', JSON.stringify(summary, null, 2));
console.log(`Backed up ${TABLES.length} tables, ${total} rows.`);
