import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryStore } from "../src/memoryStore.ts";
import { assertUpload, StoreError } from "../src/store.ts";

const pngBase64 = Buffer.from("hello world").toString("base64");

test("assertUpload validates required fields and returns the decoded byte size", () => {
  const { bytes } = assertUpload({ filename: "r.png", contentType: "image/png", dataBase64: pngBase64 });
  assert.equal(bytes, "hello world".length);
});

test("assertUpload rejects missing pieces and bad capture sources", () => {
  assert.throws(() => assertUpload({ filename: "", contentType: "image/png", dataBase64: pngBase64 }), StoreError);
  assert.throws(() => assertUpload({ filename: "r.png", contentType: "", dataBase64: pngBase64 }), StoreError);
  assert.throws(() => assertUpload({ filename: "r.png", contentType: "image/png", dataBase64: "" }), StoreError);
  assert.throws(
    () => assertUpload({ filename: "r.png", contentType: "image/png", dataBase64: pngBase64, captureSource: "NOPE" }),
    StoreError,
  );
});

test("memory ingest returns a canned extraction and lists the document", async () => {
  const s = new MemoryStore();
  assert.deepEqual(await s.listDocuments(), []);
  const result = await s.ingestDocument({
    filename: "invoice.png",
    contentType: "image/png",
    dataBase64: pngBase64,
  });
  assert.equal(result.status, "EXTRACTED");
  assert.equal(result.duplicate, false);
  assert.ok(result.documentId);
  assert.ok(result.extraction);
  assert.equal(result.extraction?.predictedTaxCategory, "GGST");
  // The canned invoice has no TIN, so the review flag is present.
  assert.ok(result.extraction?.validationFlags.includes("MISSING_VENDOR_TIN"));

  const docs = await s.listDocuments();
  assert.equal(docs.length, 1);
  assert.equal(docs[0].fileName, "invoice.png");
  assert.equal(docs[0].mimeType, "image/png");
  assert.equal(docs[0].status, "EXTRACTED");
});

test("memory ingest rejects an unsupported content type", async () => {
  const s = new MemoryStore();
  await assert.rejects(
    () => s.ingestDocument({ filename: "notes.csv", contentType: "text/csv", dataBase64: pngBase64 }),
    /Unsupported upload type/,
  );
});

test("a bank deposit slip classifies as a bank document and posts to Banking", async () => {
  const s = new MemoryStore();
  const doc = await s.ingestDocument({
    filename: "bml-deposit-slip.jpg", contentType: "image/jpeg", dataBase64: pngBase64,
  });
  assert.equal(doc.extraction?.documentType, "BANK_DEPOSIT");
  assert.equal(doc.extraction?.direction, "IN");
  // Not mis-flagged as a purchase document.
  assert.ok(!doc.extraction?.validationFlags.includes("MISSING_VENDOR_TIN"));

  const before = (await s.listBankTransactions()).length;
  const posted = await s.postDocumentToBank(doc.documentId);
  assert.equal(posted.imported, 1);
  assert.ok(posted.bankAccountName);
  const after = await s.listBankTransactions();
  assert.equal(after.length, before + 1);
  // It lands as an unreconciled CREDIT (money in) of the deposit amount.
  const line = after.find((t) => t.reconStatus === "UNMATCHED" && t.amount === 51000);
  assert.ok(line, "the deposit should appear as a +51,000 unmatched bank line");

  // Re-posting the same document is deduplicated.
  const again = await s.postDocumentToBank(doc.documentId);
  assert.equal(again.imported, 0);
  assert.equal(again.duplicates, 1);
});

test("posting a non-bank document to Banking is rejected", async () => {
  const s = new MemoryStore();
  const doc = await s.ingestDocument({ filename: "invoice.png", contentType: "image/png", dataBase64: pngBase64 });
  await assert.rejects(() => s.postDocumentToBank(doc.documentId), /isn't a bank or cash movement/);
});
