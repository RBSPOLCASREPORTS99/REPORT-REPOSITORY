// Test computing Expenses + Sales from raw QB Exp/Sales Data, then derive ranges.
// Usage: npx tsx scripts/seed-raw.ts <expenseXlsx> <salesXlsm> <url> <keyFile>
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { parseExpenseTransactions } from '../src/lib/importers/parseExpenseTransactions';
import { parseSalesTransactions } from '../src/lib/importers/parseSalesTransactions';
import { deriveRanges } from '../src/lib/pnl/deriveRanges';

const [, , expPath, salPath, url, keyFile] = process.argv;
const db = createClient(url, readFileSync(keyFile, 'utf8').trim(), { auth: { persistSession: false } });

function ab(p: string): ArrayBuffer { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; }

const exp = parseExpenseTransactions(ab(expPath));
console.log('expense: months', exp.months.length, 'rows', exp.rows.length, 'BUs', exp.buCodes.join(','));
const sal = parseSalesTransactions(ab(salPath));
console.log('sales: months', sal.months.length, 'rows', sal.rows.length, 'BUs', sal.buCodes.join(','));

// store monthly aggregates
await db.from('monthly_expense').delete().neq('id', 0);
for (let i = 0; i < exp.rows.length; i += 500) {
  await db.from('monthly_expense').insert(exp.rows.slice(i, i + 500).map((r) => ({ year: r.year, month: r.month, bu_code: r.buCode, section: r.section, group_name: r.groupName, account: r.account, amount: r.amount })));
}
await db.from('monthly_sales').delete().neq('id', 0);
for (let i = 0; i < sal.rows.length; i += 500) {
  await db.from('monthly_sales').insert(sal.rows.slice(i, i + 500).map((r) => ({ year: r.year, month: r.month, bu_code: r.buCode, item: r.item, uom: r.uom, qty: r.qty })));
}
console.log('stored monthly aggregates');

const { ranges } = await deriveRanges(db, 2026);
console.log('derived', ranges, 'ranges for 2026');
await db.from('report_ranges').update({ is_published: true }).eq('is_published', false);

// Verify May 2026 numbers vs finished report.
const { data: mayRange } = await db.from('report_ranges').select('id').eq('label', 'May 2026').single();
const { data: cassava } = await db.from('sales_qty_lines').select('qty, uom').eq('range_id', mayRange!.id).eq('bu_code', 'BU0102').eq('item', 'Cassava Granules/Meal').maybeSingle();
console.log(`\nBU0102 Cassava Granules/Meal May 2026 = ${cassava ? cassava.qty + ' ' + cassava.uom : 'NOT FOUND'} (finished = 503384 kgs)`);

const { data: expCtl } = await db.from('expense_lines').select('account, amount').eq('range_id', mayRange!.id).eq('bu_code', 'BU0102').eq('section', 'controllable').order('amount', { ascending: false }).limit(3);
console.log('BU0102 top controllable expenses May 2026:', (expCtl ?? []).map((r) => `${r.account}=${Math.round(r.amount)}`).join(', '));
