import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryStore } from "../src/memoryStore.ts";
import { StoreError, validateEntry } from "../src/store.ts";

test("a balanced entry posts and updates the trial balance", async () => {
  const s = new MemoryStore();
  await s.postEntry({
    date: "2026-07-02",
    memo: "Purchase inventory on account",
    lines: [
      { accountCode: "1200", debit: 5000 },
      { accountCode: "2000", credit: 5000 },
    ],
  });
  const tb = await s.trialBalance();
  const inventory = tb.find((r) => r.code === "1200");
  const payable = tb.find((r) => r.code === "2000");
  assert.equal(inventory?.balance, 5000);
  assert.equal(payable?.balance, -5000);
  assert.equal(await s.outOfBalanceBy(), 0);
});

test("an unbalanced entry is rejected and nothing is stored", async () => {
  const s = new MemoryStore();
  await assert.rejects(
    () =>
      s.postEntry({
        date: "2026-07-03",
        memo: "bad",
        lines: [
          { accountCode: "1200", debit: 100 },
          { accountCode: "2000", credit: 99 },
        ],
      }),
    StoreError,
  );
  assert.equal((await s.listEntries()).length, 0);
});

test("a line with both debit and credit is rejected", () => {
  assert.throws(
    () =>
      validateEntry({
        date: "2026-07-04",
        memo: "both sides",
        lines: [
          { accountCode: "1200", debit: 10, credit: 10 },
          { accountCode: "2000", credit: 10 },
        ],
      }),
    /exactly one of debit or credit/,
  );
});

test("an entry with fewer than two lines is rejected", () => {
  assert.throws(
    () =>
      validateEntry({
        date: "2026-07-05",
        memo: "lonely",
        lines: [{ accountCode: "1200", debit: 10 }],
      }),
    /at least two lines/,
  );
});

test("posting to an unknown account code is rejected", async () => {
  const s = new MemoryStore();
  await assert.rejects(
    () =>
      s.postEntry({
        date: "2026-07-06",
        memo: "ghost",
        lines: [
          { accountCode: "9999", debit: 10 },
          { accountCode: "2000", credit: 10 },
        ],
      }),
    /Unknown account code/,
  );
});

test("fractional amounts balance using minor-unit comparison", () => {
  // 33.33 + 33.33 + 33.34 === 100.00 despite binary float wobble.
  const { debitMinor, creditMinor } = validateEntry({
    date: "2026-07-07",
    memo: "split",
    lines: [
      { accountCode: "6000", debit: 33.33 },
      { accountCode: "6000", debit: 33.33 },
      { accountCode: "6000", debit: 33.34 },
      { accountCode: "1010", credit: 100 },
    ],
  });
  assert.equal(debitMinor, 10_000);
  assert.equal(creditMinor, 10_000);
});

test("the seeded starter chart uses only DB-allowed account types", async () => {
  const s = new MemoryStore();
  const allowed = new Set(["ASSET", "LIABILITY", "EXPENSE", "COGS", "TAX", "BANK", "FX"]);
  for (const a of await s.listAccounts()) {
    assert.ok(allowed.has(a.accountType), `${a.code} has bad type ${a.accountType}`);
  }
});

test("duplicate account codes are rejected", async () => {
  const s = new MemoryStore();
  await assert.rejects(
    () => s.createAccount({ code: "1000", name: "Dup", accountType: "ASSET" }),
    /already exists/,
  );
});
