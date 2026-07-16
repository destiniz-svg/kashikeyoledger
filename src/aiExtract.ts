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

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// A rolling alias so we don't pin a version Google later retires for new keys.
export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

/** Upload MIME types Claude can read directly (images + PDF). */
export const ALLOWED_UPLOAD_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

/**
 * Document kinds the extractor recognises — not just purchase invoices. Bank /
 * cash documents (deposit & withdrawal slips, transfer confirmations, statements,
 * payment vouchers) are first-class so they route to the Banking module instead
 * of being forced into the GST/vendor shape.
 */
export const DOCUMENT_TYPES = [
  "PURCHASE_INVOICE",
  "SALES_INVOICE",
  "BILL",
  "RECEIPT",
  "CREDIT_NOTE",
  "BANK_DEPOSIT",
  "BANK_WITHDRAWAL",
  "BANK_TRANSFER",
  "BANK_STATEMENT",
  "PAYMENT_VOUCHER",
  "OTHER",
] as const;

/** Document types that belong in the Banking module, not the bills/GST flow. */
export const BANK_DOCUMENT_TYPES = [
  "BANK_DEPOSIT",
  "BANK_WITHDRAWAL",
  "BANK_TRANSFER",
  "BANK_STATEMENT",
  "PAYMENT_VOUCHER",
] as const;

/** True when an extraction describes a banking/cash movement (not a purchase). */
export function isBankDocument(e: Pick<Extraction, "documentType" | "direction" | "lines">): boolean {
  const t = String(e.documentType || "").toUpperCase();
  if ((BANK_DOCUMENT_TYPES as readonly string[]).includes(t)) return true;
  // A money movement with a direction and no itemised lines is bank-like.
  return Boolean(e.direction) && (e.lines?.length ?? 0) === 0;
}

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

