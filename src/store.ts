/**
 * Storage contract for the ledger API. Two implementations exist: an in-memory
 * store (for local dev and tests) and a Supabase-backed store that reads and
 * writes the real Kashikeyo Ledger schema (ledger_accounts / journal_entries /
 * journal_lines), scoped to one organization.
 *
 * Amounts are plain decimal numbers in major currency units (e.g. MVR), to
 * match the `numeric` debit/credit columns in the database.
 */
import type { Extraction } from "./aiExtract.ts";

export type { Extraction } from "./aiExtract.ts";

/** A chart-of-accounts entry. `accountType` is one of the DB-allowed types. */
export interface AccountRow {
  id?: string;
  code: string;
  name: string;
  accountType: string;
}

/** Account types permitted by the ledger_accounts check constraint. */
export const ACCOUNT_TYPES = [
  "ASSET",
  "LIABILITY",
  "EXPENSE",
  "COGS",
  "TAX",
  "BANK",
  "FX",
] as const;

export interface LineInput {
  accountCode: string;
  debit?: number;
  credit?: number;
}

export interface EntryInput {
  date: string;
  memo: string;
  lines: LineInput[];
}

export interface EntryLine {
  accountCode: string;
  debit: number;
  credit: number;
  currency?: string;
}

export interface EntryRow {
  id: string;
  date: string;
  memo: string;
  lines: EntryLine[];
}

export interface TrialBalanceRow {
  code: string;
  name: string;
  accountType: string;
  debit: number;
  credit: number;
  /** Net balance, debit-positive (debit total minus credit total). */
  balance: number;
}

/** Tax categories permitted by the transaction_line_items enum. */
export const TAX_CATEGORIES = [
  "GGST",
  "TGST",
  "ZERO_RATED",
  "EXEMPT",
  "OUT_OF_SCOPE",
] as const;

export interface SaleLineInput {
  description: string;
  quantity?: number;
  unitPrice: number;
  taxCategory?: string;
  taxRatePercent?: number;
}

export interface SaleInput {
  date: string;
  currency?: string;
  notes?: string;
  lines: SaleLineInput[];
}

export interface SaleLine {
  description: string;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
  taxCategory: string;
  taxRatePercent: number;
  taxAmount: number;
}

export interface SaleRow {
  id: string;
  date: string;
  currency: string;
  status: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  lines: SaleLine[];
}

export interface RevenueSummary {
  from: string;
  to: string;
  salesCount: number;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
}

/** The GST-style returns Kashikeyo prepares: MIRA 205 (GGST) and 206 (TGST). */
export const TAX_FORMS = [
  { form: "MIRA_205_GGST", taxCategory: "GGST", tax: "GGST", mira: "MIRA 205", rate: 8 },
  { form: "MIRA_206_TGST", taxCategory: "TGST", tax: "TGST", mira: "MIRA 206", rate: 17 },
] as const;

/** A GST-style (MIRA 205/206) filing period with the return boxes computed. */
export interface GstFilingRow {
  id: string;
  form: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  status: string;
  sales8: number; // Box 1 — sales at 8% (GST-inclusive)
  salesZero: number; // Box 2 — zero-rated
  salesExempt: number; // Box 3 — exempt
  salesOos: number; // Box 4 — out of scope
  outputTax: number; // Box 6
  inputTax: number; // Box 7
  netPayable: number; // Box 10 = Box 6 − Box 7
}

/** An inventory item with stock valuation. */
export interface ItemRow {
  id: string;
  sku: string;
  name: string;
  unit: string;
  qtyOnHand: number;
  avgCost: number;
  stockValue: number;
  threshold: number | null;
  status: string; // "in_stock" | "low" | "out"
}

/** Stock status from quantity on hand and a low-stock threshold. */
export function itemStatus(qty: number, threshold: number | null): string {
  if (qty <= 0) return "out";
  if (threshold != null && qty <= threshold) return "low";
  return "in_stock";
}

/** Reconciliation states a bank line may be in (bank recon workflow). */
export const RECON_STATUSES = ["UNMATCHED", "SUGGESTED", "MATCHED", "EXCLUDED"] as const;

/** Direction of a bank statement line: money in (CREDIT) or out (DEBIT). */
export const BANK_DIRECTIONS = ["DEBIT", "CREDIT"] as const;

/** Signed amount for a bank line: CREDIT is money in (+), DEBIT is money out (−). */
export function bankTxnSigned(direction: string, amount: number): number {
  return direction === "CREDIT" ? amount : -amount;
}

