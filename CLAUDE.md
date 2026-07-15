# CLAUDE.md

Guidance for Claude Code (and Claude Projects) working in this repository.

## What this is

Kashikeyo Ledger — a dependency-free double-entry accounting service in
TypeScript, on Node.js 22+ via native type stripping (**no build step**, **no
runtime dependencies**).

Two layers:
- **HTTP API** (`src/server.ts`) over a `LedgerStore`. Backend is chosen by
  `createStore()`: **Supabase** (real schema: `ledger_accounts`,
  `journal_entries`, `journal_lines`, org-scoped) when `SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` + `KASHIKEYO_ORG_ID` are set, else an **in-memory**
  store.
- **Pure library** (`src/ledger.ts`, `src/money.ts`) — standalone in-memory
  engine with integer-minor-unit money, used by `src/demo.ts`.

Writes to Supabase go through the `post_journal_entry` SQL function (see
`supabase/functions.sql`) so the insert is atomic and balance-checked in the DB.

Write requests (any POST/PUT/PATCH/DELETE) require an API key via `src/auth.ts`
(`KASHIKEYO_API_KEY`); data reads require the full key or an optional read-only
`KASHIKEYO_READ_API_KEY` (reads stay open only when no key is configured).
Write auth is **fail-closed** — with no key configured, writes are rejected (503).

**Revenue** is not in the journal (no `INCOME` account type). `POST /sales`
records a `POS_SALE` in `transactions` + `transaction_line_items` via the
`record_sale` SQL function; `GET /revenue` aggregates via `org_revenue`.
API-recorded sales are attributed to a system account (`system@kashikeyo.local`).

## Commands

```bash
npm start          # run the HTTP API server (src/server.ts), binds to $PORT (default 3000)
npm test           # run all tests (node:test) — no install needed
npm run demo       # run the worked example in src/demo.ts
npm run typecheck  # tsc --noEmit (requires `npm install` first for the typescript dev dep)
```

## Deployment

Deployed on Railway from the git repo. `railway.json` defines the start command
(`npm start`) and `/health` health check; `.node-version` pins Node 22. The
server (`src/server.ts`) must always bind `0.0.0.0` on `process.env.PORT`.

Run a single test file directly:

```bash
node --test test/ledger.test.ts
```

## Conventions

- **Account types** are limited by the DB check constraint to
  `ASSET, LIABILITY, EXPENSE, COGS, TAX, BANK, FX` (no `EQUITY`/`INCOME`).
- **API/store amounts are decimal major units** (numeric, e.g. MVR), matching
  the `debit`/`credit` columns. Balance checks compare in minor units
  (`toMinor`, `Math.round(x*100)`) to avoid float wobble.
- The **pure library** (`src/ledger.ts`) uses **integer minor units**; don't
  conflate the two layers.
- **No native TS beyond type-stripping**: Node runs `.ts` in strip-only mode, so
  do NOT use enums, `namespace`, decorators, or constructor **parameter
  properties** (`constructor(readonly x)`). Declare fields explicitly.
- Use `.ts` extensions in imports (NodeNext + type stripping), e.g.
  `import { createStore } from "./createStore.ts"`.
- The service-role key is a secret: read from env only, never commit it.

## Ground rules for changes

- Add or update tests in `test/` for any behavior change; keep `npm test`
  green (runs entirely on the in-memory backend — no network).
- Keep the balancing invariant intact in both layers: every entry must balance
  (total debits == total credits) and `outOfBalanceBy()` must stay `0`.
- Changing DB behavior means updating both the SQL (`supabase/functions.sql`,
  applied as a migration) and the matching store/tests.
