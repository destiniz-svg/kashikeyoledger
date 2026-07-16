import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALLOWED_UPLOAD_MIME,
  DEFAULT_EXTRACTION_MODEL,
  DEFAULT_GEMINI_MODEL,
  EXTRACTION_TOOL,
  GEMINI_EXTRACTION_SCHEMA,
  bankLineFromExtraction,
  buildExtractionRequest,
  buildGeminiRequest,
  deriveValidationFlags,
  extractDocument,
  extractDocumentGemini,
  hasProvider,
  isBankDocument,
  isPdfMedia,
  mediaTypeFor,
  normalizeExtraction,
  parseExtractionResponse,
  parseGeminiResponse,
  runExtraction,
} from "../src/aiExtract.ts";
import { TAX_CATEGORIES } from "../src/store.ts";

test("mediaTypeFor accepts supported types and strips charset", () => {
  assert.equal(mediaTypeFor("image/png"), "image/png");
  assert.equal(mediaTypeFor("IMAGE/JPEG"), "image/jpeg");
  assert.equal(mediaTypeFor("application/pdf; charset=binary"), "application/pdf");
});

test("mediaTypeFor rejects unsupported types", () => {
  assert.throws(() => mediaTypeFor("text/csv"), /Unsupported upload type/);
  assert.throws(() => mediaTypeFor(""), /Unsupported upload type/);
});

test("isPdfMedia distinguishes PDFs from images", () => {
  assert.equal(isPdfMedia("application/pdf"), true);
  assert.equal(isPdfMedia("image/png"), false);
});

test("the extraction tool schema only permits valid MIRA tax categories", () => {
  const enumVals = EXTRACTION_TOOL.input_schema.properties.predicted_tax_category.enum;
  assert.deepEqual([...enumVals].sort(), [...TAX_CATEGORIES].sort());
});

test("buildExtractionRequest uses an image block for images and forces the tool", () => {
  const req = buildExtractionRequest({
    model: "claude-opus-4-8",
    base64: "AAAA",
    mediaType: "image/png",
  });
  assert.equal(req.model, "claude-opus-4-8");
  assert.deepEqual(req.tool_choice, { type: "tool", name: "record_extraction" });
  const content = (req.messages as { content: { type: string }[] }[])[0].content;
  assert.equal(content[0].type, "image");
  assert.equal(content[1].type, "text");
  // No thinking config — forced tool_choice is incompatible with extended thinking.
  assert.equal("thinking" in req, false);
});

test("buildExtractionRequest uses a document block for PDFs", () => {
  const req = buildExtractionRequest({
    model: "claude-opus-4-8",
    base64: "AAAA",
    mediaType: "application/pdf",
  });
  const content = (req.messages as { content: { type: string }[] }[])[0].content;
  assert.equal(content[0].type, "document");
});

test("normalizeExtraction fills defaults and derives a line amount when missing", () => {
  const e = normalizeExtraction({
    document_type: "invoice",
    currency: "mvr",
    line_items: [{ description: "Widgets", quantity: 2, unit_price: 50, tax_category: "GGST", tax_rate_percent: 8 }],
    predicted_tax_category: "GGST",
    confidence_score: 1.4,
    ai_reasoning: "test",
  });
  assert.equal(e.documentType, "INVOICE");
  assert.equal(e.currency, "MVR");
  assert.equal(e.lines[0].amount, 100); // 2 * 50
  assert.equal(e.confidenceScore, 1); // clamped to [0,1]
  assert.equal(e.vendorTin, null);
});

test("normalizeExtraction coerces an unknown tax category to GGST", () => {
  const e = normalizeExtraction({
    currency: "MVR",
    line_items: [{ description: "x", quantity: 1, unit_price: 1, amount: 1, tax_category: "BOGUS", tax_rate_percent: 0 }],
    predicted_tax_category: "ALSO_BOGUS",
    confidence_score: 0.5,
    ai_reasoning: "",
  });
  assert.equal(e.lines[0].taxCategory, "GGST");
  assert.equal(e.predictedTaxCategory, "GGST");
});

test("deriveValidationFlags flags a missing TIN and low confidence", () => {
  const e = normalizeExtraction({
    vendor_name: "Acme",
    currency: "MVR",
    line_items: [{ description: "x", quantity: 1, unit_price: 10, amount: 10, tax_category: "GGST", tax_rate_percent: 8 }],
    subtotal: 10,
    tax_total: 0.8,
    grand_total: 10.8,
    invoice_number: "INV-1",
    document_date: "2026-07-01",
    predicted_tax_category: "GGST",
    confidence_score: 0.4,
    ai_reasoning: "",
  });
  const flags = deriveValidationFlags(e);
  assert.ok(flags.includes("MISSING_VENDOR_TIN"));
  assert.ok(flags.includes("LOW_CONFIDENCE"));
  assert.ok(!flags.includes("TOTALS_MISMATCH"));
  assert.ok(!flags.includes("MISSING_INVOICE_NUMBER"));
});

