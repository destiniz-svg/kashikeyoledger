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
