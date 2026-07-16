/**
 * AI ingestion (Phase 2). Reads an uploaded receipt / invoice / bill — an image
 * or a PDF — with Claude's vision and returns a structured extraction mapped to
 * the Maldivian accounting categories and a predicted MIRA tax code.
 *
 * Dependency-free: the Anthropic Messages API is called directly over `fetch`
 * (no SDK), matching the rest of the service. The model is asked to call a
 * single tool whose input_schema is our extraction shape; forcing that tool via
 * `tool_choice` makes the reply structured JSON we then normalize and validate.
 *
 * The pure pieces (schema, prompt, media-type mapping, request building,
 * normalization, validation-flag derivation) are exported so they can be tested
 * without a network call or an API key.
 */
import { TAX_CATEGORIES } from "./store.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
export const DEFAULT_EXTRACTION_MODEL = "claude-opus-4-8";

/** Upload MIME types Claude can read directly (images + PDF). */
export const ALLOWED_UPLOAD_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

/** Document kinds the extractor recognises. */
export const DOCUMENT_TYPES = ["INVOICE", "RECEIPT", "BILL", "STATEMENT", "OTHER"] as const;

/** A single extracted line item. */
export interface ExtractionLine {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxCategory: string;
  taxRatePercent: number;
  accountingCategory: string;
}

/** The structured result of reading one document. */
export interface Extraction {
  documentType: string;
  vendorName: string | null;
  vendorTin: string | null;
  invoiceNumber: string | null;
  documentDate: string | null;
  dueDate: string | null;
  currency: string;
  fxRateToMvr: number | null;
  lines: ExtractionLine[];
  subtotal: number | null;
  taxTotal: number | null;
  grandTotal: number | null;
  accountingCategory: string | null;
  predictedTaxCategory: string;
  confidenceScore: number;
  aiReasoning: string;
  fieldConfidence: Record<string, number>;
  validationFlags: string[];
}

/**
 * Map an upload content type to the Anthropic media type, throwing on anything
 * unsupported. Ignores a charset suffix (e.g. "image/png; charset=binary").
 */
export function mediaTypeFor(contentType: string): string {
  const mt = (String(contentType || "").split(";")[0] ?? "").trim().toLowerCase();
  if (!(ALLOWED_UPLOAD_MIME as readonly string[]).includes(mt)) {
    throw new Error(
      `Unsupported upload type "${contentType}" (allowed: ${ALLOWED_UPLOAD_MIME.join(", ")})`,
    );
  }
  return mt;
}

/** True when the media type is a PDF (a `document` block), else an image. */
export function isPdfMedia(mediaType: string): boolean {
  return mediaType === "application/pdf";
}

const TAX_ENUM = TAX_CATEGORIES as readonly string[];

/** The extraction tool. Its input_schema is the JSON shape Claude must return. */
export const EXTRACTION_TOOL = {
  name: "record_extraction",
  description:
    "Record the data read from a Maldivian purchase invoice, bill or receipt. " +
    "Call this exactly once with everything you can read from the document.",
  input_schema: {
    type: "object",
    properties: {
      document_type: { type: "string", enum: [...DOCUMENT_TYPES] },
      vendor_name: { type: ["string", "null"], description: "Supplier / merchant name" },
      vendor_tin: {
        type: ["string", "null"],
        description:
          "The vendor's MIRA Taxpayer Identification Number (TIN), if printed. " +
          "Often labelled TIN / GST TIN, e.g. 1005632GST001. Null if not shown.",
      },
      invoice_number: { type: ["string", "null"] },
      document_date: { type: ["string", "null"], description: "Document/issue date, ISO YYYY-MM-DD" },
      due_date: { type: ["string", "null"], description: "Payment due date, ISO YYYY-MM-DD, or null" },
      currency: {
        type: "string",
        description: "ISO 4217 code. Maldivian Rufiyaa is MVR (may be printed as Rf, MRf or MVR).",
      },
      fx_rate_to_mvr: {
        type: ["number", "null"],
        description: "Exchange rate to MVR if the document is in another currency, else null.",
      },
      line_items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            quantity: { type: "number" },
            unit_price: { type: "number" },
            amount: { type: "number", description: "Line total (quantity × unit price)" },
            tax_category: { type: "string", enum: [...TAX_ENUM] },
            tax_rate_percent: { type: "number", description: "e.g. 8 for GGST, 17 for TGST, 0 if none" },
            accounting_category: {
              type: "string",
              description: "Expense category, e.g. Supplies, Utilities, Equipment, F&B, Travel",
            },
          },
          required: ["description", "quantity", "unit_price", "amount", "tax_category", "tax_rate_percent"],
        },
      },
      subtotal: { type: ["number", "null"], description: "Net total before tax" },
      tax_total: { type: ["number", "null"], description: "Total GST / TGST charged" },
      grand_total: { type: ["number", "null"], description: "Total payable including tax" },
      accounting_category: {
        type: ["string", "null"],
        description: "Best single expense category for the whole document",
      },
      predicted_tax_category: {
        type: "string",
        enum: [...TAX_ENUM],
        description: "The MIRA tax category that best fits this document overall",
      },
      confidence_score: {
        type: "number",
        description: "Overall confidence 0..1 that this extraction is correct",
      },
      ai_reasoning: {
        type: "string",
        description: "A short, plain-language explanation of the categorisation and any doubts",
      },
      field_confidence: {
        type: "object",
        description: "Per-field confidence 0..1 for the key fields you extracted",
        properties: {
          vendor_name: { type: "number" },
          vendor_tin: { type: "number" },
          document_date: { type: "number" },
          grand_total: { type: "number" },
          predicted_tax_category: { type: "number" },
        },
      },
    },
    required: [
      "document_type",
      "currency",
      "line_items",
      "predicted_tax_category",
      "confidence_score",
      "ai_reasoning",
    ],
  },
} as const;