test("deriveValidationFlags catches totals that don't foot and uncosted FX", () => {
  const e = normalizeExtraction({
    vendor_name: "Overseas Ltd",
    vendor_tin: "1005632GST001",
    invoice_number: "F-9",
    document_date: "2026-07-01",
    currency: "USD",
    fx_rate_to_mvr: null,
    line_items: [{ description: "x", quantity: 1, unit_price: 100, amount: 100, tax_category: "GGST", tax_rate_percent: 8 }],
    subtotal: 100,
    tax_total: 8,
    grand_total: 120,
    predicted_tax_category: "GGST",
    confidence_score: 0.9,
    ai_reasoning: "",
  });
  const flags = deriveValidationFlags(e);
  assert.ok(flags.includes("TOTALS_MISMATCH"));
  assert.ok(flags.includes("FOREIGN_CURRENCY_NO_FX"));
  assert.ok(!flags.includes("MISSING_VENDOR_TIN"));
});

test("parseExtractionResponse pulls the tool input and attaches flags", () => {
  const body = {
    content: [
      { type: "text", text: "here you go" },
      {
        type: "tool_use",
        name: "record_extraction",
        input: {
          document_type: "RECEIPT",
          currency: "MVR",
          line_items: [],
          predicted_tax_category: "GGST",
          confidence_score: 0.9,
          ai_reasoning: "ok",
        },
      },
    ],
  };
  const e = parseExtractionResponse(body);
  assert.equal(e.documentType, "RECEIPT");
  assert.ok(e.validationFlags.includes("NO_LINE_ITEMS"));
  assert.ok(e.validationFlags.includes("MISSING_VENDOR_NAME"));
});

test("parseExtractionResponse throws when no tool call is present", () => {
  assert.throws(
    () => parseExtractionResponse({ content: [{ type: "text", text: "no tool" }] }),
    /did not return a record_extraction/,
  );
});

test("extractDocument requires an API key", async () => {
  await assert.rejects(
    () => extractDocument({ apiKey: "", base64: "AAAA", contentType: "image/png" }),
    /ANTHROPIC_API_KEY/,
  );
});