/** How a saved categorization rule matched, for explainability. */
export interface AppliedRule {
  id: string;
  label: string; // e.g. "vendor TIN 1005632GST001 → TGST"
  matchedOn: string; // "vendor TIN" | "vendor name" | "keyword"
  wasTaxCategory: string;
  wasAccountingCategory: string | null;
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
  // --- Banking / cash-movement fields (populated for bank documents) ---
  /** Money direction for a bank/cash document: IN (received) or OUT (paid). */
  direction: string | null;
  /** The bank shown on the document (e.g. "Bank of Maldives"). */
  bankName: string | null;
  /** The account number / reference shown on the slip. */
  bankAccountRef: string | null;
  /** The other party — depositor, payee, beneficiary or sender. */
  counterparty: string | null;
  /** Slip / transaction reference number. */
  reference: string | null;
  /** A learned rule that was auto-applied to this extraction (Phase 3), if any. */
  appliedRule?: AppliedRule | null;
  /** True once a human has corrected this extraction (Phase 3). */
  overridden?: boolean;
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
    "Record the data read from any Maldivian accounting document — a purchase or " +
    "sales invoice, bill, receipt, credit note, OR a bank/cash document such as a " +
    "deposit slip, withdrawal slip, transfer confirmation, statement or payment " +
    "voucher. Call this exactly once with everything you can read.",
  input_schema: {
    type: "object",
    properties: {
      document_type: { type: "string", enum: [...DOCUMENT_TYPES] },
      direction: {
        type: ["string", "null"],
        enum: ["IN", "OUT", null],
        description:
          "For a bank/cash document, the money direction from the account holder's " +
          "view: IN for a deposit/receipt/credit, OUT for a withdrawal/payment/debit. " +
          "Null for a purchase/sales document.",
      },
      bank_name: { type: ["string", "null"], description: "Bank shown on the document, e.g. Bank of Maldives" },
      bank_account_ref: { type: ["string", "null"], description: "Account number/reference printed on the slip" },
      counterparty: {
        type: ["string", "null"],
        description: "The other party — depositor, payee, beneficiary or sender (bank/cash documents)",
      },
      reference: { type: ["string", "null"], description: "Slip / transaction reference number" },
      vendor_name: { type: ["string", "null"], description: "Supplier / merchant name (purchase documents)" },
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
  "businesses in the Maldives. You read ANY accounting document and return its",
  "data by calling the record_extraction tool exactly once.",
  "",
  "First, classify the document (document_type):",
  "- PURCHASE_INVOICE / BILL — a supplier billing the business (accounts payable).",
  "- SALES_INVOICE / RECEIPT — the business billing a customer, or a paid receipt.",
  "- CREDIT_NOTE — a refund/adjustment to a prior invoice.",
  "- BANK_DEPOSIT / BANK_WITHDRAWAL — a bank counter deposit or withdrawal slip.",
  "- BANK_TRANSFER — a transfer / remittance confirmation.",
  "- BANK_STATEMENT — a bank account statement.",
  "- PAYMENT_VOUCHER — a payment authorisation/voucher.",
  "- OTHER — anything else.",
  "",
  "For BANK/CASH documents (deposit/withdrawal/transfer/statement/voucher):",
  "- Set `direction`: IN for a deposit/credit/money received, OUT for a",
  "  withdrawal/payment/money paid (from the account holder's point of view).",
  "- Fill `bank_name`, `bank_account_ref`, `counterparty` (depositor/payee/",
  "  beneficiary) and `reference` (slip/transaction number). Put the total in",
  "  `grand_total`. These are cash movements, NOT taxable supplies: leave",
  "  line_items empty, set predicted_tax_category to OUT_OF_SCOPE, and do not",
  "  expect a vendor TIN or invoice number.",
  "",
  "For PURCHASE/SALES documents, set direction to null and extract vendor, TIN,",
  "invoice number, line items and tax as below.",
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
  const dir = String(r.direction ?? "").trim().toUpperCase();
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
    direction: dir === "IN" || dir === "OUT" ? dir : null,
    bankName: strOrNull(r.bank_name),
    bankAccountRef: strOrNull(r.bank_account_ref),
    counterparty: strOrNull(r.counterparty),
    reference: strOrNull(r.reference),
    appliedRule: (r.appliedRule as Extraction["appliedRule"]) ?? null,
    overridden: Boolean(r.overridden),
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

  // Foreign currency without a rate and low confidence apply to every document.
  if (e.currency && e.currency !== "MVR" && !e.fxRateToMvr) flags.push("FOREIGN_CURRENCY_NO_FX");
  if (e.confidenceScore < 0.6) flags.push("LOW_CONFIDENCE");

  // Bank / cash documents are money movements, not taxable supplies — the
  // vendor-TIN / invoice / line-item / tax checks don't apply. Check the fields
  // that matter for reconciliation instead.
  if (isBankDocument(e)) {
    if (e.grandTotal == null) flags.push("MISSING_AMOUNT");
    if (!e.direction) flags.push("UNKNOWN_DIRECTION");
    if (!e.documentDate) flags.push("MISSING_DATE");
    return flags;
  }

  if (!e.vendorName) flags.push("MISSING_VENDOR_NAME");
  if (!e.vendorTin) flags.push("MISSING_VENDOR_TIN");
  if (!e.invoiceNumber) flags.push("MISSING_INVOICE_NUMBER");
  if (!e.documentDate) flags.push("MISSING_DATE");
  if (e.lines.length === 0) flags.push("NO_LINE_ITEMS");

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

  return flags;
}

/**
 * Shape a bank/cash extraction into a statement line for the Banking module.
 * Returns null when there's nothing bankable (no amount). IN→CREDIT, OUT→DEBIT;
 * a missing direction defaults to DEBIT (money out) as the safer assumption.
 */
export function bankLineFromExtraction(e: Extraction): {
  date: string; direction: string; amount: number;
  reference: string | null; counterparty: string | null; narrative: string | null; type: string;
} | null {
  const amount = e.grandTotal ?? e.subtotal;
  if (amount == null || amount <= 0) return null;
  const party = e.counterparty ?? e.vendorName ?? null;
  const pretty = String(e.documentType || "Bank document").replace(/_/g, " ").toLowerCase();
  return {
    date: e.documentDate ?? new Date().toISOString().slice(0, 10),
    direction: e.direction === "IN" ? "CREDIT" : "DEBIT",
    amount: Math.round(amount * 100) / 100,
    reference: e.reference ?? e.invoiceNumber,
    counterparty: party,
    narrative: [pretty, party].filter(Boolean).join(" — ") || pretty,
    type: e.documentType,
  };
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

// ---------------------------------------------------------------------------
// Gemini (Google AI Studio) provider. Same shared prompt / normalization /
// validation as the Claude path — only the wire format differs. Gemini reads
// images and PDFs via inline_data and returns structured JSON via a response
// schema. Also dependency-free (plain fetch).
// ---------------------------------------------------------------------------

/**
 * Gemini's responseSchema is an OpenAPI-3 subset: uppercase `type`, `nullable`
 * for optional fields (no JSON-Schema `["string","null"]` unions), and no free-
 * form object maps — so `field_confidence` is omitted here (it's optional).
 */
export const GEMINI_EXTRACTION_SCHEMA = {
  type: "OBJECT",
  properties: {
    document_type: { type: "STRING", enum: [...DOCUMENT_TYPES] },
    direction: { type: "STRING", enum: ["IN", "OUT"], nullable: true },
    bank_name: { type: "STRING", nullable: true },
    bank_account_ref: { type: "STRING", nullable: true },
    counterparty: { type: "STRING", nullable: true },
    reference: { type: "STRING", nullable: true },
    vendor_name: { type: "STRING", nullable: true },
    vendor_tin: { type: "STRING", nullable: true },
    invoice_number: { type: "STRING", nullable: true },
    document_date: { type: "STRING", nullable: true },
    due_date: { type: "STRING", nullable: true },
    currency: { type: "STRING" },
    fx_rate_to_mvr: { type: "NUMBER", nullable: true },
    line_items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          description: { type: "STRING" },
          quantity: { type: "NUMBER" },
          unit_price: { type: "NUMBER" },
          amount: { type: "NUMBER" },
          tax_category: { type: "STRING", enum: [...TAX_ENUM] },
          tax_rate_percent: { type: "NUMBER" },
          accounting_category: { type: "STRING", nullable: true },
        },
        required: ["description", "quantity", "unit_price", "amount", "tax_category", "tax_rate_percent"],
      },
    },
    subtotal: { type: "NUMBER", nullable: true },
    tax_total: { type: "NUMBER", nullable: true },
    grand_total: { type: "NUMBER", nullable: true },
    accounting_category: { type: "STRING", nullable: true },
    predicted_tax_category: { type: "STRING", enum: [...TAX_ENUM] },
    confidence_score: { type: "NUMBER" },
    ai_reasoning: { type: "STRING" },
  },
  required: ["document_type", "currency", "line_items", "predicted_tax_category", "confidence_score", "ai_reasoning"],
} as const;