export const EXTRACTION_SYSTEM_PROMPT = [
  "You are the bookkeeping AI for Kashikeyo Ledger, an accounting service for",
  "businesses in the Maldives. You read a supplier invoice, bill or receipt and",
  "return its data by calling the record_extraction tool exactly once.",
  "",
  "Maldivian context you must apply:",
  "- The local currency is the Maldivian Rufiyaa (ISO code MVR; often written Rf,",
  "  MRf or Rufiyaa). Report it as MVR. USD is also common at resorts; if the",
  "  document is in USD or another currency, set currency accordingly and give",
  "  fx_rate_to_mvr only if the document itself states a rate, else null.",
  "- Documents may mix English and Thaana (Dhivehi) script. Read both; return",
  "  field values in English/Latin where a clear equivalent exists, otherwise",
  "  transcribe what is printed.",
  "- The vendor's MIRA TIN (Taxpayer Identification Number) is important for input-",
  "  tax claims. Look for TIN / GST TIN / ޓިން and capture it exactly, or null.",
  "",
  "MIRA tax categories (GST Act, Law 10/2011):",
  "- GGST  — General GST, standard rate 8% (general goods & services).",
  "- TGST  — Tourism GST, rate 17% (tourism sector: resorts, hotels, guesthouses,",
  "          diving, tourist-vessel and related supplies).",
  "- ZERO_RATED — zero-rated supplies (e.g. exports, some essentials).",
  "- EXEMPT — exempt supplies (e.g. certain health, education, financial).",
  "- OUT_OF_SCOPE — not a taxable supply / no GST element.",
  "Infer the tax_rate_percent from the category and the figures on the document;",
  "do not invent tax that is not charged. If nothing indicates tourism, use GGST.",
  "",
  "Be faithful to the document. Never fabricate a TIN, invoice number or amount:",
  "use null when a field is not present. Amounts are plain numbers (no currency",
  "symbols or thousands separators). Set confidence honestly and explain briefly.",
].join("\n");

/** Build the Messages API request body for one document. Pure — no network. */
export function buildExtractionRequest(opts: {
  model: string;
  base64: string;
  mediaType: string;
  filename?: string;
  maxTokens?: number;
}): Record<string, unknown> {
  const { model, base64, mediaType, filename, maxTokens = 4096 } = opts;
  const fileBlock = isPdfMedia(mediaType)
    ? { type: "document", source: { type: "base64", media_type: mediaType, data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };
  const instruction =
    `Read this ${isPdfMedia(mediaType) ? "PDF" : "image"} of a purchase document` +
    (filename ? ` (file: ${filename})` : "") +
    ". Extract every field and line item, categorise it for MIRA, and call " +
    "record_extraction once with the result.";
  return {
    model,
    max_tokens: maxTokens,
    system: EXTRACTION_SYSTEM_PROMPT,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
    messages: [{ role: "user", content: [fileBlock, { type: "text", text: instruction }] }],
  };
}

// --- normalization helpers -------------------------------------------------

const numOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const num = (v: unknown, fallback = 0): number => numOrNull(v) ?? fallback;
const strOrNull = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
};
const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Coerce a tax category to the allowed enum, defaulting to GGST. */
function taxCat(v: unknown): string {
  const s = String(v ?? "").trim().toUpperCase();
  return TAX_ENUM.includes(s) ? s : "GGST";
}

/**
 * Normalize the raw tool input Claude returned into a typed Extraction. Tolerant
 * of missing/loose fields — never throws on shape, so a partial read still lands.
 */
