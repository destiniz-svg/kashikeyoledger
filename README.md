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
| `POST /accounts` 🔒  | Create an account `{ code, name, accountType }` (requires API key) |
| `GET /entries`       | List journal entries with their lines                         |
| `POST /entries` 🔒   | Post an entry `{ date, memo, lines: [{ accountCode, debit?, credit? }] }` (requires API key) |
| `GET /trial-balance` | Trial balance (per-account debit/credit + net balance)        |
| `GET /sales`         | List POS sales with their line items                          |
| `POST /sales` 🔒     | Record a sale `{ date, currency?, notes?, lines: [{ description, quantity?, unitPrice, taxCategory?, taxRatePercent? }] }` |
| `GET /revenue`       | Revenue totals for a period `?from=YYYY-MM-DD&to=YYYY-MM-DD`   |
| `GET /dashboard`     | Aggregates for the web dashboard (AP, cash, expenses, tax, revenue MTD) |

Responses include permissive CORS headers (`Access-Control-Allow-Origin: *`) so
the browser frontend can call the API cross-origin.

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
| `KASHIKEYO_API_KEY` | API key for writes + reads (see [Authentication](#authentication)) |
| `KASHIKEYO_READ_API_KEY` | Optional read-only key (reads only, not writes) |
| `PORT` | Provided by the host (Railway); defaults to `3000` |

The service authenticates to Supabase as a trusted backend with the
service-role key (bypassing RLS) and scopes every query to `KASHIKEYO_ORG_ID`.
Writes go through the `post_journal_entry` SQL function so the multi-row insert
is atomic and balance-checked in the database.

## Authentication

Send the key as either header on a request:

```bash
curl "$BASE_URL/trial-balance" -H "X-API-Key: $KASHIKEYO_API_KEY"
# or:  -H "Authorization: Bearer $KASHIKEYO_API_KEY"
```

**Writes** (`POST /accounts`, `/entries`, `/sales`) require the full
`KASHIKEYO_API_KEY`. They are **fail-closed**: `401` if no key is presented,
`403` if it is wrong, and `503` if the server has no key configured (writes are
never left open).

**Reads** (`GET /accounts`, `/entries`, `/trial-balance`, `/sales`, `/revenue`)
accept either the full key or an optional read-only `KASHIKEYO_READ_API_KEY`.
When *any* key is configured, reads require a valid key (`401`/`403`); when none
is configured they stay open (local dev). `GET /health` and `GET /` are always
open. Keys are compared in constant time. Generate one with:

```bash
node -e "console.log('sk_'+require('crypto').randomBytes(24).toString('hex'))"
```

## Revenue and sales

Your `account_type` set has no `INCOME` type, so revenue is **not** posted to the
double-entry journal — it lives in the `transactions` table. `POST /sales`
records a `POS_SALE` transaction plus line items via the `record_sale` SQL
function, computing each line's subtotal and tax (by `taxCategory` /
`taxRatePercent`) and the transaction totals. `GET /revenue?from=&to=` returns
revenue and tax totals for a period.

Because `transactions.created_by` references a real user, API-recorded sales are
attributed to a **system service-account** (`system@kashikeyo.local`), created
once (see [`supabase/system_account.sql`](supabase/system_account.sql)).

```bash
curl -X POST "$BASE_URL/sales" \
  -H "X-API-Key: $KASHIKEYO_API_KEY" -H 'content-type: application/json' -d '{
  "date": "2026-07-10", "currency": "MVR",
  "lines": [
    { "description": "Room night", "quantity": 2, "unitPrice": 1500, "taxCategory": "TGST", "taxRatePercent": 16 },
    { "description": "Bottled water", "quantity": 3, "unitPrice": 25, "taxCategory": "GGST", "taxRatePercent": 8 }
  ]
}'
```

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
| `src/auth.ts`         | API-key authentication for write requests                  |
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
   - `KASHIKEYO_API_KEY` — API key for write requests (secret)
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