/** Validate a reconciliation status, throwing a StoreError if unsupported. */
export function assertReconStatus(status: string): string {
  if (!(RECON_STATUSES as readonly string[]).includes(status)) {
    throw new StoreError(
      `Unsupported reconciliation status "${status}" (expected one of ${RECON_STATUSES.join(", ")})`,
    );
  }
  return status;
}

/** A bank account with its current balance and reconciliation rollups. */
export interface BankAccountRow {
  id: string;
  name: string;
  bankName: string;
  accountMasked: string;
  currency: string;
  linkedAccount: boolean; // mapped to a ledger account
  balance: number; // current balance (latest running balance, or net of lines)
  txnCount: number;
  unreconciled: number; // lines still UNMATCHED or SUGGESTED
}

/** Sources a statement import may originate from (statement_source enum). */
export const STATEMENT_SOURCES = ["CSV_UPLOAD", "PDF_UPLOAD", "BANK_FEED"] as const;

/** A parsed statement line to be imported into bank_transactions. */
export interface ImportLineInput {
  date: string; // ISO YYYY-MM-DD
  valueDate?: string | null;
  type?: string | null;
  reference?: string | null;
  counterparty?: string | null;
  narrative?: string | null;
  direction: string; // "DEBIT" | "CREDIT"
  amount: number; // positive magnitude
  balance?: number | null;
}

/** Outcome of a statement import: how many lines landed vs. were duplicates. */
export interface ImportResult {
  importId: string | null;
  imported: number;
  duplicates: number;
  total: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate and normalize parsed statement lines: each needs a valid ISO date,
 * a DEBIT/CREDIT direction, and a positive amount. Throws StoreError on bad
 * input. Returns clean lines safe to hand to the import RPC.
 */
export function normalizeImportLines(lines: unknown): ImportLineInput[] {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new StoreError("No statement lines to import");
  }
  return lines.map((raw, i) => {
    const l = (raw ?? {}) as Record<string, unknown>;
    const date = String(l.date ?? "");
    if (!ISO_DATE.test(date)) {
      throw new StoreError(`Line ${i + 1}: date must be ISO YYYY-MM-DD, got "${date}"`);
    }
    const direction = String(l.direction ?? "").toUpperCase();
    if (!(BANK_DIRECTIONS as readonly string[]).includes(direction)) {
      throw new StoreError(`Line ${i + 1}: direction must be DEBIT or CREDIT`);
    }
    const amount = Number(l.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new StoreError(`Line ${i + 1}: amount must be a positive number`);
    }
    const str = (v: unknown) => {
      const s = v == null ? "" : String(v).trim();
      return s === "" ? null : s;
    };
    const valueDate = str(l.valueDate);
    if (valueDate && !ISO_DATE.test(valueDate)) {
      throw new StoreError(`Line ${i + 1}: valueDate must be ISO YYYY-MM-DD`);
    }
    const balance = l.balance == null || l.balance === "" ? null : Number(l.balance);
    if (balance != null && !Number.isFinite(balance)) {
      throw new StoreError(`Line ${i + 1}: balance must be a number`);
    }
    return {
      date,
      valueDate,
      type: str(l.type),
      reference: str(l.reference),
      counterparty: str(l.counterparty),
      narrative: str(l.narrative),
      direction,
      amount: round2(amount),
      balance,
    };
  });
}

/** A single bank statement line, shaped for the Banking screen. */
export interface BankTxnRow {
  id: string;
  accountId: string;
  accountName: string;
  date: string; // "05 Jul 2026"
  isoDate: string;
  type: string;
  reference: string;
  counterparty: string;
  narrative: string;
  direction: string; // "DEBIT" | "CREDIT"
  amount: number; // signed: +credit, −debit
  currency: string;
  reconStatus: string; // one of RECON_STATUSES
  matchedVendor: string | null;
}

/** Organization profile + tax registration, shaped for the Settings screen. */
export interface OrgSettings {
  name: string;
  tin: string;
  sector: string;
  industryCode: string;
  baseCurrency: string;
  reportingCurrency: string;
  timezone: string;
  gstRegistered: boolean;
  gstFilingFrequency: string;
  fiscalYearStartMonth: number;
  greenTaxEnabled: boolean;
  greenTaxRateUsd: number;
}

/** Business sectors and GST filing frequencies allowed by the DB. */
export const BUSINESS_SECTORS = ["GENERAL", "TOURISM"] as const;
export const GST_FREQUENCIES = ["MONTHLY", "QUARTERLY"] as const;

