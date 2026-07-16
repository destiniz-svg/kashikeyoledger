import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCompliance, type ComplianceInput } from "../src/compliance.ts";

const bill = (over = {}) => ({
  id: "b", vendor: "V", tin: "1005632GST001", invoice: "INV", po: "", date: "01 Jul 2026",
  due: "", cur: "MVR", subtotal: 100, gst: 8, total: 108, cat: "Supplies", taxCat: "GGST",
  status: "AI_VERIFIED", aging: "current", rate: 8, line: "", qty: 1, unit: 100, ...over,
});
const vendor = (over = {}) => ({
  id: "v", name: "V", tin: "1005632GST001", gstRegistered: true, currency: "MVR",
  billCount: 1, totalSpend: 108, lastBillDate: "01 Jul 2026", ini: "V", ...over,
});
const filing = (over = {}) => ({
  id: "f", form: "MIRA_205_GGST", periodStart: "2026-07-01", periodEnd: "2026-07-31",
  dueDate: "2026-08-28", status: "UPCOMING", sales8: 0, salesZero: 0, salesExempt: 0,
  salesOos: 0, outputTax: 0, inputTax: 0, netPayable: 0, ...over,
});

const base = (over: Partial<ComplianceInput> = {}): ComplianceInput => ({
  bills: [bill()],
  vendors: [vendor()],
  documents: [],
  ggstFilings: [filing()],
  tgstFilings: [],
  unreconciledBankLines: 0,
  outOfBalanceBy: 0,
  cashAndBank: 15420,
  expenses: 3084,
  accountsPayable: 1542,
  claimableInputTax: 8,
  mvrPerUsd: 15.42,
  today: new Date("2026-07-16T00:00:00Z"),
  ...over,
});

test("a clean ledger scores 100 with all checks ok", () => {
  const r = buildCompliance(base());
  assert.equal(r.score, 100);
  assert.ok(r.checks.every((c) => c.status === "ok"));
  assert.equal(r.missingTin.unclaimableInputTax, 0);
});

test("dual-currency converts MVR to USD at the given rate", () => {
  const r = buildCompliance(base());
  assert.equal(r.fx.mvrPerUsd, 15.42);
  assert.equal(r.money.cashAndBank.mvr, 15420);
  assert.equal(r.money.cashAndBank.usd, 1000); // 15420 / 15.42
});

test("a bill with no vendor TIN flags unclaimable input tax as a risk", () => {
  const r = buildCompliance(base({
    bills: [bill({ tin: "—", gst: 8 })],
    vendors: [vendor({ tin: "—" })],
  }));
  const tin = r.checks.find((c) => c.id === "vendor_tin");
  assert.equal(tin?.status, "risk");
  assert.equal(r.missingTin.bills, 1);
  assert.equal(r.missingTin.unclaimableInputTax, 8);
  assert.ok(r.score < 100);
});

test("an exempt bill without a TIN is not counted as unclaimable", () => {
  const r = buildCompliance(base({
    bills: [bill({ tin: "—", taxCat: "EXEMPT", gst: 0 })],
    vendors: [vendor()], // vendor has a TIN, so only a bill-level gap
  }));
  assert.equal(r.missingTin.unclaimableInputTax, 0);
  // No unclaimable tax and vendor has a TIN → the TIN check stays ok.
  assert.equal(r.checks.find((c) => c.id === "vendor_tin")?.status, "ok");
});

test("an out-of-balance ledger is a risk", () => {
  const r = buildCompliance(base({ outOfBalanceBy: 12.5 }));
  assert.equal(r.checks.find((c) => c.id === "ledger_balance")?.status, "risk");
});

test("documents with validation flags and unreconciled lines warn", () => {
  const r = buildCompliance(base({
    documents: [{ id: "d", fileName: "x", mimeType: "image/png", byteSize: 1, status: "EXTRACTED",
      captureSource: "MANUAL_UPLOAD", createdAt: "", model: null,
      extraction: { validationFlags: ["MISSING_VENDOR_TIN"] } as never }],
    unreconciledBankLines: 3,
  }));
  assert.equal(r.documentsNeedingReview, 1);
  assert.equal(r.checks.find((c) => c.id === "doc_review")?.status, "warn");
  assert.equal(r.checks.find((c) => c.id === "bank_recon")?.status, "warn");
});

test("an overdue filing is a risk; one due within a week warns", () => {
  const overdue = buildCompliance(base({ ggstFilings: [filing({ dueDate: "2026-07-10" })] }));
  assert.equal(overdue.checks.find((c) => c.id === "filing_due")?.status, "risk");
  assert.equal(overdue.filing?.daysToDue, -6);

  const soon = buildCompliance(base({ ggstFilings: [filing({ dueDate: "2026-07-20" })] }));
  assert.equal(soon.checks.find((c) => c.id === "filing_due")?.status, "warn");
});

test("the soonest open filing across GGST and TGST is chosen", () => {
  const r = buildCompliance(base({
    ggstFilings: [filing({ dueDate: "2026-08-28" })],
    tgstFilings: [filing({ form: "MIRA_206_TGST", dueDate: "2026-08-10" })],
  }));
  assert.equal(r.filing?.mira, "MIRA 206");
  assert.equal(r.filing?.dueDate, "2026-08-10");
});

test("FILED returns are skipped when picking the next filing", () => {
  const r = buildCompliance(base({
    ggstFilings: [filing({ dueDate: "2026-06-28", status: "FILED" }), filing({ dueDate: "2026-08-28" })],
  }));
  assert.equal(r.filing?.dueDate, "2026-08-28");
});