export function normalizeExtraction(raw: unknown): Extraction {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rawLines = Array.isArray(r.line_items) ? r.line_items : [];
  const lines: ExtractionLine[] = rawLines.map((item) => {
    const l = (item ?? {}) as Record<string, unknown>;
    const quantity = num(l.quantity, 1);
    const unitPrice = num(l.unit_price, 0);
    const amount = numOrNull(l.amount);
    return {
      description: String(l.description ?? "").trim(),
      quantity,
      unitPrice,
      amount: amount ?? Math.round(quantity * unitPrice * 100) / 100,
      taxCategory: taxCat(l.tax_category),
      taxRatePercent: num(l.tax_rate_percent, 0),
      accountingCategory: String(l.accounting_category ?? "").trim(),
    };
  });
  const fc = (r.field_confidence ?? {}) as Record<string, unknown>;
  const fieldConfidence: Record<string, number> = {};
  for (const [k, v] of Object.entries(fc)) {
    const n = numOrNull(v);
    if (n != null) fieldConfidence[k] = clamp01(n);
  }
  return {
    documentType: String(r.document_type ?? "OTHER").trim().toUpperCase(),
    vendorName: strOrNull(r.vendor_name),
    vendorTin: strOrNull(r.vendor_tin),
    invoiceNumber: strOrNull(r.invoice_number),
    documentDate: strOrNull(r.document_date),
    dueDate: strOrNull(r.due_date),
    currency: (strOrNull(r.currency) ?? "MVR").toUpperCase(),
    fxRateToMvr: numOrNull(r.fx_rate_to_mvr),
    lines,
    subtotal: numOrNull(r.subtotal),
    taxTotal: numOrNull(r.tax_total),
    grandTotal: numOrNull(r.grand_total),
    accountingCategory: strOrNull(r.accounting_category),
    predictedTaxCategory: taxCat(r.predicted_tax_category),
    confidenceScore: clamp01(num(r.confidence_score, 0)),
    aiReasoning: String(r.ai_reasoning ?? "").trim(),
    fieldConfidence,
    validationFlags: [],
  };
}

/**
 * Derive compliance / sanity flags from a normalized extraction. These drive the
 * review UI (Phase 3/4): missing TIN, totals that don't foot, low confidence, an
 * uncosted foreign currency, etc.
 */
export function deriveValidationFlags(e: Extraction): string[] {
  const flags: string[] = [];
  const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

  if (!e.vendorName) flags.push("MISSING_VENDOR_NAME");
  if (!e.vendorTin) flags.push("MISSING_VENDOR_TIN");
  if (!e.invoiceNumber) flags.push("MISSING_INVOICE_NUMBER");
  if (!e.documentDate) flags.push("MISSING_DATE");
  if (e.lines.length === 0) flags.push("NO_LINE_ITEMS");

  if (e.currency && e.currency !== "MVR" && !e.fxRateToMvr) {
    flags.push("FOREIGN_CURRENCY_NO_FX");
  }
  if (e.subtotal != null && e.taxTotal != null && e.grandTotal != null) {
    if (!near(e.subtotal + e.taxTotal, e.grandTotal)) flags.push("TOTALS_MISMATCH");
  }
  if (e.lines.length > 0 && e.subtotal != null) {
    const lineSum = e.lines.reduce((s, l) => s + l.amount, 0);
    if (!near(lineSum, e.subtotal, 1)) flags.push("LINE_ITEMS_SUM_MISMATCH");
  }
  // Tourism rate (TGST 17%) claimed but the document isn't flagged tourism, or
  // vice-versa — surface a mix so a human can confirm the sector.
  const cats = new Set(e.lines.map((l) => l.taxCategory));
  if (cats.size > 1) flags.push("MIXED_TAX_CATEGORIES");
  if (e.confidenceScore < 0.6) flags.push("LOW_CONFIDENCE");

  return flags;
}

/** Pull the record_extraction tool input out of a Messages API response body. */
export function parseExtractionResponse(body: unknown): Extraction {
  const content = (body as { content?: unknown })?.content;
  const blocks = Array.isArray(content) ? content : [];
  const call = blocks.find(
    (b) => (b as { type?: string })?.type === "tool_use" &&
      (b as { name?: string })?.name === EXTRACTION_TOOL.name,
  ) as { input?: unknown } | undefined;
  if (!call) {
    throw new Error("Claude did not return a record_extraction tool call");
  }
  const e = normalizeExtraction(call.input);
  e.validationFlags = deriveValidationFlags(e);
  return e;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Read a document with Claude and return the structured extraction. `fetchImpl`
 * is injectable for tests; production uses the global fetch. Throws on a missing
 * key, an unsupported type, an API error, or a response without a tool call.
 */
export async function extractDocument(opts: {
  apiKey: string;
  model?: string;
  base64: string;
  contentType: string;
  filename?: string;
  fetchImpl?: FetchLike;
}): Promise<Extraction> {
  const { apiKey, base64, contentType, filename } = opts;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  const model = opts.model || DEFAULT_EXTRACTION_MODEL;
  const mediaType = mediaTypeFor(contentType);
  const doFetch = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  const res = await doFetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(buildExtractionRequest({ model, base64, mediaType, filename })),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg =
      (body as { error?: { message?: string } })?.error?.message ??
      `Anthropic request failed (${res.status})`;
    throw new Error(String(msg));
  }
  return parseExtractionResponse(body);
}