/** The subset of OrgSettings the Settings screen may edit (currency is fixed). */
export type OrgSettingsPatch = Partial<
  Pick<
    OrgSettings,
    | "name"
    | "tin"
    | "sector"
    | "industryCode"
    | "timezone"
    | "gstRegistered"
    | "gstFilingFrequency"
    | "fiscalYearStartMonth"
    | "greenTaxEnabled"
    | "greenTaxRateUsd"
  >
>;

/**
 * Validate and normalize an editable-settings patch: only recognised keys are
 * kept, enums/ranges are checked, and text is trimmed. Throws StoreError on bad
 * input. Returns a clean patch (may be empty).
 */
export function normalizeSettingsPatch(input: unknown): OrgSettingsPatch {
  const src = (input ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(src, k);
  const str = (v: unknown) => (v == null ? "" : String(v).trim());

  if (has("name")) {
    const name = str(src.name);
    if (!name) throw new StoreError("Organization name cannot be empty");
    out.name = name;
  }
  if (has("tin")) out.tin = str(src.tin);
  if (has("industryCode")) out.industryCode = str(src.industryCode);
  if (has("timezone")) out.timezone = str(src.timezone);
  if (has("sector")) {
    const sector = str(src.sector).toUpperCase();
    if (!(BUSINESS_SECTORS as readonly string[]).includes(sector)) {
      throw new StoreError(`Sector must be one of ${BUSINESS_SECTORS.join(", ")}`);
    }
    out.sector = sector;
  }
  if (has("gstFilingFrequency")) {
    const freq = str(src.gstFilingFrequency).toUpperCase();
    if (!(GST_FREQUENCIES as readonly string[]).includes(freq)) {
      throw new StoreError(`GST filing frequency must be one of ${GST_FREQUENCIES.join(", ")}`);
    }
    out.gstFilingFrequency = freq;
  }
  if (has("fiscalYearStartMonth")) {
    const m = Number(src.fiscalYearStartMonth);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      throw new StoreError("Fiscal year start month must be an integer between 1 and 12");
    }
    out.fiscalYearStartMonth = m;
  }
  if (has("greenTaxEnabled")) out.greenTaxEnabled = Boolean(src.greenTaxEnabled);
  if (has("greenTaxRateUsd")) {
    const r = Number(src.greenTaxRateUsd);
    if (!Number.isFinite(r) || r < 0) throw new StoreError("Green tax rate must be zero or more");
    out.greenTaxRateUsd = round2(r);
  }
  return out as OrgSettingsPatch;
}

/** A team member of the organization (Settings screen). */
export interface MemberRow {
  name: string;
  email: string;
  role: string;
  ini: string;
}

