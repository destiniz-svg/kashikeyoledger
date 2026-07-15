import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryStore } from "../src/memoryStore.ts";
import { StoreError, agingBucket, bankTxnSigned, computeSale, formatBillDate, validateEntry } from "../src/store.ts";

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

test("formatBillDate renders ISO dates as DD Mon YYYY", () => {
  assert.equal(formatBillDate("2026-07-05"), "05 Jul 2026");
  assert.equal(formatBillDate("2026-02-20"), "20 Feb 2026");
  assert.equal(formatBillDate(null), "—");
});

test("agingBucket buckets a due date relative to a fixed today", () => {
  const today = new Date("2026-07-15T00:00:00Z");
  assert.equal(agingBucket("2026-07-20", today), "current"); // not yet due
  assert.equal(agingBucket("2026-06-29", today), "1_30"); // 16 days
  assert.equal(agingBucket("2026-05-26", today), "31_60"); // 50 days
  assert.equal(agingBucket("2026-02-20", today), "90_plus"); // ~145 days
});

test("listBills returns the seeded bills with computed aging", async () => {
  const bills = await new MemoryStore().listBills();
  assert.equal(bills.length, 6);
  const altura = bills.find((b) => b.invoice === "ALT/INV-000024");
  assert.equal(altura?.vendor, "Altura Pvt Ltd");
  assert.equal(altura?.total, 98280);
  assert.equal(altura?.taxCat, "GGST");
  assert.ok(["current", "1_30", "31_60", "61_90", "90_plus"].includes(altura?.aging ?? ""));
});

test("setBillStatus transitions a bill and persists in the store", async () => {
  const s = new MemoryStore();
  const before = (await s.listBills()).find((b) => b.id === "bill-2");
  assert.equal(before?.status, "DRAFT");
  const res = await s.setBillStatus("bill-2", "ACCOUNTANT_APPROVED");
  assert.deepEqual(res, { id: "bill-2", status: "ACCOUNTANT_APPROVED" });
  const after = (await s.listBills()).find((b) => b.id === "bill-2");
  assert.equal(after?.status, "ACCOUNTANT_APPROVED");
});

test("setBillStatus on an unknown bill is rejected", async () => {
  await assert.rejects(() => new MemoryStore().setBillStatus("nope", "REJECTED"), /not found/);
});

test("the in-memory store has no auth provider (verifyMember is always false)", async () => {
  assert.equal(await new MemoryStore().verifyMember("any-token"), false);
});

test("listItems values stock and flags low/out status", async () => {
  const items = await new MemoryStore().listItems();
  assert.equal(items.length, 8);
  const sand = items.find((i) => i.sku === "SND-M3");
  assert.equal(sand?.status, "out"); // qty 0
  const pvc = items.find((i) => i.sku === "PVC-04");
  assert.equal(pvc?.status, "low"); // 8 <= 20
  const cem = items.find((i) => i.sku === "CEM-50");
  assert.equal(cem?.status, "in_stock");
  assert.equal(cem?.stockValue, 11400); // 120 * 95
});

test("listGstFilings returns a GGST calendar with net = output - input", async () => {
  const filings = await new MemoryStore().listGstFilings();
  assert.ok(filings.length >= 1);
  for (const f of filings) {
    assert.equal(f.form, "MIRA_205_GGST");
    assert.equal(Math.round((f.outputTax - f.inputTax) * 100) / 100, f.netPayable);
  }
  const due = filings.find((f) => f.status === "DUE_SOON");
  assert.ok(due, "expected a DUE_SOON period");
});

test("listVendors rolls up spend and bill count per vendor, sorted by spend", async () => {
  const vendors = await new MemoryStore().listVendors();
  assert.equal(vendors.length, 6);
  assert.equal(vendors[0].name, "Altura Pvt Ltd"); // biggest spend first
  assert.equal(vendors[0].totalSpend, 98280);
  assert.equal(vendors[0].billCount, 1);
  assert.equal(vendors[0].ini, "AL");
  for (const v of vendors) assert.equal(typeof v.ini, "string");
});

test("bankTxnSigned makes CREDIT positive and DEBIT negative", () => {
  assert.equal(bankTxnSigned("CREDIT", 100), 100);
  assert.equal(bankTxnSigned("DEBIT", 100), -100);
});

test("listBankAccounts reports balance, txn count and unreconciled count", async () => {
  const accounts = await new MemoryStore().listBankAccounts();
  assert.equal(accounts.length, 2);
  const mvr = accounts.find((a) => a.currency === "MVR");
  assert.equal(mvr?.name, "Business Current");
  assert.equal(mvr?.linkedAccount, true);
  assert.equal(mvr?.balance, 246048.63);
  assert.equal(mvr?.txnCount, 11);
  // UNMATCHED + SUGGESTED lines on the MVR account (2 + 3).
  assert.equal(mvr?.unreconciled, 5);
  const usd = accounts.find((a) => a.currency === "USD");
  assert.equal(usd?.linkedAccount, false);
  assert.equal(usd?.unreconciled, 2);
});

