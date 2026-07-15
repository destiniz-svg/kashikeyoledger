import assert from "node:assert/strict";
import { test } from "node:test";
import { Ledger, LedgerError, account, credit, debit } from "../src/ledger.ts";

function seed(): Ledger {
  const l = new Ledger();
  l.addAccount(account("cash", "Cash", "asset"));
  l.addAccount(account("capital", "Owner's Capital", "equity"));
  l.addAccount(account("rent", "Rent Expense", "expense"));
  l.addAccount(account("loan", "Bank Loan", "liability"));
  return l;
}

test("a balanced entry posts and updates balances", () => {
  const l = seed();
  l.post({
    date: "2026-07-01",
    description: "Initial capital",
    postings: [debit("cash", 10_000), credit("capital", 10_000)],
  });
  assert.equal(l.balanceOf("cash"), 10_000);
  assert.equal(l.balanceOf("capital"), 10_000);
  assert.equal(l.outOfBalanceBy(), 0);
});

test("debits and credits move accounts in their normal direction", () => {
  const l = seed();
  l.post({
    date: "2026-07-02",
    description: "Pay rent from cash",
    postings: [debit("rent", 1_500), credit("cash", 1_500)],
  });
  // Expense (debit-normal) goes up; asset (debit-normal) goes down.
  assert.equal(l.balanceOf("rent"), 1_500);
  assert.equal(l.balanceOf("cash"), -1_500);
});

test("credit-normal accounts increase on credits", () => {
  const l = seed();
  l.post({
    date: "2026-07-03",
    description: "Take a loan",
    postings: [debit("cash", 5_000), credit("loan", 5_000)],
  });
  assert.equal(l.balanceOf("loan"), 5_000);
});

test("an unbalanced entry is rejected", () => {
  const l = seed();
  assert.throws(
    () =>
      l.post({
        date: "2026-07-04",
        description: "Broken",
        postings: [debit("cash", 100), credit("capital", 99)],
      }),
    LedgerError,
  );
  // Nothing should have been recorded.
  assert.equal(l.entries().length, 0);
  assert.equal(l.balanceOf("cash"), 0);
});

test("entries referencing unknown accounts are rejected", () => {
  const l = seed();
  assert.throws(
    () =>
      l.post({
        date: "2026-07-05",
        description: "Ghost account",
        postings: [debit("cash", 100), credit("nope", 100)],
      }),
    /unknown account/,
  );
});

test("entries mixing currencies are rejected", () => {
  const l = new Ledger();
  l.addAccount(account("usd", "USD Cash", "asset", "USD"));
  l.addAccount(account("eur", "EUR Cash", "asset", "EUR"));
  assert.throws(
    () =>
      l.post({
        date: "2026-07-06",
        description: "Cross currency",
        postings: [debit("usd", 100), credit("eur", 100)],
      }),
    /mixes currencies/,
  );
});

test("postings must be positive", () => {
  const l = seed();
  assert.throws(
    () =>
      l.post({
        date: "2026-07-07",
        description: "Negative",
        postings: [debit("cash", -100), credit("capital", -100)],
      }),
    /positive amount/,
  );
});

test("an entry needs at least two postings", () => {
  const l = seed();
  assert.throws(
    () =>
      l.post({
        date: "2026-07-08",
        description: "Lonely",
        postings: [debit("cash", 100)],
      }),
    /at least two postings/,
  );
});

test("duplicate account ids are rejected", () => {
  const l = seed();
  assert.throws(() => l.addAccount(account("cash", "Dup", "asset")), /already exists/);
});

test("a multi-line entry balances across several postings", () => {
  const l = seed();
  l.post({
    date: "2026-07-09",
    description: "Split payment",
    postings: [
      debit("rent", 1_000),
      debit("cash", 200), // refund received alongside
      credit("capital", 1_200),
    ],
  });
  assert.equal(l.outOfBalanceBy(), 0);
  assert.equal(l.balanceOf("rent"), 1_000);
});

test("trial balance covers every account and the books balance", () => {
  const l = seed();
  l.post({
    date: "2026-07-10",
    description: "Capital",
    postings: [debit("cash", 8_000), credit("capital", 8_000)],
  });
  l.post({
    date: "2026-07-11",
    description: "Rent",
    postings: [debit("rent", 500), credit("cash", 500)],
  });
  const tb = l.trialBalance();
  assert.equal(tb.length, 4);
  assert.equal(l.outOfBalanceBy(), 0);
});

test("generated entry ids are assigned when omitted", () => {
  const l = seed();
  const e = l.post({
    date: "2026-07-12",
    description: "Auto id",
    postings: [debit("cash", 1), credit("capital", 1)],
  });
  assert.match(e.id, /^je-\d+$/);
});
