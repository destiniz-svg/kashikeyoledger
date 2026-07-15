# CLAUDE.md

Guidance for Claude Code (and Claude Projects) working in this repository.

## What this is

Kashikeyo Ledger — a small, dependency-free double-entry accounting ledger in
TypeScript. It runs directly on Node.js 22+ via native type stripping, so there
is **no build step** and **no runtime dependencies**.

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

- **Money is integer minor units** (cents). Never store money as a float.
  Convert user-facing decimals with `fromMajor` and render with `formatMoney`
  (both in `src/money.ts`).
- **Amounts on postings are always positive**; the `direction` (`"debit"` /
  `"credit"`) carries the meaning, not the sign.
- **Balances are derived**, never stored. Anything that changes account state
  goes through `Ledger.post()` so the balancing invariant is enforced in one
  place.
- Prefer plain functions and small, explicit types. Keep the core free of
  external dependencies.
- Use `.ts` extensions in imports (required by NodeNext + native type
  stripping), e.g. `import { Ledger } from "./ledger.ts"`.

## Ground rules for changes

- Add or update tests in `test/` for any behavior change; keep `npm test`
  green.
- Keep the accounting invariant intact: every posted entry must balance
  (total debits == total credits) and `Ledger.outOfBalanceBy()` must stay `0`
  for a consistent set of books.