test("listBankTransactions signs amounts by direction and labels the account", async () => {
  const txns = await new MemoryStore().listBankTransactions();
  assert.equal(txns.length, 13);
  const credit = txns.find((t) => t.reference === "FT26060312");
  assert.equal(credit?.amount, 45000); // CREDIT stays positive
  assert.equal(credit?.accountName, "Business Current");
  const debit = txns.find((t) => t.reference === "FT26060544");
  assert.equal(debit?.amount, -98280); // DEBIT is negative
  assert.equal(debit?.matchedVendor, "Altura Pvt Ltd");
  assert.equal(debit?.date, "05 Jun 2026");
});

test("setBankRecon confirms a suggested line to MATCHED and updates counts", async () => {
  const s = new MemoryStore();
  const before = (await s.listBankTransactions()).find((t) => t.reference === "FT26071240");
  assert.equal(before?.reconStatus, "SUGGESTED");
  const res = await s.setBankRecon(before.id, "MATCHED");
  assert.deepEqual(res, { id: before.id, reconStatus: "MATCHED" });
  const after = (await s.listBankTransactions()).find((t) => t.id === before.id);
  assert.equal(after?.reconStatus, "MATCHED");
  // The MVR account's unreconciled count drops by one.
  const acct = (await s.listBankAccounts()).find((a) => a.currency === "MVR");
  assert.equal(acct?.unreconciled, 4);
});

test("setBankRecon UNMATCHED clears the matched vendor", async () => {
  const s = new MemoryStore();
  const matched = (await s.listBankTransactions()).find((t) => t.reference === "FT26060544");
  assert.equal(matched?.matchedVendor, "Altura Pvt Ltd");
  await s.setBankRecon(matched.id, "UNMATCHED");
  const after = (await s.listBankTransactions()).find((t) => t.id === matched.id);
  assert.equal(after?.reconStatus, "UNMATCHED");
  assert.equal(after?.matchedVendor, null);
});

test("setBankRecon rejects an unknown status and an unknown line", async () => {
  const s = new MemoryStore();
  const t = (await s.listBankTransactions())[0];
  await assert.rejects(() => s.setBankRecon(t.id, "BOGUS"), /Unsupported reconciliation status/);
  await assert.rejects(() => s.setBankRecon("nope", "MATCHED"), /not found/);
});

test("importStatement adds new lines and dedupes on re-import", async () => {
  const s = new MemoryStore();
  const lines = [
    { date: "2026-07-15", direction: "DEBIT", amount: 500, reference: "IMP-A", narrative: "A" },
    { date: "2026-07-16", direction: "CREDIT", amount: 900, reference: "IMP-B", narrative: "B" },
  ];
  const before = (await s.listBankTransactions()).length;
  const first = await s.importStatement("ba-mvr", "CSV_UPLOAD", lines as never);
  assert.deepEqual({ imported: first.imported, duplicates: first.duplicates, total: first.total },
    { imported: 2, duplicates: 0, total: 2 });
  assert.equal((await s.listBankTransactions()).length, before + 2);
  // Re-importing the same statement adds nothing.
  const second = await s.importStatement("ba-mvr", "CSV_UPLOAD", lines as never);
  assert.deepEqual({ imported: second.imported, duplicates: second.duplicates },
    { imported: 0, duplicates: 2 });
  assert.equal((await s.listBankTransactions()).length, before + 2);
  // Imported lines land as UNMATCHED on the target account.
  const imp = (await s.listBankTransactions()).find((t) => t.reference === "IMP-A");
  assert.equal(imp?.reconStatus, "UNMATCHED");
  assert.equal(imp?.amount, -500); // DEBIT is negative
});

test("importStatement validates lines and the target account", async () => {
  const s = new MemoryStore();
  await assert.rejects(() => s.importStatement("ba-mvr", "CSV_UPLOAD", []), /No statement lines/);
  await assert.rejects(
    () => s.importStatement("ba-mvr", "CSV_UPLOAD", [{ date: "bad", direction: "DEBIT", amount: 5 }] as never),
    /date must be ISO/,
  );
  await assert.rejects(
    () => s.importStatement("ba-mvr", "CSV_UPLOAD", [{ date: "2026-07-15", direction: "SIDEWAYS", amount: 5 }] as never),
    /direction must be DEBIT or CREDIT/,
  );
  await assert.rejects(
    () => s.importStatement("nope", "CSV_UPLOAD", [{ date: "2026-07-15", direction: "DEBIT", amount: 5 }] as never),
    /not found/,
  );
  await assert.rejects(
    () => s.importStatement("ba-mvr", "BOGUS", [{ date: "2026-07-15", direction: "DEBIT", amount: 5 }] as never),
    /Unsupported statement source/,
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
