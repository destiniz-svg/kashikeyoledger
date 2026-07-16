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

Write requests (any POST/PUT/PATCH/DELETE) require the `KASHIKEYO_API_KEY`
**or** a Supabase access token from a logged-in `organization_members` user
(`store.verifyMember()` checks the token via `/auth/v1/user` + membership).
Data reads require the full key or an optional read-only `KASHIKEYO_READ_API_KEY`
(reads stay open only when no key is configured). Write auth is **fail-closed**.
The web app (`frontend/`) signs users in with Supabase Auth and sends the token.

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

Deployed on Railway from the git repo — **one service hosts both the API and the
web app**. `railway.json` builds the frontend (`cd frontend && npm ci && npm run
build`) and starts the API (`npm start`); `/health` is the health check and
`.node-version` pins Node 22. The server (`src/server.ts`) must always bind
`0.0.0.0` on `process.env.PORT`.

`src/server.ts` also serves the built frontend from `frontend/dist` when present:
static assets by path (hashed assets cached immutably), an SPA fallback to
`index.html` for non-API GETs, and the service-info JSON moved from `/` to
`/api`. This is done with `node:fs` only — still no runtime dependencies. The
frontend's build-time env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_API_KEY`, optional `VITE_API_BASE_URL`) must be set as Railway service
variables so they're baked in during the build. (Netlify is no longer used.)

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

## Multi-jurisdiction & compliance (Phase 1)

The DB is multi-tenant (org-scoped) and now multi-**jurisdiction**, so country
tax logic stays isolated and replicable (see
[`supabase/phase1_multijurisdiction.sql`](supabase/phase1_multijurisdiction.sql)):

- **`jurisdictions`** (Maldives seeded); `organizations.jurisdiction_id` and
  `tax_rates.jurisdiction_id` scope tax to a country.
- **GST/TGST** live in `tax_rates` (effective-dated: GGST 8%, TGST 16%→17% from
  2025-07-01). **Green Tax** and **Withholding** are non-GST and live in
  `other_tax_rates` — never add them to the `tax_category` enum (keeps MIRA
  205/206 clean).
- **Immutable audit** (Tax Administration Act s.27): `fn_audit()` triggers log
  every insert/update/delete on the financial tables into `audit_log` with
  before/after state; `audit_log` is append-only. The app must set the acting
  identity per request via session GUCs — `set_config('app.actor_id', <uuid>,
  true)`, `'app.actor_type'` (`user`/`ai_agent`/`system`), `'app.actor_ip'` —
  so writes are attributed (falls back to the JWT subject, else `system`).