/** Build the Gemini generateContent request body for one document. Pure. */
export function buildGeminiRequest(opts: {
  base64: string;
  mediaType: string;
  filename?: string;
}): Record<string, unknown> {
  const { base64, mediaType, filename } = opts;
  const instruction =
    `Read this ${isPdfMedia(mediaType) ? "PDF" : "image"} of a purchase document` +
    (filename ? ` (file: ${filename})` : "") +
    ". Extract every field and line item, categorise it for MIRA, and return the JSON.";
  return {
    system_instruction: { parts: [{ text: EXTRACTION_SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: mediaType, data: base64 } },
          { text: instruction },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: GEMINI_EXTRACTION_SCHEMA,
      temperature: 0,
    },
  };
}

/** Pull the structured JSON out of a Gemini generateContent response. */
export function parseGeminiResponse(body: unknown): Extraction {
  const b = body as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  if (b?.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the request (${b.promptFeedback.blockReason})`);
  }
  const parts = b?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.find((p) => typeof p.text === "string")?.text;
  if (!text) throw new Error("Gemini returned no content");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini did not return valid JSON");
  }
  const e = normalizeExtraction(parsed);
  e.validationFlags = deriveValidationFlags(e);
  return e;
}

/** One generateContent call. Returns the parsed body and whether it succeeded. */
async function geminiGenerate(
  apiKey: string, model: string, base64: string, mediaType: string,
  filename: string | undefined, doFetch: FetchLike,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await doFetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify(buildGeminiRequest({ base64, mediaType, filename })),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { ok: res.ok, status: res.status, body };
}

/** True when a failure means the model name is retired / unavailable, not a real error. */
function isModelUnavailable(r: { status: number; body: unknown }): boolean {
  if (r.status === 404) return true;
  const msg = JSON.stringify(r.body ?? "").toLowerCase();
  return /no longer available|not found|is not supported|not available|update your code|unsupported model/.test(msg);
}

/**
 * Ask Google which models this key can use, and pick one that supports
 * generateContent — preferring a (non-lite) flash model for speed/cost.
 */
export async function pickGeminiModel(apiKey: string, doFetch: FetchLike): Promise<string | null> {
  const res = await doFetch(`${GEMINI_BASE}?pageSize=1000`, {
    method: "GET",
    headers: { "x-goog-api-key": apiKey },
  });
  const body = (await res.json().catch(() => ({}))) as {
    models?: { name?: string; supportedGenerationMethods?: string[] }[];
  };
  const usable = (body.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => String(m.name ?? "").replace(/^models\//, ""))
    .filter(Boolean);
  return (
    usable.find((n) => n.includes("flash") && !n.includes("lite")) ??
    usable.find((n) => n.includes("flash")) ??
    usable.find((n) => n.includes("pro")) ??
    usable[0] ??
    null
  );
}

/**
 * Read a document with Gemini and return the structured extraction. If the
 * configured model has been retired for this key, discover an available model
 * once and retry — so a Google model rename doesn't break ingestion.
 */
export async function extractDocumentGemini(opts: {
  apiKey: string;
  model?: string;
  base64: string;
  contentType: string;
  filename?: string;
  fetchImpl?: FetchLike;
}): Promise<Extraction> {
  const { apiKey, base64, contentType, filename } = opts;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const model = opts.model || DEFAULT_GEMINI_MODEL;
  const mediaType = mediaTypeFor(contentType);
  const doFetch = opts.fetchImpl ?? (globalThis.fetch as FetchLike);

  let r = await geminiGenerate(apiKey, model, base64, mediaType, filename, doFetch);
  if (!r.ok && isModelUnavailable(r)) {
    const alt = await pickGeminiModel(apiKey, doFetch).catch(() => null);
    if (alt && alt !== model) {
      r = await geminiGenerate(apiKey, alt, base64, mediaType, filename, doFetch);
    }
  }
  if (!r.ok) {
    const msg =
      (r.body as { error?: { message?: string } })?.error?.message ??
      `Gemini request failed (${r.status})`;
    throw new Error(String(msg));
  }
  return parseGeminiResponse(r.body);
}

/** Config for picking a provider: Anthropic first, else Gemini. */
export interface ProviderConfig {
  anthropicKey?: string;
  anthropicModel?: string;
  geminiKey?: string;
  geminiModel?: string;
}

/** True when at least one AI provider key is configured. */
export function hasProvider(cfg: ProviderConfig): boolean {
  return Boolean(cfg.anthropicKey || cfg.geminiKey);
}

/**
 * Run extraction with whichever provider is configured — Anthropic (Claude) when
 * its key is set, else Gemini. Returns the extraction and the model that ran it.
 * Throws if neither key is configured.
 */
export async function runExtraction(
  cfg: ProviderConfig & { base64: string; contentType: string; filename?: string; fetchImpl?: FetchLike },
): Promise<{ extraction: Extraction; model: string }> {
  const shared = { base64: cfg.base64, contentType: cfg.contentType, filename: cfg.filename, fetchImpl: cfg.fetchImpl };
  if (cfg.anthropicKey) {
    const model = cfg.anthropicModel || DEFAULT_EXTRACTION_MODEL;
    const extraction = await extractDocument({ apiKey: cfg.anthropicKey, model, ...shared });
    return { extraction, model };
  }
  if (cfg.geminiKey) {
    const model = cfg.geminiModel || DEFAULT_GEMINI_MODEL;
    const extraction = await extractDocumentGemini({ apiKey: cfg.geminiKey, model, ...shared });
    return { extraction, model };
  }
  throw new Error("No AI provider configured (set ANTHROPIC_API_KEY or GEMINI_API_KEY)");
}
