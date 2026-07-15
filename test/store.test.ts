import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryStore } from "../src/memoryStore.ts";
import { StoreError, computeSale, validateEntry } from "../src/store.ts";

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

test("computeSale rolls up subtotal, tax and grand total per line", () => {
  const { lines, subtotal, taxTotal, grandTotal } = computeSale({
    date: "2026-07-10",
    lines: [
      { description: "Room night", quantity: 2, unitPrice: 1500, taxCategory: "TGST", taxRatePercent: 16 },
      { description: "Bottled water", quantity: 3, unitPrice: 25, taxCategory: "GGST", taxRatePercent: 8 },
    ],
  });
  assert.equal(lines[0].lineSubtotal, 3000);
  assert.equal(lines[0].taxAmount, 480);
  assert.equal(lines[1].lineSubtotal, 75);
  assert.equal(lines[1].taxAmount, 6);
  assert.equal(subtotal, 3075);
  assert.equal(taxTotal, 486);
  assert.equal(grandTotal, 3561);
});

test("a sale defaults quantity to 1 and tax to zero/OUT_OF_SCOPE", () => {
  const { lines, subtotal, taxTotal } = computeSale({
    date: "2026-07-10",
    lines: [{ description: "Consulting", unitPrice: 500 }],
  });
  assert.equal(lines[0].quantity, 1);
  assert.equal(lines[0].taxCategory, "OUT_OF_SCOPE");
  assert.equal(subtotal, 500);
  assert.equal(taxTotal, 0);
});

test("a sale with no line items is rejected", () => {
  assert.throws(
    () => computeSale({ date: "2026-07-10", lines: [] }),
    /at least one line item/,
  );
});

test("a sale line without a description or price is rejected", () => {
  assert.throws(
    () => computeSale({ date: "2026-07-10", lines: [{ description: "", unitPrice: 5 }] }),
    /needs a description/,
  );
  assert.throws(
    () =>
      computeSale({
        date: "2026-07-10",
        lines: [{ description: "x", unitPrice: undefined as unknown as number }],
      }),
    /needs a unit price/,
  );
});

test("recordSale stores a sale and revenue sums it within a date range", async () => {
  const s = new MemoryStore();
  await s.recordSale({
    date: "2026-07-10",
    lines: [
      { description: "Room night", quantity: 2, unitPrice: 1500, taxCategory: "TGST", taxRatePercent: 16 },
      { description: "Bottled water", quantity: 3, unitPrice: 25, taxCategory: "GGST", taxRatePercent: 8 },
    ],
  });
  assert.equal((await s.listSales()).length, 1);
  const jul = await s.revenue("2026-07-01", "2026-07-31");
  assert.equal(jul.salesCount, 1);
  assert.equal(jul.subtotal, 3075);
  assert.equal(jul.taxTotal, 486);
  assert.equal(jul.grandTotal, 3561);
  const aug = await s.revenue("2026-08-01", "2026-08-31");
  assert.equal(aug.salesCount, 0);
  assert.equal(aug.grandTotal, 0);
});
