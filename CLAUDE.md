# Business Review (BR)

Working notes for anyone — human or Claude Code — changing this system.
Read this before touching SQL or deployment config.

## The one rule that matters

**This repo owns the `public` schema. It owns nothing else.**

One Supabase project (`gfbchmihslthtuesfurb`) hosts six live PAC systems:

| Schema | System |
|---|---|
| `emp_coop` | Employees' Cooperative |
| `trading` | Trading |
| `pac` | Warehouse Inventory |
| `lakatan` | Lakatan Operations |
| `hpg` | Hog Feeds Growing |
| `cr` | Cash Request / Fuel / Leave & OT |
| `public` | **this system** — see the warning below |

They belong to different teams and hold real financial records. A change here
must never read, write or drop anything outside `public`.

Concretely:

- Never write SQL that names another schema. `.github/workflows/schema-guard.yml`
  fails the build if you do.
- Never use the project **secret key** (`service_role` / `sb_secret_…`). It
  bypasses row-level security across all six systems.
- Never apply DDL from the Supabase dashboard SQL editor. That connection is
  privileged and unlogged, and nothing in this repo will record what you did.
  Schema changes go in `supabase/migrations/` as a numbered migration.
- Never point a destructive script at the production database "just to check".

## ⚠️ This system occupies `public`

Unlike its five siblings, this app's tables live in `public` — the default
schema, which every other system carries in its `search_path`. That means an
unqualified table name in another system can resolve to a table here.

Until this system is moved to its own `br` schema:

- Do not create a table in `public` whose name could collide with a common
  business noun (`users`, `items`, `logs`, `config`, `entries`).
- Prefix new tables with `br_` so a collision is impossible.
- Treat any change to `public` as higher-risk than the same change elsewhere.

## Deploying

A push to `main` runs `.github/workflows/deploy.yml`, which publishes to Cloudflare Pages.

There is no approval gate — a push to `main` goes live. That is deliberate, so
the team can move quickly. It works because:

1. **schema-guard** blocks the cross-system mistake before it deploys.
2. **Cloudflare Pages keeps every past deployment.** A bad deploy is undone from
   the Pages dashboard in about a minute — Deployments → the last good one →
   Rollback. Do that first and diagnose afterwards.

## Credentials

Everything secret lives in `.env` (gitignored), in Cloudflare Pages environment
variables, or in GitHub repo secrets. Nothing secret goes in the repo.

Read the values from the Supabase dashboard yourself rather than asking a
teammate to paste them into a chat.
## Changing the database

1. Add a numbered file to `supabase/migrations/` — never edit an applied migration.
2. Make it idempotent (`if not exists`, `create or replace`) so re-running is safe.
3. Reference only `public` objects.
4. Apply it with this repo's scoped credential, not the postgres superuser
   string. See `docs/OWNER-ROLE.sql`.

## If you break something

Say so in the team chat immediately — that is the whole cost of working without
approvals, and it is much cheaper than a silent breakage. Roll back the
Cloudflare deployment first, then work out what happened.
