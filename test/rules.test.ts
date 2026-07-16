import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryStore } from "../src/memoryStore.ts";
import { StoreError } from "../src/store.ts";
import { deriveValidationFlags, normalizeExtraction } from "../src/aiExtract.ts";
import {
  applyOverrideToExtraction,
  applyRuleToExtraction,
  buildRuleFromOverride,
  matchRule,
  normalizeRuleInput,
  ruleLabel,
} from "../src/rules.ts";

const baseExtraction = (over = {}) => {
  const e = normalizeExtraction({
    vendor_name: "Reef Divers Maldives",
    vendor_tin: "1032117GST001",
    invoice_number: "RD-1",
    document_date: "2026-07-09",
    currency: "MVR",
    line_items: [
      { description: "Guided dive excursion", quantity: 1, unit_price: 100, amount: 100, tax_category: "GGST", tax_rate_percent: 8, accounting_category: "Misc" },
    ],
    subtotal: 100, tax_total: 8, grand_total: 108,
    accounting_category: "Misc",
    predicted_tax_category: "GGST",
    confidence_score: 0.8,
    ai_reasoning: "",
    ...over,
  });
  e.validationFlags = deriveValidationFlags(e);
  return e;
};

test("normalizeRuleInput requires a matcher and an outcome", () => {
  assert.throws(() => normalizeRuleInput({ setTaxCategory: "TGST" }), /at least one matcher/);
  assert.throws(() => normalizeRuleInput({ matchVendorTin: "X" }), /needs an outcome/);
  assert.throws(() => normalizeRuleInput({ matchVendorTin: "X", setTaxCategory: "BOGUS" }), StoreError);
  const r = normalizeRuleInput({ matchVendorTin: " 100X ", setTaxCategory: "tgst", priority: "5" });
  assert.equal(r.matchVendorTin, "100X");
  assert.equal(r.setTaxCategory, "TGST");
  assert.equal(r.priority, 5);
});

test("matchRule prefers vendor TIN, then name, respecting priority", () => {
  const e = baseExtraction();
  const rules = [
    { id: "r-name", matchVendorTin: null, matchVendorPattern: "reef", matchKeyword: null,
      setTaxCategory: "TGST", setAccountingCategory: null, note: null, priority: 100, timesApplied: 0, source: "H", createdAt: "2026-01-01" },
    { id: "r-tin", matchVendorTin: "1032117GST001", matchVendorPattern: null, matchKeyword: null,
      setTaxCategory: "TGST", setAccountingCategory: "Tourism", note: null, priority: 10, timesApplied: 0, source: "H", createdAt: "2026-01-02" },
  ];
  const hit = matchRule(e, rules);
  assert.equal(hit?.rule.id, "r-tin");
  assert.equal(hit?.matchedOn, "vendor TIN");
});

test("matchRule matches a keyword in a line description", () => {
  const e = baseExtraction();
  const rules = [{ id: "r-kw", matchVendorTin: null, matchVendorPattern: null, matchKeyword: "dive",
    setTaxCategory: "TGST", setAccountingCategory: null, note: null, priority: 50, timesApplied: 0, source: "H", createdAt: "2026-01-01" }];
  assert.equal(matchRule(e, rules)?.matchedOn, "keyword");
});

test("matchRule ignores inactive rules and returns null when nothing matches", () => {
  const e = baseExtraction();
  const rules = [{ id: "r", matchVendorTin: "OTHER", matchVendorPattern: null, matchKeyword: null,
    setTaxCategory: "TGST", setAccountingCategory: null, note: null, priority: 1, timesApplied: 0, source: "H", isActive: false, createdAt: "2026-01-01" }];
  assert.equal(matchRule(e, rules), null);
});

test("applyRuleToExtraction rewrites categories, records provenance, refreshes flags", () => {
  const e = baseExtraction();
  const rule = { id: "r-tin", matchVendorTin: "1032117GST001", matchVendorPattern: null, matchKeyword: null,
    setTaxCategory: "TGST", setAccountingCategory: "Tourism activities", note: null, priority: 10, timesApplied: 0, source: "H", createdAt: "2026-01-01" };
  const out = applyRuleToExtraction(e, rule, "vendor TIN");
  assert.equal(out.predictedTaxCategory, "TGST");
  assert.equal(out.lines[0].taxCategory, "TGST");
  assert.equal(out.accountingCategory, "Tourism activities");
  assert.equal(out.appliedRule?.id, "r-tin");
  assert.equal(out.appliedRule?.wasTaxCategory, "GGST");
  // Provenance lives in appliedRule, not in the warning flags.
  assert.ok(!out.validationFlags.includes("RULE_APPLIED"));
  // The original is untouched (no mutation).
  assert.equal(e.predictedTaxCategory, "GGST");
});

