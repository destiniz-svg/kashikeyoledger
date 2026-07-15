# Kashikeyo Ledger

A small, dependency-free **double-entry accounting ledger** written in
TypeScript. It runs directly on Node.js 22+ using native type stripping — no
build step, no runtime dependencies.

## What it does

- Register **accounts** across the five standard categories (asset, liability,
  equity, income, expense), each with a currency.
- Record **journal entries** made of debit/credit **postings**. Entries are
  only accepted if they:
  - have at least two postings,
  - reference known accounts,
  - use a single currency,
  - use positive amounts, and
  - **balance** (total debits equal total credits).
- Derive **account balances**, a **trial balance**, and an
  `outOfBalanceBy()` check straight from the entry history, so the ledger is
  always internally consistent.

Money is stored as **integer minor units** (e.g. cents) to avoid
floating-point rounding errors.

## Requirements

- Node.js **>= 22.6** (uses native `.ts` execution via type stripping).

## Usage

```bash
npm test        # run the test suite
npm run demo    # run the worked example
npm run typecheck   # tsc --noEmit (needs `npm install` for the typescript dev dep)
```

### Example

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

| Path             | Purpose                                            |
| ---------------- | -------------------------------------------------- |
| `src/money.ts`   | Integer minor-unit money helpers                   |
| `src/types.ts`   | Account / posting / journal-entry types            |
| `src/ledger.ts`  | The `Ledger` class and validation                  |
| `src/index.ts`   | Public API surface                                 |
| `src/demo.ts`    | Runnable worked example                            |
| `test/`          | `node:test` unit tests                             |

## Status

Early scaffold. The core double-entry engine is in place and tested; there is
no persistence, reporting, or UI layer yet.

## License

MIT