test("extractDocument sends correct headers and parses the response (injected fetch)", async () => {
  let seenUrl = "";
  let seenInit: RequestInit = {};
  const fakeFetch = async (url: string, init: RequestInit) => {
    seenUrl = url;
    seenInit = init;
    return new Response(
      JSON.stringify({
        content: [
          {
            type: "tool_use",
            name: "record_extraction",
            input: {
              document_type: "INVOICE",
              vendor_name: "Island Mark Hardware",
              vendor_tin: "1005632GST001",
              invoice_number: "IMH-4471",
              document_date: "2026-05-11",
              currency: "MVR",
              line_items: [
                { description: "Fixings", quantity: 12, unit_price: 358.33, amount: 4300, tax_category: "GGST", tax_rate_percent: 8 },
              ],
              subtotal: 4300,
              tax_total: 344,
              grand_total: 4644,
              predicted_tax_category: "GGST",
              confidence_score: 0.85,
              ai_reasoning: "General hardware at 8% GGST.",
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const e = await extractDocument({
    apiKey: "sk-test",
    base64: "AAAA",
    contentType: "image/png",
    filename: "receipt.png",
    fetchImpl: fakeFetch,
  });
  assert.ok(seenUrl.endsWith("/v1/messages"));
  const headers = seenInit.headers as Record<string, string>;
  assert.equal(headers["x-api-key"], "sk-test");
  assert.equal(headers["anthropic-version"], "2023-06-01");
  const sent = JSON.parse(String(seenInit.body));
  assert.equal(sent.model, DEFAULT_EXTRACTION_MODEL);
  assert.equal(e.vendorName, "Island Mark Hardware");
  assert.equal(e.grandTotal, 4644);
  assert.equal(e.validationFlags.length, 0); // clean invoice
});

test("extractDocument surfaces an API error message", async () => {
  const fakeFetch = async () =>
    new Response(JSON.stringify({ error: { message: "overloaded" } }), { status: 529 });
  await assert.rejects(
    () => extractDocument({ apiKey: "sk-test", base64: "AAAA", contentType: "image/png", fetchImpl: fakeFetch }),
    /overloaded/,
  );
});

test("every allowed upload MIME maps cleanly", () => {
  for (const mt of ALLOWED_UPLOAD_MIME) assert.equal(mediaTypeFor(mt), mt);
});

/* -- Bank / cash documents (document-type-aware) ---------------------------- */

const depositSlip = () => normalizeExtraction({
  document_type: "BANK_DEPOSIT",
  direction: "IN",
  bank_name: "Bank of Maldives",
  bank_account_ref: "7730000012345",
  counterparty: "ALTURA PVT LTD",
  reference: "DEP-99182",
  currency: "MVR",
  document_date: "2026-07-14",
  line_items: [],
  grand_total: 51000,
  predicted_tax_category: "OUT_OF_SCOPE",
  confidence_score: 0.9,
  ai_reasoning: "Cash deposit — out of scope for GST.",
});

test("isBankDocument recognises a bank deposit slip", () => {
  const e = depositSlip();
  assert.equal(isBankDocument(e), true);
  assert.equal(e.direction, "IN");
  assert.equal(e.counterparty, "ALTURA PVT LTD");
});

test("bank documents are not flagged for missing vendor TIN / invoice / line items", () => {
  const flags = deriveValidationFlags(depositSlip());
  assert.ok(!flags.includes("MISSING_VENDOR_TIN"));
  assert.ok(!flags.includes("MISSING_INVOICE_NUMBER"));
  assert.ok(!flags.includes("NO_LINE_ITEMS"));
  assert.deepEqual(flags, []); // clean deposit slip
});

test("a bank document missing amount/direction is flagged for reconciliation", () => {
  const e = normalizeExtraction({
    document_type: "BANK_WITHDRAWAL", currency: "MVR", line_items: [],
    predicted_tax_category: "OUT_OF_SCOPE", confidence_score: 0.9, ai_reasoning: "",
  });
  const flags = deriveValidationFlags(e);
  assert.ok(flags.includes("MISSING_AMOUNT"));
  assert.ok(flags.includes("UNKNOWN_DIRECTION"));
});

test("bankLineFromExtraction maps a deposit to a CREDIT statement line", () => {
  const line = bankLineFromExtraction(depositSlip());
  assert.equal(line?.direction, "CREDIT");
  assert.equal(line?.amount, 51000);
  assert.equal(line?.reference, "DEP-99182");
  assert.equal(line?.counterparty, "ALTURA PVT LTD");
  assert.match(line?.narrative ?? "", /bank deposit/i);
});

test("bankLineFromExtraction maps a withdrawal/payment to DEBIT and returns null with no amount", () => {
  const out = bankLineFromExtraction(normalizeExtraction({
    document_type: "PAYMENT_VOUCHER", direction: "OUT", currency: "MVR",
    grand_total: 1200, line_items: [], predicted_tax_category: "OUT_OF_SCOPE",
    confidence_score: 0.9, ai_reasoning: "",
  }));
  assert.equal(out?.direction, "DEBIT");
  const none = bankLineFromExtraction(normalizeExtraction({
    document_type: "BANK_TRANSFER", direction: "IN", currency: "MVR",
    line_items: [], predicted_tax_category: "OUT_OF_SCOPE", confidence_score: 0.9, ai_reasoning: "",
  }));
  assert.equal(none, null);
});

test("the Gemini schema carries the banking fields", () => {
  assert.ok(GEMINI_EXTRACTION_SCHEMA.properties.direction);
  assert.ok(GEMINI_EXTRACTION_SCHEMA.properties.counterparty);
});

/* -- Gemini provider -------------------------------------------------------- */

test("the Gemini schema only permits valid MIRA tax categories", () => {
  const enumVals = GEMINI_EXTRACTION_SCHEMA.properties.predicted_tax_category.enum;
  assert.deepEqual([...enumVals].sort(), [...TAX_CATEGORIES].sort());
});

test("buildGeminiRequest uses inline_data and a JSON response schema", () => {
  const req = buildGeminiRequest({ base64: "AAAA", mediaType: "application/pdf", filename: "x.pdf" });
  const parts = (req.contents as { parts: { inline_data?: { mime_type: string } }[] }[])[0].parts;
  assert.equal(parts[0].inline_data?.mime_type, "application/pdf");
  const gc = req.generationConfig as { responseMimeType: string; responseSchema: unknown };
  assert.equal(gc.responseMimeType, "application/json");
  assert.ok(gc.responseSchema);
});

test("parseGeminiResponse parses the JSON text and derives flags", () => {
  const body = {
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      document_type: "RECEIPT", currency: "MVR", line_items: [],
      predicted_tax_category: "GGST", confidence_score: 0.9, ai_reasoning: "ok",
    }) }] } }],
  };
  const e = parseGeminiResponse(body);
  assert.equal(e.documentType, "RECEIPT");
  assert.ok(e.validationFlags.includes("NO_LINE_ITEMS"));
});