/** Two-letter initials for a person, falling back to the email local-part. */
export function nameInitials(name: string, email = ""): string {
  const src = (name || email.split("@")[0] || "?").trim();
  const words = src.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

/** Capture sources a document may arrive from (capture_source enum). */
export const CAPTURE_SOURCES = [
  "MANUAL_UPLOAD",
  "EMAIL_IN",
  "MOBILE_APP",
  "POS_API",
  "BANK_IMPORT",
] as const;

/** A document (receipt/invoice) uploaded for AI extraction. */
export interface DocumentUpload {
  filename: string;
  contentType: string;
  dataBase64: string;
  captureSource?: string;
}

/** Outcome of ingesting one document: the stored file + its AI extraction. */
export interface IngestResult {
  documentId: string | null;
  fileName: string;
  mimeType: string;
  byteSize: number;
  status: string; // document_status: EXTRACTED | EXTRACTION_FAILED | UPLOADED
  model: string | null;
  duplicate: boolean;
  extraction: Extraction | null;
  error: string | null;
}

/** A stored document plus its latest extraction, for the review screen. */
export interface DocumentRow {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  status: string;
  captureSource: string;
  createdAt: string;
  model: string | null;
  extraction: Extraction | null;
}

/**
 * Validate an incoming document upload: a filename, a supported content type and
 * non-empty base64 data. Returns the decoded byte length. Throws StoreError.
 */
export function assertUpload(u: DocumentUpload): { bytes: number } {
  if (!u || typeof u !== "object") throw new StoreError("A document upload is required");
  if (!u.filename || !String(u.filename).trim()) {
    throw new StoreError("filename is required");
  }
  if (!u.contentType || !String(u.contentType).trim()) {
    throw new StoreError("contentType is required");
  }
  const data = String(u.dataBase64 ?? "");
  if (!data) throw new StoreError("dataBase64 is required");
  let bytes: number;
  try {
    bytes = Buffer.from(data, "base64").length;
  } catch {
    throw new StoreError("dataBase64 is not valid base64");
  }
  if (bytes === 0) throw new StoreError("dataBase64 decoded to an empty file");
  if (u.captureSource && !(CAPTURE_SOURCES as readonly string[]).includes(u.captureSource)) {
    throw new StoreError(`captureSource must be one of ${CAPTURE_SOURCES.join(", ")}`);
  }
  return { bytes };
}

/** A vendor with spend rollups, shaped for the Vendors screen. */
export interface VendorRow {
  id: string;
  name: string;
  tin: string;
  gstRegistered: boolean;
  currency: string;
  billCount: number;
  totalSpend: number;
  lastBillDate: string;
  ini: string;
}

/** A purchase bill / expense, shaped for the Bills and Approval screens. */
export interface BillRow {
  id: string;
  vendor: string;
  tin: string;
  invoice: string;
  po: string;
  date: string;
  due: string;
  cur: string;
  subtotal: number;
  gst: number;
  total: number;
  cat: string;
  taxCat: string;
  status: string;
  aging: string;
  rate: number;
  line: string;
  qty: number;
  unit: number;
}

export interface LedgerStore {
  /** Identifies the active backend, e.g. "supabase" or "memory". */
  readonly backend: string;
  /** The organization id this store is scoped to (may be "" for memory). */
  readonly org: string;

  listAccounts(): Promise<AccountRow[]>;
  createAccount(account: AccountRow): Promise<AccountRow>;
  listEntries(): Promise<EntryRow[]>;
  postEntry(entry: EntryInput): Promise<{ id: string }>;
  trialBalance(): Promise<TrialBalanceRow[]>;
  outOfBalanceBy(): Promise<number>;

  recordSale(sale: SaleInput): Promise<{ id: string }>;
  listSales(): Promise<SaleRow[]>;
  revenue(from: string, to: string): Promise<RevenueSummary>;

  listBills(): Promise<BillRow[]>;
  setBillStatus(id: string, status: string): Promise<{ id: string; status: string }>;

  /**
   * Verify a Supabase access token belongs to a member of this organization.
   * Used to authorize browser writes by a logged-in user. Returns false for
   * backends without an auth provider (e.g. the in-memory store).
   */
  verifyMember(token: string): Promise<boolean>;

  listVendors(): Promise<VendorRow[]>;
  listItems(): Promise<ItemRow[]>;
  listBankAccounts(): Promise<BankAccountRow[]>;
  listBankTransactions(): Promise<BankTxnRow[]>;
  /**
   * Transition a bank line's reconciliation status. `status` must be one of
   * RECON_STATUSES. `vendorId` attaches a vendor when confirming a MATCHED line;
   * resetting to UNMATCHED clears any vendor.
   */
  setBankRecon(
    txnId: string,
    status: string,
    vendorId?: string | null,
  ): Promise<{ id: string; reconStatus: string }>;
  /**
   * Import parsed statement lines into a bank account, deduplicating so a
   * re-imported statement adds nothing. `source` is one of STATEMENT_SOURCES.
   */
  importStatement(
    bankAccountId: string,
    source: string,
    lines: ImportLineInput[],
  ): Promise<ImportResult>;
  /** MIRA 205 (GGST) filing calendar with computed return boxes. */
  listGstFilings(): Promise<GstFilingRow[]>;
  /** MIRA 206 (TGST) filing calendar with computed return boxes. */
  listTgstFilings(): Promise<GstFilingRow[]>;
  /** Taxpayer identity for filings (organization name + TIN). */
  taxpayer(): Promise<{ name: string; tin: string }>;

  /** Organization profile + tax registration for the Settings screen. */
  orgSettings(): Promise<OrgSettings>;
  /** Apply an editable-settings patch and return the updated profile. */
  updateOrgSettings(patch: OrgSettingsPatch): Promise<OrgSettings>;
  /** Team members of the organization. */
  listMembers(): Promise<MemberRow[]>;

  /**
   * Ingest an uploaded receipt/invoice: store the file, run AI extraction, and
   * persist the structured result. Re-uploading the same bytes is deduplicated
   * (returns the existing extraction). Degrades gracefully when AI isn't
   * configured (stores the file, returns extraction: null with an error note).
   */
  ingestDocument(upload: DocumentUpload): Promise<IngestResult>;
  /** Uploaded documents with their latest extraction, newest first. */
  listDocuments(): Promise<DocumentRow[]>;
}

const COMPANY_SUFFIX = new Set(["pvt", "ltd", "llp", "limited", "private", "inc", "co", "company"]);

/** Two-letter initials for a vendor avatar, ignoring company suffixes. */
export function vendorInitials(name: string): string {
  const words = name
    .split(/\s+/)
    .filter((w) => !COMPANY_SUFFIX.has(w.toLowerCase().replace(/[^a-z]/gi, "")));
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? name).slice(0, 2).toUpperCase();
}

