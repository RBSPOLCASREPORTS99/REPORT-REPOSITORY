// ============================================================================
// schema-guard — refuses to let this repo touch another system's data.
//
// One Supabase project hosts six live PAC systems, one schema each. This repo
// owns `public`. Two things would breach that, and both are easy to do by
// accident — a migration copy-pasted from a sibling repo, or an assistant
// inferring the wrong schema name:
//
//   1. SQL that names another system's schema.
//   2. The project secret key in application code. It bypasses row-level
//      security across ALL six systems, so wherever it appears, per-schema
//      privileges stop meaning anything.
//
// Run by .github/workflows/schema-guard.yml on every push. It is what lets the
// team deploy without waiting for review: the cross-system mistake cannot ship.
//
// Locally:  node scripts/schema-guard.mjs
//
// A deliberate exception is declared by putting `isolation-ok:` and a reason on
// the offending line or the two lines above it. That keeps exceptions visible
// and greppable instead of silently excluded.
// ============================================================================
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const OWN = "public";
const FORBIDDEN = ["emp_coop","trading","pac","lakatan","hpg","cr"];
const SQL_DIRS = ["supabase/migrations"];
const CODE_EXT = ['.js', '.mjs', '.cjs', '.ts', '.tsx'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'backups', '.git', '.wrangler']);

const alt = FORBIDDEN.join('|');

// A schema-qualified reference: a SQL keyword, then the schema, then a dot.
// Requiring the keyword is what stops a table ALIAS (`... from change_requests
// cr where cr.id = 1`) from being mistaken for a cross-schema read.
const QUALIFIED = new RegExp(
  `\\b(from|join|into|update|table|references|truncate)\\s+"?(${alt})"?\\.`, 'i');

// `drop schema pac cascade`, `grant usage on schema hpg to …` — no dot involved.
const SCHEMA_KW = new RegExp(`\\bschema\\s+"?(${alt})"?\\b`, 'i');

// The omnipotent credential, in any of its spellings.
const SECRET_KEY = /sb_secret_|SERVICE_ROLE_KEY|SB_SECRET_KEY|service_role/;

const isSqlComment  = (l) => /^\s*--/.test(l);
const isCodeComment = (l) => /^\s*(\/\/|\/\*|\*|#)/.test(l);

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e)) continue;
    const full = path.join(dir, e);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// An exception may be declared on the line itself or the two lines above it.
const excused = (lines, i) =>
  lines.slice(Math.max(0, i - 2), i + 1).some((l) => l.includes('isolation-ok:'));

const problems = [];

// ---- 1. SQL must stay inside this repo's own schema -------------------------
for (const dir of SQL_DIRS) {
  for (const file of walk(dir).filter((f) => f.endsWith('.sql'))) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (isSqlComment(line) || excused(lines, i)) return;
      const hit = line.match(QUALIFIED) ?? line.match(SCHEMA_KW);
      if (!hit) return;
      problems.push({
        file, line: i + 1, text: line.trim().slice(0, 120),
        why: `references schema "${hit[2] ?? hit[1]}", which belongs to another system`,
      });
    });
  }
}

// ---- 2. The secret key must not appear in application code ------------------
// This file defines the patterns it looks for, so it necessarily contains them.
const SELF = path.resolve(process.argv[1]);

for (const file of walk('.').filter((f) => CODE_EXT.includes(path.extname(f)))) {
  if (path.resolve(file) === SELF) continue;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (isCodeComment(line) || excused(lines, i)) return;
    if (!SECRET_KEY.test(line)) return;
    problems.push({
      file, line: i + 1, text: line.trim().slice(0, 120),
      why: 'uses the project secret key, which bypasses security on all six systems',
    });
  });
}

if (problems.length === 0) {
  console.log(`schema-guard: OK — everything stays inside "${OWN}".`);
  process.exit(0);
}

console.error(`\nschema-guard: ${problems.length} problem(s). This repo owns "${OWN}" and nothing else.\n`);
for (const p of problems) {
  const loc = `${p.file.replace(/\\\\/g, '/')}:${p.line}`;
  console.error(`  ${loc}`);
  console.error(`    ${p.text}`);
  console.error(`    -> ${p.why}\n`);
  if (process.env.GITHUB_ACTIONS) {
    console.error(`::error file=${p.file},line=${p.line}::${p.why}`);
  }
}
console.error(
  'The other PAC systems hold real financial records and are not yours to change.\n'
  + 'If you need their data, ask that system\'s owner for a view or an endpoint.\n'
  + ''
  + 'A deliberate exception needs "isolation-ok: <reason>" on or just above the line.\n');
process.exit(1);
