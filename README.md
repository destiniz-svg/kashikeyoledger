# Kashikeyo Ledger

A dependency-free **double-entry accounting** service in TypeScript, running on
Node.js 22+ via native type stripping — no build step, no runtime dependencies.

It has two layers:

1. **HTTP API** (`src/server.ts`) — the deployed service. It reads and writes
   the real Kashikeyo Ledger schema in **Supabase** (`ledger_accounts`,
   `journal_entries`, `journal_lines`), scoped to one organization. Without
   Supabase env vars it falls back to an in-memory store so it still runs
   locally. See [Backends](#backends).
2. **Pure library** (`src/ledger.ts`) — a standalone, in-memory double-entry
   engine with integer-minor-unit money, used by the demo and unit-tested in
   isolation.

## What it does

- Journal entries are only accepted if they **balance** (total debits equal
  total credits), have at least two lines, each line has exactly one of
  debit/credit, and reference known accounts — enforced both in the API layer
  and in the database (`post_journal_entry` SQL function).
- `GET /trial-balance` returns per-account debit/credit totals and a net
  balance, plus an `outOfBalanceBy` figure that is `0` for consistent books.

### Account types

The database constrains `account_type` to
`ASSET, LIABILITY, EXPENSE, COGS, TAX, BANK, FX` (note: **no** `EQUITY` or
`INCOME` — revenue/equity are modelled elsewhere in the wider schema).

## Requirements

- Node.js **>= 22.6** (uses native `.ts` execution via type stripping).

## Usage

```bash
npm start       # run the HTTP API server (listens on $PORT, default 3000)
npm test        # run the test suite
npm run demo    # run the worked example
npm run typecheck   # tsc --noEmit (needs `npm install` for the typescript dev dep)
```

### HTTP API

`npm start` runs a small dependency-free JSON API:

| Method & path        | Description                                                    |
| -------------------- | ------------------------------------------------------------- |
| `GET /health`        | Health check (used by the deploy platform); reports `backend` |
| `GET /`              | Service info, endpoint list, and `outOfBalanceBy`             |
| `GET /accounts`      | List the chart of accounts                                    |
| `POST /accounts`     | Create an account `{ code, name, accountType }`               |
| `GET /entries`       | List journal entries with their lines                         |
| `POST /entries`      | Post an entry `{ date, memo, lines: [{ accountCode, debit?, credit? }] }` |
| `GET /trial-balance` | Trial balance (per-account debit/credit + net balance)        |

Example — post a balanced entry:

```bash
curl -X POST "$BASE_URL/entries" -H 'content-type: application/json' -d '{
  "date": "2026-07-02",
  "memo": "Purchase inventory on account",
  "lines": [
    { "accountCode": "1200", "debit": 5000 },
    { "accountCode": "2000", "credit": 5000 }
  ]
}'
```

## Backends

`createStore()` selects the backend from the environment:

| Condition | Backend |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KASHIKEYO_ORG_ID` all set | **Supabase** — reads/writes the real schema for that organization |
| otherwise | **in-memory** — seeded starter chart, resets on restart |

Environment variables (see [`.env.example`](.env.example)):

| Variable | Description |
| --- | --- |
| `SUPABASE_URL` | Project URL, e.g. `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — a **secret**; set it in the host's env, never commit it |
| `KASHIKEYO_ORG_ID` | The `organizations.id` this service operates on |
| `PORT` | Provided by the host (Railway); defaults to `3000` |

The service authenticates to Supabase as a trusted backend with the
service-role key (bypassing RLS) and scopes every query to `KASHIKEYO_ORG_ID`.
Writes go through the `post_journal_entry` SQL function so the multi-row insert
is atomic and balance-checked in the database.

### Library example

```ts
import { Ledger, account, credit, debit, fromMajor, formatMoney } from "./src/index.ts";

const ledger = new Ledger();
ledger.addAccount(account("cash", "Cash", "asset"));
ledger.addAccount(account("capital", "Owner's Capital", "equity"));

ledger.post({
  date: "2026-07-01",
  description: "Owner invests capital",
  postings: [
    debit("cash", fromMajor(10_000)),
    credit("capital", fromMajor(10_000)),
  ],
});

console.log(formatMoney(ledger.balanceOf("cash"))); // "10000.00"
console.log(formatMoney(ledger.outOfBalanceBy()));  // "0.00"
```

See [`src/demo.ts`](src/demo.ts) for a fuller worked example.

## Project layout

| Path                  | Purpose                                                     |
| --------------------- | ---------------------------------------------------------- |
| `src/server.ts`       | HTTP API (the deployed service)                            |
| `src/store.ts`        | `LedgerStore` interface, shared validation, error types    |
| `src/supabaseStore.ts`| Supabase-backed store (real schema, via PostgREST + RPC)   |
| `src/memoryStore.ts`  | In-memory store (local dev / tests)                        |
| `src/createStore.ts`  | Picks the backend from environment variables               |
| `src/ledger.ts`       | Pure in-memory double-entry engine (library)               |
| `src/money.ts`        | Integer minor-unit money helpers (library)                 |
| `src/demo.ts`         | Runnable worked example of the library                     |
| `supabase/`           | SQL for the demo seed and ledger functions                 |
| `test/`               | `node:test` unit tests                                     |

## Deploying to Railway

This repo is Railway-ready. [`railway.json`](railway.json) sets the start
command (`npm start`), a `/health` health check, and pins Node via
[`.node-version`](.node-version). Because there is no build step and no runtime
dependencies, Railway just installs and starts the service.

1. Push this repo to GitHub (already the case).
2. In Railway: **New Project → Deploy from GitHub repo**, and pick this repo /
   the deployment branch.
3. Add the service **Variables** (Settings → Variables):
   - `SUPABASE_URL` — your project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — your service-role key (secret)
   - `KASHIKEYO_ORG_ID` — the organization id to operate on
   (`PORT` is injected by Railway automatically.)
4. Railway builds with Railpack, then runs `npm start` and binds `0.0.0.0:$PORT`.
5. Under **Settings → Networking**, click **Generate Domain**, then check
   `https://<domain>/health` (should report `"backend":"supabase"`) and
   `https://<domain>/trial-balance`.

Without the Supabase variables the service still boots on the in-memory backend
(`"backend":"memory"`), useful for a first smoke test.

## Status

Early scaffold. The core double-entry engine is in place and tested; there is
no persistence, reporting, or UI layer yet.

## License

MIT