test("parseGeminiResponse throws on a safety block or empty content", () => {
  assert.throws(() => parseGeminiResponse({ promptFeedback: { blockReason: "SAFETY" } }), /blocked/);
  assert.throws(() => parseGeminiResponse({ candidates: [] }), /no content/);
});

test("extractDocumentGemini sends the API key header and parses the reply", async () => {
  let seenUrl = "";
  let seenInit: RequestInit = {};
  const fakeFetch = async (url: string, init: RequestInit) => {
    seenUrl = url; seenInit = init;
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        document_type: "INVOICE", vendor_name: "Test Co", currency: "MVR",
        line_items: [{ description: "x", quantity: 1, unit_price: 10, amount: 10, tax_category: "GGST", tax_rate_percent: 8 }],
        subtotal: 10, tax_total: 0.8, grand_total: 10.8,
        predicted_tax_category: "GGST", confidence_score: 0.9, ai_reasoning: "ok",
      }) }] } }],
    }), { status: 200 });
  };
  const e = await extractDocumentGemini({ apiKey: "g-key", base64: "AAAA", contentType: "image/png", fetchImpl: fakeFetch });
  assert.ok(seenUrl.includes(`${DEFAULT_GEMINI_MODEL}:generateContent`));
  assert.equal((seenInit.headers as Record<string, string>)["x-goog-api-key"], "g-key");
  assert.equal(e.vendorName, "Test Co");
});

test("extractDocumentGemini surfaces an API error", async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ error: { message: "quota exceeded" } }), { status: 429 });
  await assert.rejects(
    () => extractDocumentGemini({ apiKey: "g", base64: "A", contentType: "image/png", fetchImpl: fakeFetch }),
    /quota exceeded/,
  );
});

test("extractDocumentGemini rediscovers a model when the configured one is retired", async () => {
  const calls: string[] = [];
  const fakeFetch = async (url: string, init: RequestInit) => {
    calls.push(`${init.method} ${url}`);
    // 1) generateContent on the retired model → unavailable error
    if (url.includes("gemini-flash-latest:generateContent")) {
      return new Response(JSON.stringify({ error: { message: "models/gemini-flash-latest is no longer available to new users" } }), { status: 400 });
    }
    // 2) ListModels → offer a working model
    if (init.method === "GET" && url.includes("/models?")) {
      return new Response(JSON.stringify({ models: [
        { name: "models/gemini-9-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
      ] }), { status: 200 });
    }
    // 3) retry generateContent on the discovered model → success
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      document_type: "INVOICE", currency: "MVR", line_items: [],
      predicted_tax_category: "GGST", confidence_score: 0.9, ai_reasoning: "ok" }) }] } }] }), { status: 200 });
  };
  const e = await extractDocumentGemini({ apiKey: "g", base64: "A", contentType: "image/png", fetchImpl: fakeFetch });
  assert.equal(e.documentType, "INVOICE");
  assert.ok(calls.some((c) => c.includes("gemini-9-flash:generateContent")), "should retry on the discovered model");
});

test("hasProvider is true only when a key is set", () => {
  assert.equal(hasProvider({}), false);
  assert.equal(hasProvider({ anthropicKey: "x" }), true);
  assert.equal(hasProvider({ geminiKey: "y" }), true);
});

test("runExtraction prefers Anthropic, falls back to Gemini, else throws", async () => {
  const anthropicFetch = async () => new Response(JSON.stringify({
    content: [{ type: "tool_use", name: "record_extraction", input: {
      document_type: "RECEIPT", currency: "MVR", line_items: [],
      predicted_tax_category: "GGST", confidence_score: 0.9, ai_reasoning: "a" } }],
  }), { status: 200 });
  const geminiFetch = async () => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      document_type: "BILL", currency: "MVR", line_items: [],
      predicted_tax_category: "GGST", confidence_score: 0.9, ai_reasoning: "g" }) }] } }],
  }), { status: 200 });

  // Both keys set → Anthropic wins.
  const both = await runExtraction({ anthropicKey: "a", geminiKey: "g",
    base64: "A", contentType: "image/png", fetchImpl: anthropicFetch });
  assert.equal(both.model, DEFAULT_EXTRACTION_MODEL);
  assert.equal(both.extraction.documentType, "RECEIPT");

  // Only Gemini set → Gemini runs.
  const g = await runExtraction({ geminiKey: "g", geminiModel: "gemini-2.5-pro",
    base64: "A", contentType: "image/png", fetchImpl: geminiFetch });
  assert.equal(g.model, "gemini-2.5-pro");
  assert.equal(g.extraction.documentType, "BILL");

  // Neither set → throws.
  await assert.rejects(() => runExtraction({ base64: "A", contentType: "image/png" }), /No AI provider/);
});