- **Dual currency**: every `transactions`/`payments` row carries `currency` +
  `fx_rate_to_base` (base = the org's `base_currency`, MVR). A trigger forces
  base = 1:1 and requires a real rate for foreign currency; `grand_total_base`,
  `tax_total_base`, `amount_base` are generated MVR amounts.

## AI ingestion (Phase 2)

Upload a receipt/invoice/bill and Claude reads it into structured, MIRA-mapped
data. Dependency-free — `src/aiExtract.ts` calls the Anthropic Messages API over
`fetch` (no SDK), model `claude-opus-4-8`, vision for images and a `document`
block for PDFs. A single forced tool (`record_extraction`, `tool_choice`) makes
the reply structured JSON we normalize and validate in code (no `strict`/beta
header dependency).

- **`POST /documents`** `{ filename, contentType, dataBase64, captureSource? }`
  (write-guarded; body cap raised to 15 MB for the base64 payload). Flow:
  store the file at `documents/<org>/<sha256>` (deduped by hash — re-uploading
  the same bytes returns the saved extraction, no second Claude call), insert a
  `documents` row, run extraction, write `ai_extractions`, move the doc to
  `EXTRACTED`/`EXTRACTION_FAILED`. **`GET /documents`** lists docs + extractions.
- **No `ANTHROPIC_API_KEY`** → the file is still stored, extraction is skipped,
  the doc stays `UPLOADED`, and the result carries an `error` note. Set
  `ANTHROPIC_API_KEY` (and optional `ANTHROPIC_MODEL`) as Railway service vars.
- The extraction captures vendor + **TIN**, dates, currency + FX, line items
  (each with a MIRA `taxCategory` + rate + accounting category), totals, a
  `predictedTaxCategory`, `confidenceScore`, `aiReasoning`, per-field confidence
  and derived `validationFlags` (e.g. `MISSING_VENDOR_TIN`, `TOTALS_MISMATCH`,
  `FOREIGN_CURRENCY_NO_FX`). The Maldives context (MVR/Rf, Thaana/English, the
  GGST 8% / TGST 17% / zero-rated / exempt / out-of-scope categories) lives in
  `EXTRACTION_SYSTEM_PROMPT`.
- Storage bucket: [`supabase/phase2_ai_ingestion.sql`](supabase/phase2_ai_ingestion.sql)
  (private, service-role only). The **in-memory** backend returns a canned
  extraction so the flow works with no key/DB. Frontend: the **AI Inbox** screen
  (`frontend/src/AIInbox.jsx`) — dropzone upload + explainable results.

## Explainable AI & human override (Phase 3)

Every extraction already ships its `confidenceScore`, per-field confidence and
`aiReasoning` (Phase 2). Phase 3 lets a human **correct** an extraction and
learns from it (`src/rules.ts`, pure/testable):

- **`POST /documents/:id/override`** `{ taxCategory?, accountingCategory?,
  vendorTin?, createRule?, ruleScope? }` (write-guarded) rewrites the stored
  extraction (document- and line-level), marks it `overridden`, recomputes
  `validationFlags`, and — unless `createRule:false` — saves a
  **categorization rule**. The rule keys on the vendor TIN (preferred), else the
  vendor name, or a keyword (`ruleScope:"keyword"`).
- **Auto-apply**: on ingest, `matchRule` finds the best active rule (lowest
  `priority`, then oldest) and `applyRuleToExtraction` rewrites the categories,
  recording `appliedRule` provenance (`label`, `matchedOn`, the original
  category) and bumping `times_applied`. Provenance lives in `appliedRule` /
  `overridden`, **not** in `validationFlags` (so a cleanly-ruled doc isn't
  counted as "needs review").
- **`GET /rules`** lists active rules (with a human `label`); **`DELETE
  /rules/:id`** soft-deactivates one (`is_active=false`).
- Table [`supabase/phase3_categorization_rules.sql`](supabase/phase3_categorization_rules.sql):
  `categorization_rules` (org-scoped; check constraints require ≥1 matcher and
  ≥1 outcome; audited by `fn_audit`). The **in-memory** backend keeps rules in
  process so the learn-and-apply loop works with no key/DB. Frontend: the **AI
  Inbox** override editor (tax + accounting category, "remember this vendor")
  and a **Learned rules** panel.

## MIRA-ready dashboard (Phase 4)

A readiness score + dual-currency view, computed from existing data (no new
tables). `src/compliance.ts` is pure/testable; the server assembles the inputs.

- **`GET /compliance`** returns a 0–100 `score` and `checks[]` (each `ok`/`warn`/
  `risk` with a `detail`): vendor-TIN completeness (+ `unclaimableInputTax` — GST
  that can't be claimed without a supplier TIN), AI-extraction review backlog,
  bank reconciliation, ledger balance, and the soonest open GST filing's due
  date. Score = 100 − (20 per risk, 8 per warn).
- **Dual currency**: every figure comes as `{ mvr, usd }` using `store.mvrPerUsd()`
  (latest `exchange_rates` USD→MVR, else the MMA peg **15.42**, seeded by
  [`supabase/phase4_dashboard.sql`](supabase/phase4_dashboard.sql)).
- Frontend `Dashboard.jsx`: a dark **dual-currency header** (MVR with USD
  underneath, FX chip) and a **MIRA readiness** widget (score ring + drill-through
  checks → Bills / AI Inbox / Banking / Tax filing / Reports).

## Ground rules for changes

- Add or update tests in `test/` for any behavior change; keep `npm test`
  green (runs entirely on the in-memory backend — no network).
- Keep the balancing invariant intact in both layers: every entry must balance
  (total debits == total credits) and `outOfBalanceBy()` must stay `0`.
- Changing DB behavior means updating both the SQL (`supabase/functions.sql`,
  applied as a migration) and the matching store/tests.