/** Statuses a bill may be moved to via the approval workflow. */
export const BILL_STATUSES = ["DRAFT", "AI_VERIFIED", "ACCOUNTANT_APPROVED", "REJECTED"] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format an ISO date (YYYY-MM-DD) as "05 Jul 2026". */
export function formatBillDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
}

/** Aging bucket of a due date relative to `today` (defaults to now). */
export function agingBucket(dueIso: string | null, today: Date = new Date()): string {
  if (!dueIso) return "current";
  const due = Date.parse(`${dueIso}T00:00:00Z`);
  const now = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
  const days = Math.floor((now - due) / 86_400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "1_30";
  if (days <= 60) return "31_60";
  if (days <= 90) return "61_90";
  return "90_plus";
}

/** Raised for invalid ledger operations; carries an HTTP status hint. */
export class StoreError extends Error {
  override name = "StoreError";
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
  }
}

/** Round a decimal amount to whole minor units (2 dp) as an integer. */
export function toMinor(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Validate an entry the same way the database does: at least two lines, each
 * with exactly one positive side, non-negative amounts, and balanced totals.
 * Returns the per-line normalized {debit, credit} in minor units.
 */
export function validateEntry(entry: EntryInput): {
  debitMinor: number;
  creditMinor: number;
} {
  if (!Array.isArray(entry.lines) || entry.lines.length < 2) {
    throw new StoreError(
      `A journal entry needs at least two lines, got ${entry.lines?.length ?? 0}`,
    );
  }
  let debitMinor = 0;
  let creditMinor = 0;
  for (const line of entry.lines) {
    const d = toMinor(line.debit ?? 0);
    const c = toMinor(line.credit ?? 0);
    if (d < 0 || c < 0) {
      throw new StoreError("Debit and credit must be non-negative");
    }
    if (d > 0 === c > 0) {
      throw new StoreError(
        "Each line must have exactly one of debit or credit greater than zero",
      );
    }
    debitMinor += d;
    creditMinor += c;
  }
  if (debitMinor !== creditMinor) {
    throw new StoreError(
      `Entry does not balance: debits ${debitMinor / 100} !== credits ${creditMinor / 100}`,
    );
  }
  return { debitMinor, creditMinor };
}

/** Round a decimal to two places (whole minor units). */
export function round2(amount: number): number {
  return toMinor(amount) / 100;
}

/**
 * Validate a sale and compute per-line subtotal/tax and rolled-up totals,
 * matching the `record_sale` SQL function (subtotal = qty*price rounded to 2dp,
 * tax = subtotal*rate/100 rounded to 2dp).
 */
export function computeSale(sale: SaleInput): {
  lines: SaleLine[];
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
} {
  if (!Array.isArray(sale.lines) || sale.lines.length < 1) {
    throw new StoreError("A sale needs at least one line item");
  }
  let subMinor = 0;
  let taxMinor = 0;
  const lines = sale.lines.map((l) => {
    if (!l.description || !l.description.trim()) {
      throw new StoreError("Each line item needs a description");
    }
    const quantity = l.quantity ?? 1;
    const unitPrice = l.unitPrice;
    const taxRatePercent = l.taxRatePercent ?? 0;
    if (unitPrice == null || Number.isNaN(unitPrice)) {
      throw new StoreError("Each line item needs a unit price");
    }
    if (quantity <= 0 || unitPrice < 0 || taxRatePercent < 0) {
      throw new StoreError(
        "quantity must be > 0, and unit price / tax rate must be >= 0",
      );
    }
    const lineSubtotal = round2(quantity * unitPrice);
    const taxAmount = round2((lineSubtotal * taxRatePercent) / 100);
    subMinor += toMinor(lineSubtotal);
    taxMinor += toMinor(taxAmount);
    return {
      description: l.description,
      quantity,
      unitPrice,
      lineSubtotal,
      taxCategory: l.taxCategory ?? "OUT_OF_SCOPE",
      taxRatePercent,
      taxAmount,
    };
  });
  return {
    lines,
    subtotal: subMinor / 100,
    taxTotal: taxMinor / 100,
    grandTotal: (subMinor + taxMinor) / 100,
  };
}