test("applyOverrideToExtraction sets fields, marks overridden, clears a fixed flag", () => {
  const e = baseExtraction({ vendor_tin: null }); // MISSING_VENDOR_TIN present
  assert.ok(e.validationFlags.includes("MISSING_VENDOR_TIN"));
  const out = applyOverrideToExtraction(e, { taxCategory: "TGST", vendorTin: "1032117GST001" });
  assert.equal(out.predictedTaxCategory, "TGST");
  assert.equal(out.vendorTin, "1032117GST001");
  assert.equal(out.overridden, true);
  assert.ok(!out.validationFlags.includes("MISSING_VENDOR_TIN"));
});

test("applyOverrideToExtraction rejects an empty override", () => {
  assert.throws(() => applyOverrideToExtraction(baseExtraction(), {}), /must change/);
});

test("buildRuleFromOverride keys on the vendor TIN by default", () => {
  const input = buildRuleFromOverride(baseExtraction(), { taxCategory: "TGST" });
  assert.equal(input?.matchVendorTin, "1032117GST001");
  assert.equal(input?.setTaxCategory, "TGST");
});

test("buildRuleFromOverride can scope to a keyword, and returns null with no outcome", () => {
  const kw = buildRuleFromOverride(baseExtraction(), { accountingCategory: "Diving", ruleScope: "keyword" });
  assert.equal(kw?.matchKeyword, "Guided dive excursion");
  assert.equal(buildRuleFromOverride(baseExtraction(), { vendorTin: "X" }), null);
});

test("ruleLabel summarises the matcher and outcome", () => {
  const label = ruleLabel({ id: "r", matchVendorTin: "100GST", matchVendorPattern: null, matchKeyword: null,
    setTaxCategory: "TGST", setAccountingCategory: null, note: null, priority: 10, timesApplied: 0, source: "H" });
  assert.match(label, /vendor TIN 100GST → TGST/);
});

/* -- end-to-end through the in-memory store --------------------------------- */

test("override learns a rule that auto-applies to the next matching upload", async () => {
  const s = new MemoryStore();
  const png = Buffer.from("x").toString("base64");
  // First upload — the canned invoice is from Island Mark Hardware, GGST, no TIN.
  const first = await s.ingestDocument({ filename: "a.png", contentType: "image/png", dataBase64: png });
  assert.equal(first.extraction?.predictedTaxCategory, "GGST");

  // Correct it to TGST. The canned doc has no TIN, so the rule keys on the
  // vendor name.
  const ov = await s.overrideExtraction(first.documentId, { taxCategory: "TGST" });
  assert.equal(ov.extraction.predictedTaxCategory, "TGST");
  assert.equal(ov.extraction.overridden, true);
  assert.ok(ov.rule, "a rule should be learned");
  assert.equal(ov.rule?.matchVendorPattern, "Island Mark Hardware Pvt Ltd");

  const rules = await s.listRules();
  assert.equal(rules.length, 1);
  assert.equal(rules[0].setTaxCategory, "TGST");
  assert.ok(rules[0].label);

  // A second upload of the same vendor is auto-corrected on ingest.
  const second = await s.ingestDocument({ filename: "b.png", contentType: "image/png", dataBase64: png });
  assert.equal(second.extraction?.predictedTaxCategory, "TGST");
  assert.equal(second.extraction?.appliedRule?.matchedOn, "vendor name");

  // Deleting the rule stops it applying.
  await s.deleteRule(rules[0].id);
  assert.deepEqual(await s.listRules(), []);
  const third = await s.ingestDocument({ filename: "c.png", contentType: "image/png", dataBase64: png });
  assert.equal(third.extraction?.predictedTaxCategory, "GGST");
});

test("overrideExtraction 404s for an unknown document", async () => {
  const s = new MemoryStore();
  await assert.rejects(() => s.overrideExtraction("nope", { taxCategory: "TGST" }), /No extraction found/);
});
