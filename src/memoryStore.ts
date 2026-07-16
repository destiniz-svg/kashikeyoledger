/**
 * In-memory implementation of LedgerStore for local development and tests.
 * Mirrors the real schema's shape (accounts by code, numeric debit/credit,
 * balance validation) but keeps everything in process. Data resets on restart.
 */
import {
  StoreError,
  STATEMENT_SOURCES,
  agingBucket,
  assertReconStatus,
  assertUpload,
  bankTxnSigned,
  computeSale,
  formatBillDate,
  nameInitials,
  normalizeImportLines,
  normalizeSettingsPatch,
  toMinor,
  validateEntry,
  vendorInitials,
  type AccountRow,
  type BankAccountRow,
  type BankTxnRow,
  type BillRow,
  type DocumentRow,
  type DocumentUpload,
  type IngestResult,
  type ImportLineInput,
  type ImportResult,
  type MemberRow,
  type OrgSettings,
  type OrgSettingsPatch,
  type OverrideResult,
  type PostToBankResult,
  type EntryInput,
  type EntryRow,
  type LedgerStore,
  type RevenueSummary,
  type GstFilingRow,
  type ItemRow,
  itemStatus,
  type SaleInput,
  type SaleRow,
  type TrialBalanceRow,
  type VendorRow,
} from "./store.ts";
import {
  DEFAULT_EXTRACTION_MODEL,
  bankLineFromExtraction,
  deriveValidationFlags,
  isBankDocument,
  mediaTypeFor,
  normalizeExtraction,
  type Extraction,
} from "./aiExtract.ts";
import {
  applyOverrideToExtraction,
  applyRuleToExtraction,
  buildRuleFromOverride,
  matchRule,
  normalizeRuleInput,
  ruleLabel,
  type CategorizationRule,
  type OverrideInput,
} from "./rules.ts";

/**
 * A canned extraction so the AI ingestion flow works end-to-end on the in-memory
 * backend (no Supabase, no Anthropic key). Returns a bank deposit slip when the
 * filename hints a banking document, else a typical hardware-supplier invoice;
 * validation flags are derived the same way as live.
 */
function cannedExtraction(filename: string): Extraction {
  if (/deposit|withdraw|bank|slip|transfer|voucher|remit/i.test(filename)) {
    const b = normalizeExtraction({
      document_type: "BANK_DEPOSIT",
      direction: "IN",
      bank_name: "Bank of Maldives",
      bank_account_ref: "•••• 4021",
      counterparty: "Altura Pvt Ltd",
      reference: "DEP-26071401",
      currency: "MVR",
      document_date: "2026-07-14",
      line_items: [],
      grand_total: 51000,
      predicted_tax_category: "OUT_OF_SCOPE",
      confidence_score: 0.9,
      ai_reasoning:
        `Sample extraction for "${filename}". A Bank of Maldives cash deposit of ` +
        "MVR 51,000. Cash movements are out of scope for GST — post it to Banking " +
        "for reconciliation.",
      field_confidence: { grand_total: 0.95, document_date: 0.9 },
    });
    b.validationFlags = deriveValidationFlags(b);
    return b;
  }
  const e = normalizeExtraction({
    document_type: "PURCHASE_INVOICE",
    vendor_name: "Island Mark Hardware Pvt Ltd",
    vendor_tin: null,
    invoice_number: "IMH-4471",
    document_date: "2026-05-11",
    due_date: "2026-05-26",
    currency: "MVR",
    fx_rate_to_mvr: null,
    line_items: [
      {
        description: "Assorted fixings & tools",
        quantity: 12,
        unit_price: 358.33,
        amount: 4300,
        tax_category: "GGST",
        tax_rate_percent: 8,
        accounting_category: "Hardware",
      },
    ],
    subtotal: 4300,
    tax_total: 344,
    grand_total: 4644,
    accounting_category: "Hardware",
    predicted_tax_category: "GGST",
    confidence_score: 0.82,
    ai_reasoning:
      `Sample extraction for "${filename}". General hardware supplies at the 8% ` +
      "GGST rate (no tourism indicators). The vendor TIN is not printed, so an " +
      "input-tax claim needs it confirmed.",
    field_confidence: { vendor_name: 0.9, grand_total: 0.88, predicted_tax_category: 0.8 },
  });
  e.validationFlags = deriveValidationFlags(e);
  return e;
}

/** Demo GGST (MIRA 205) filing calendar, mirroring the seeded Supabase org. */
const F0 = { sales8: 0, salesZero: 0, salesExempt: 0, salesOos: 0 };
const DEMO_FILINGS: GstFilingRow[] = [
  { id: "f-1", form: "MIRA_205_GGST", periodStart: "2026-03-01", periodEnd: "2026-03-31", dueDate: "2026-04-28", status: "FILED", ...F0, outputTax: 0, inputTax: 0, netPayable: 0 },
  { id: "f-2", form: "MIRA_205_GGST", periodStart: "2026-04-01", periodEnd: "2026-04-30", dueDate: "2026-05-28", status: "FILED", ...F0, outputTax: 0, inputTax: 0, netPayable: 0 },
  { id: "f-3", form: "MIRA_205_GGST", periodStart: "2026-05-01", periodEnd: "2026-05-31", dueDate: "2026-06-28", status: "FILED", ...F0, outputTax: 0, inputTax: 844.37, netPayable: -844.37 },
  { id: "f-4", form: "MIRA_205_GGST", periodStart: "2026-06-01", periodEnd: "2026-06-30", dueDate: "2026-07-28", status: "DUE_SOON", ...F0, outputTax: 0, inputTax: 338.7, netPayable: -338.7 },
  { id: "f-5", form: "MIRA_205_GGST", periodStart: "2026-07-01", periodEnd: "2026-07-31", dueDate: "2026-08-28", status: "UPCOMING", ...F0, sales8: 81, outputTax: 6, inputTax: 7280, netPayable: -7274 },
  { id: "f-6", form: "MIRA_205_GGST", periodStart: "2026-08-01", periodEnd: "2026-08-31", dueDate: "2026-09-28", status: "UPCOMING", ...F0, outputTax: 0, inputTax: 0, netPayable: 0 },
];

/** Demo TGST (MIRA 206) calendar — one tourism sale drives July's output tax. */
const DEMO_TGST_FILINGS: GstFilingRow[] = [
  { id: "t-3", form: "MIRA_206_TGST", periodStart: "2026-03-01", periodEnd: "2026-03-31", dueDate: "2026-04-28", status: "FILED", ...F0, outputTax: 0, inputTax: 0, netPayable: 0 },
  { id: "t-4", form: "MIRA_206_TGST", periodStart: "2026-04-01", periodEnd: "2026-04-30", dueDate: "2026-05-28", status: "FILED", ...F0, outputTax: 0, inputTax: 0, netPayable: 0 },
  { id: "t-5", form: "MIRA_206_TGST", periodStart: "2026-05-01", periodEnd: "2026-05-31", dueDate: "2026-06-28", status: "FILED", ...F0, outputTax: 0, inputTax: 0, netPayable: 0 },
  { id: "t-6", form: "MIRA_206_TGST", periodStart: "2026-06-01", periodEnd: "2026-06-30", dueDate: "2026-07-28", status: "DUE_SOON", ...F0, outputTax: 0, inputTax: 0, netPayable: 0 },
  { id: "t-7", form: "MIRA_206_TGST", periodStart: "2026-07-01", periodEnd: "2026-07-31", dueDate: "2026-08-28", status: "UPCOMING", ...F0, sales8: 3480, outputTax: 480, inputTax: 0, netPayable: 480 },
  { id: "t-8", form: "MIRA_206_TGST", periodStart: "2026-08-01", periodEnd: "2026-08-31", dueDate: "2026-09-28", status: "UPCOMING", ...F0, outputTax: 0, inputTax: 0, netPayable: 0 },
];

/** Demo purchase bills mirroring the seeded Supabase org (aging computed live). */
const DEMO_BILLS: (Omit<BillRow, "aging"> & { dueIso: string })[] = [
  { id: "bill-1", vendor: "Altura Pvt Ltd", tin: "1145053", invoice: "ALT/INV-000024", po: "PO-RDC-2026-003845", date: "05 Jul 2026", due: "20 Jul 2026", dueIso: "2026-07-20", cur: "MVR", subtotal: 91000, gst: 7280, total: 98280, cat: "Equipment", taxCat: "GGST", status: "AI_VERIFIED", rate: 8, line: "Concrete Mixer (50KG - 1 Bag)", qty: 1, unit: 91000 },
  { id: "bill-2", vendor: "Island Mark Hardware Pvt Ltd", tin: "—", invoice: "IMH-4471", po: "—", date: "11 May 2026", due: "26 May 2026", dueIso: "2026-05-26", cur: "MVR", subtotal: 4300, gst: 344, total: 4644, cat: "Hardware", taxCat: "GGST", status: "DRAFT", rate: 8, line: "Assorted fixings & tools", qty: 12, unit: 358.33 },
  { id: "bill-3", vendor: "Ives Private Limited", tin: "—", invoice: "IVS-2026-118", po: "—", date: "11 May 2026", due: "25 May 2026", dueIso: "2026-05-25", cur: "MVR", subtotal: 6039.58, gst: 483.17, total: 6522.75, cat: "Supplies", taxCat: "GGST", status: "AI_VERIFIED", rate: 8, line: "Packaging & consumables", qty: 1, unit: 6039.58 },
  { id: "bill-4", vendor: "Tree Top Health Pvt Ltd", tin: "—", invoice: "TTH-9930", po: "—", date: "05 Feb 2026", due: "20 Feb 2026", dueIso: "2026-02-20", cur: "MVR", subtotal: 5809, gst: 0, total: 5809, cat: "Health", taxCat: "EXEMPT", status: "AI_VERIFIED", rate: 0, line: "Staff medical services", qty: 1, unit: 5809 },
  { id: "bill-5", vendor: "Beaver Builders Private Limited", tin: "—", invoice: "BB-3382", po: "—", date: "14 Jun 2026", due: "29 Jun 2026", dueIso: "2026-06-29", cur: "MVR", subtotal: 4233.72, gst: 338.7, total: 4572.42, cat: "Construction", taxCat: "GGST", status: "DRAFT", rate: 8, line: "Site labour & materials", qty: 1, unit: 4233.72 },
  { id: "bill-6", vendor: "Island Choice LLP", tin: "—", invoice: "IC-7781", po: "—", date: "12 May 2026", due: "27 May 2026", dueIso: "2026-05-27", cur: "MVR", subtotal: 215, gst: 17.2, total: 232.2, cat: "F&B", taxCat: "GGST", status: "ACCOUNTANT_APPROVED", rate: 8, line: "Cafe supplies", qty: 1, unit: 215 },
];

/** Demo bank accounts + statement lines, mirroring the seeded Supabase org. */
const DEMO_BANK_ACCOUNTS = [
  { id: "ba-mvr", name: "Business Current", bankName: "Bank of Maldives", accountMasked: "•••• 4021", currency: "MVR", linked: true },
  { id: "ba-usd", name: "USD Settlement", bankName: "Bank of Maldives", accountMasked: "•••• 8837", currency: "USD", linked: false },
] as const;

const DEMO_BANK_TXNS: (Omit<BankTxnRow, "date" | "amount" | "accountName"> & { amt: number })[] = [
  { id: "bt-1", accountId: "ba-mvr", isoDate: "2026-07-12", type: "TRANSFER", reference: "FT26071240", counterparty: "Card Settlement", narrative: "POS card settlement — BML Merchant", direction: "CREDIT", amt: 27300.0, currency: "MVR", reconStatus: "SUGGESTED", matchedVendor: null },
  { id: "bt-2", accountId: "ba-mvr", isoDate: "2026-07-10", type: "TRANSFER", reference: "FT26071005", counterparty: "Payroll", narrative: "Staff salary — July", direction: "DEBIT", amt: 12000.0, currency: "MVR", reconStatus: "EXCLUDED", matchedVendor: null },
  { id: "bt-3", accountId: "ba-mvr", isoDate: "2026-07-06", type: "TRANSFER", reference: "FT26070619", counterparty: "Island Choice LLP", narrative: "Payment IC-7781", direction: "DEBIT", amt: 232.2, currency: "MVR", reconStatus: "MATCHED", matchedVendor: "Island Choice LLP" },
  { id: "bt-4", accountId: "ba-mvr", isoDate: "2026-07-02", type: "TRANSFER", reference: "FT26070211", counterparty: "MTCC", narrative: "Incoming transfer", direction: "CREDIT", amt: 18750.0, currency: "MVR", reconStatus: "UNMATCHED", matchedVendor: null },
  { id: "bt-5", accountId: "ba-mvr", isoDate: "2026-06-28", type: "TRANSFER", reference: "FT26062830", counterparty: "Beaver Builders", narrative: "Transfer", direction: "DEBIT", amt: 4572.42, currency: "MVR", reconStatus: "UNMATCHED", matchedVendor: null },
  { id: "bt-6", accountId: "ba-mvr", isoDate: "2026-06-22", type: "CHARGE", reference: "SC26062201", counterparty: "Bank of Maldives", narrative: "Monthly service charge", direction: "DEBIT", amt: 1250.0, currency: "MVR", reconStatus: "EXCLUDED", matchedVendor: null },
  { id: "bt-7", accountId: "ba-mvr", isoDate: "2026-06-18", type: "TRANSFER", reference: "FT26061808", counterparty: "Ives Private Limited", narrative: "Supplier payment", direction: "DEBIT", amt: 6522.75, currency: "MVR", reconStatus: "SUGGESTED", matchedVendor: "Ives Private Limited" },
  { id: "bt-8", accountId: "ba-mvr", isoDate: "2026-06-14", type: "TRANSFER", reference: "FT26061422", counterparty: "Card Settlement", narrative: "POS card settlement — BML Merchant", direction: "CREDIT", amt: 32500.0, currency: "MVR", reconStatus: "MATCHED", matchedVendor: null },
  { id: "bt-9", accountId: "ba-mvr", isoDate: "2026-06-09", type: "TRANSFER", reference: "FT26060917", counterparty: "Island Mark Hardware", narrative: "Transfer to IMH", direction: "DEBIT", amt: 4644.0, currency: "MVR", reconStatus: "SUGGESTED", matchedVendor: "Island Mark Hardware Pvt Ltd" },
  { id: "bt-10", accountId: "ba-mvr", isoDate: "2026-06-05", type: "TRANSFER", reference: "FT26060544", counterparty: "Altura Pvt Ltd", narrative: "Payment ALT/INV-000024", direction: "DEBIT", amt: 98280.0, currency: "MVR", reconStatus: "MATCHED", matchedVendor: "Altura Pvt Ltd" },
  { id: "bt-11", accountId: "ba-mvr", isoDate: "2026-06-03", type: "TRANSFER", reference: "FT26060312", counterparty: "Card Settlement", narrative: "POS card settlement — BML Merchant", direction: "CREDIT", amt: 45000.0, currency: "MVR", reconStatus: "MATCHED", matchedVendor: null },
  { id: "bt-12", accountId: "ba-usd", isoDate: "2026-07-08", type: "WIRE", reference: "TT26070801", counterparty: "Export Receipt", narrative: "Inbound settlement", direction: "CREDIT", amt: 3200.0, currency: "USD", reconStatus: "UNMATCHED", matchedVendor: null },
  { id: "bt-13", accountId: "ba-usd", isoDate: "2026-06-20", type: "WIRE", reference: "TT26062001", counterparty: "Overseas Supplier", narrative: "Import wire", direction: "DEBIT", amt: 1450.0, currency: "USD", reconStatus: "UNMATCHED", matchedVendor: null },
];

/** Closing balances mirroring the seeded running_balance of each account. */
const DEMO_BANK_BALANCES: Record<string, number> = { "ba-mvr": 246048.63, "ba-usd": 9750.0 };

/** A small starter chart of accounts, matching the seeded Supabase demo org. */
const STARTER_ACCOUNTS: AccountRow[] = [
  { code: "1000", name: "Cash on Hand", accountType: "ASSET" },
  { code: "1010", name: "Business Bank Account", accountType: "BANK" },
  { code: "1100", name: "Accounts Receivable", accountType: "ASSET" },
  { code: "1200", name: "Inventory", accountType: "ASSET" },
  { code: "2000", name: "Accounts Payable", accountType: "LIABILITY" },
  { code: "2100", name: "GST Payable", accountType: "TAX" },
  { code: "5000", name: "Cost of Goods Sold", accountType: "COGS" },
  { code: "6000", name: "Operating Expenses", accountType: "EXPENSE" },
  { code: "6100", name: "Bank Charges", accountType: "EXPENSE" },
  { code: "7000", name: "FX Gain/Loss", accountType: "FX" },
];

export class MemoryStore implements LedgerStore {
  readonly backend = "memory";
  readonly org = "";
  #idSeq = 0;
  readonly #accounts = new Map<string, AccountRow>();
  readonly #entries: EntryRow[] = [];
  readonly #sales: SaleRow[] = [];
  readonly #bills = DEMO_BILLS.map((b) => ({ ...b }));
  readonly #bankTxns = DEMO_BANK_TXNS.map((t) => ({ ...t }));
  readonly #documents: DocumentRow[] = [];
  readonly #rules: CategorizationRule[] = [];

  constructor(seed = true) {
    if (seed) {
      for (const a of STARTER_ACCOUNTS) this.#accounts.set(a.code, { ...a });
    }
  }

  async listAccounts(): Promise<AccountRow[]> {
    return [...this.#accounts.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

  async createAccount(account: AccountRow): Promise<AccountRow> {
    if (this.#accounts.has(account.code)) {
      throw new StoreError(`Account code "${account.code}" already exists`, 409);
    }
    const row: AccountRow = {
      id: `acct-${++this.#idSeq}`,
      code: account.code,
      name: account.name,
      accountType: account.accountType,
    };
    this.#accounts.set(row.code, row);
    return row;
  }

  async listEntries(): Promise<EntryRow[]> {
    return [...this.#entries];
  }

  async postEntry(entry: EntryInput): Promise<{ id: string }> {
    validateEntry(entry);
    for (const line of entry.lines) {
      if (!this.#accounts.has(line.accountCode)) {
        throw new StoreError(`Unknown account code "${line.accountCode}"`);
      }
    }
    const row: EntryRow = {
      id: `je-${++this.#idSeq}`,
      date: entry.date,
      memo: entry.memo,
      lines: entry.lines.map((l) => ({
        accountCode: l.accountCode,
        debit: l.debit ?? 0,
        credit: l.credit ?? 0,
        currency: "MVR",
      })),
    };
    this.#entries.push(row);
    return { id: row.id };
  }

  async trialBalance(): Promise<TrialBalanceRow[]> {
    const totals = new Map<string, { debit: number; credit: number }>();
    for (const entry of this.#entries) {
      for (const line of entry.lines) {
        const t = totals.get(line.accountCode) ?? { debit: 0, credit: 0 };
        t.debit += toMinor(line.debit);
        t.credit += toMinor(line.credit);
        totals.set(line.accountCode, t);
      }
    }
    return (await this.listAccounts()).map((a) => {
      const t = totals.get(a.code) ?? { debit: 0, credit: 0 };
      return {
        code: a.code,
        name: a.name,
        accountType: a.accountType,
        debit: t.debit / 100,
        credit: t.credit / 100,
        balance: (t.debit - t.credit) / 100,
      };
    });
  }

  async outOfBalanceBy(): Promise<number> {
    const rows = await this.trialBalance();
    const minor = rows.reduce((sum, r) => sum + toMinor(r.balance), 0);
    return minor / 100;
  }

  async recordSale(sale: SaleInput): Promise<{ id: string }> {
    const { lines, subtotal, taxTotal, grandTotal } = computeSale(sale);
    const row: SaleRow = {
      id: `sale-${++this.#idSeq}`,
      date: sale.date,
      currency: sale.currency ?? "MVR",
      status: "DRAFT",
      subtotal,
      taxTotal,
      grandTotal,
      lines,
    };
    this.#sales.push(row);
    return { id: row.id };
  }

  async listSales(): Promise<SaleRow[]> {
    return [...this.#sales];
  }

  async revenue(from: string, to: string): Promise<RevenueSummary> {
    const inRange = this.#sales.filter((s) => s.date >= from && s.date <= to);
    return {
      from,
      to,
      salesCount: inRange.length,
      subtotal: inRange.reduce((n, s) => n + toMinor(s.subtotal), 0) / 100,
      taxTotal: inRange.reduce((n, s) => n + toMinor(s.taxTotal), 0) / 100,
      grandTotal: inRange.reduce((n, s) => n + toMinor(s.grandTotal), 0) / 100,
    };
  }

  async listBills(): Promise<BillRow[]> {
    return this.#bills.map(({ dueIso, ...bill }) => ({
      ...bill,
      aging: agingBucket(dueIso),
    }));
  }

  async setBillStatus(id: string, status: string): Promise<{ id: string; status: string }> {
    const bill = this.#bills.find((b) => b.id === id);
    if (!bill) throw new StoreError(`Bill "${id}" not found`, 404);
    bill.status = status;
    return { id, status };
  }

  async verifyMember(): Promise<boolean> {
    return false; // no auth provider for the in-memory backend
  }

  async listGstFilings(): Promise<GstFilingRow[]> {
    return DEMO_FILINGS.map((f) => ({ ...f }));
  }

  async listTgstFilings(): Promise<GstFilingRow[]> {
    return DEMO_TGST_FILINGS.map((f) => ({ ...f }));
  }

  async taxpayer(): Promise<{ name: string; tin: string }> {
    return { name: "Kashikeyo Demo Co", tin: "" };
  }

  #settings: OrgSettings = {
    name: "Kashikeyo Demo Co",
    tin: "",
    sector: "GENERAL",
    industryCode: "",
    baseCurrency: "MVR",
    reportingCurrency: "MVR",
    timezone: "Indian/Maldives",
    gstRegistered: true,
    gstFilingFrequency: "MONTHLY",
    fiscalYearStartMonth: 1,
    greenTaxEnabled: false,
    greenTaxRateUsd: 12,
  };

  async orgSettings(): Promise<OrgSettings> {
    return { ...this.#settings };
  }

  async updateOrgSettings(patch: OrgSettingsPatch): Promise<OrgSettings> {
    const clean = normalizeSettingsPatch(patch);
    this.#settings = { ...this.#settings, ...clean };
    return { ...this.#settings };
  }

  async listMembers(): Promise<MemberRow[]> {
    return [
      { name: "", email: "owner@kashikeyo.local", role: "OWNER" },
      { name: "", email: "accountant@kashikeyo.local", role: "ACCOUNTANT" },
    ].map((m) => ({ ...m, ini: nameInitials(m.name, m.email) }));
  }

  async listItems(): Promise<ItemRow[]> {
    const demo = [
      ["MIX-01", "Concrete Mixer (50KG)", "unit", 3, 91000, 2],
      ["CEM-50", "Cement (50kg bag)", "bag", 120, 95, 40],
      ["RBR-12", "Steel Rebar 12mm", "length", 30, 180, 50],
      ["PVC-04", 'PVC Pipe 4"', "length", 8, 120, 20],
      ["WTR-500", "Bottled Water 500ml", "case", 60, 22, 24],
      ["FIX-AST", "Assorted fixings & tools", "set", 12, 358.33, 5],
      ["SND-M3", "Sand", "m3", 0, 450, 10],
      ["GRV-M3", "Gravel", "m3", 15, 520, 8],
    ] as const;
    return demo
      .map(([sku, name, unit, qty, cost, threshold]) => ({
        id: `item-${sku}`,
        sku,
        name,
        unit,
        qtyOnHand: qty,
        avgCost: cost,
        stockValue: Math.round(qty * cost * 100) / 100,
        threshold,
        status: itemStatus(qty, threshold),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async listBankAccounts(): Promise<BankAccountRow[]> {
    return DEMO_BANK_ACCOUNTS.map((a) => {
      const txns = this.#bankTxns.filter((t) => t.accountId === a.id);
      return {
        id: a.id,
        name: a.name,
        bankName: a.bankName,
        accountMasked: a.accountMasked,
        currency: a.currency,
        linkedAccount: a.linked,
        balance: DEMO_BANK_BALANCES[a.id] ?? 0,
        txnCount: txns.length,
        unreconciled: txns.filter((t) => ["UNMATCHED", "SUGGESTED"].includes(t.reconStatus)).length,
      };
    });
  }

  async listBankTransactions(): Promise<BankTxnRow[]> {
    const names = new Map(DEMO_BANK_ACCOUNTS.map((a) => [a.id, a.name]));
    return this.#bankTxns.map(({ amt, ...t }) => ({
      ...t,
      accountName: names.get(t.accountId) ?? "",
      date: formatBillDate(t.isoDate),
      amount: bankTxnSigned(t.direction, amt),
    }));
  }

  async setBankRecon(
    txnId: string,
    status: string,
    vendorId: string | null = null,
  ): Promise<{ id: string; reconStatus: string }> {
    assertReconStatus(status);
    const txn = this.#bankTxns.find((t) => t.id === txnId);
    if (!txn) throw new StoreError(`Bank transaction "${txnId}" not found`, 404);
    txn.reconStatus = status;
    if (status === "MATCHED") txn.matchedVendor = vendorId ?? txn.matchedVendor;
    else if (status === "UNMATCHED") txn.matchedVendor = null;
    return { id: txnId, reconStatus: status };
  }

  async importStatement(
    bankAccountId: string,
    source: string,
    lines: ImportLineInput[],
  ): Promise<ImportResult> {
    if (!(STATEMENT_SOURCES as readonly string[]).includes(source)) {
      throw new StoreError(`Unsupported statement source "${source}"`);
    }
    const acct = DEMO_BANK_ACCOUNTS.find((a) => a.id === bankAccountId);
    if (!acct) throw new StoreError(`Bank account "${bankAccountId}" not found`, 404);
    const clean = normalizeImportLines(lines);
    // Dedupe key mirrors the SQL content hash, scoped to the account.
    const keyOf = (ref: string, date: string, dir: string, amt: number, narr: string, cp: string) =>
      [ref, date, dir, amt, narr, cp].join("|");
    const seen = new Set(
      this.#bankTxns
        .filter((t) => t.accountId === bankAccountId)
        .map((t) => keyOf(t.reference ?? "", t.isoDate, t.direction, t.amt, t.narrative ?? "", t.counterparty ?? "")),
    );
    let imported = 0;
    let duplicates = 0;
    for (const l of clean) {
      const key = keyOf(l.reference ?? "", l.date, l.direction, l.amount, l.narrative ?? "", l.counterparty ?? "");
      if (seen.has(key)) {
        duplicates += 1;
        continue;
      }
      seen.add(key);
      this.#bankTxns.push({
        id: `imp-${++this.#idSeq}`,
        accountId: bankAccountId,
        isoDate: l.date,
        type: l.type ?? "",
        reference: l.reference ?? "",
        counterparty: l.counterparty ?? "",
        narrative: l.narrative ?? "",
        direction: l.direction,
        amt: l.amount,
        currency: acct.currency,
        reconStatus: "UNMATCHED",
        matchedVendor: null,
      });
      imported += 1;
    }
    return { importId: `import-${++this.#idSeq}`, imported, duplicates, total: clean.length };
  }

  async ingestDocument(upload: DocumentUpload): Promise<IngestResult> {
    const { bytes } = assertUpload(upload);
    const mimeType = mediaTypeFor(upload.contentType); // rejects unsupported types
    let extraction = cannedExtraction(upload.filename);
    // Phase 3: auto-apply a learned rule if one matches this document.
    const hit = matchRule(extraction, this.#rules);
    if (hit) {
      extraction = applyRuleToExtraction(extraction, hit.rule, hit.matchedOn);
      hit.rule.timesApplied += 1;
    }
    const doc: DocumentRow = {
      id: `doc-${++this.#idSeq}`,
      fileName: upload.filename,
      mimeType,
      byteSize: bytes,
      status: "EXTRACTED",
      captureSource: upload.captureSource ?? "MANUAL_UPLOAD",
      createdAt: new Date().toISOString(),
      model: `${DEFAULT_EXTRACTION_MODEL} (demo)`,
      extraction,
    };
    this.#documents.unshift(doc);
    return {
      documentId: doc.id,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      byteSize: doc.byteSize,
      status: doc.status,
      model: doc.model,
      duplicate: false,
      extraction,
      error: null,
    };
  }

  async listDocuments(): Promise<DocumentRow[]> {
    return this.#documents.map((d) => ({ ...d }));
  }

  async overrideExtraction(documentId: string, override: OverrideInput): Promise<OverrideResult> {
    const doc = this.#documents.find((d) => d.id === documentId);
    if (!doc || !doc.extraction) {
      throw new StoreError(`No extraction found for document "${documentId}"`, 404);
    }
    doc.extraction = applyOverrideToExtraction(doc.extraction, override);
    let rule: CategorizationRule | null = null;
    if (override.createRule !== false) {
      const input = buildRuleFromOverride(doc.extraction, override);
      if (input) rule = this.#upsertRule(input);
    }
    return { documentId, extraction: doc.extraction, rule };
  }

  #upsertRule(input: unknown): CategorizationRule {
    const r = normalizeRuleInput(input);
    // Replace an existing active rule with the same matcher, else create one.
    const existing = this.#rules.find(
      (x) =>
        x.isActive !== false &&
        x.matchVendorTin === r.matchVendorTin &&
        x.matchVendorPattern === r.matchVendorPattern &&
        x.matchKeyword === r.matchKeyword,
    );
    if (existing) {
      existing.setTaxCategory = r.setTaxCategory;
      existing.setAccountingCategory = r.setAccountingCategory;
      existing.note = r.note;
      existing.priority = r.priority;
      return existing;
    }
    const rule: CategorizationRule = {
      id: `rule-${++this.#idSeq}`,
      matchVendorTin: r.matchVendorTin,
      matchVendorPattern: r.matchVendorPattern,
      matchKeyword: r.matchKeyword,
      setTaxCategory: r.setTaxCategory,
      setAccountingCategory: r.setAccountingCategory,
      note: r.note,
      priority: r.priority,
      timesApplied: 0,
      source: "HUMAN_OVERRIDE",
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    this.#rules.push(rule);
    return rule;
  }

  async listRules(): Promise<CategorizationRule[]> {
    return this.#rules
      .filter((r) => r.isActive !== false)
      .sort((a, b) => a.priority - b.priority || String(a.createdAt).localeCompare(String(b.createdAt)))
      .map((r) => ({ ...r, label: ruleLabel(r) }));
  }

  async deleteRule(id: string): Promise<{ id: string }> {
    const rule = this.#rules.find((r) => r.id === id);
    if (!rule) throw new StoreError(`Rule "${id}" not found`, 404);
    rule.isActive = false;
    return { id };
  }

  async postDocumentToBank(
    documentId: string,
    bankAccountId: string | null = null,
  ): Promise<PostToBankResult> {
    const doc = this.#documents.find((d) => d.id === documentId);
    if (!doc || !doc.extraction) {
      throw new StoreError(`No extraction found for document "${documentId}"`, 404);
    }
    if (!isBankDocument(doc.extraction)) {
      throw new StoreError("This document isn't a bank or cash movement", 422);
    }
    const line = bankLineFromExtraction(doc.extraction);
    if (!line) throw new StoreError("The document has no amount to post to Banking", 422);

    const accounts = await this.listBankAccounts();
    const target =
      accounts.find((a) => a.id === bankAccountId) ??
      accounts.find((a) => a.currency === doc.extraction!.currency) ??
      accounts[0];
    if (!target) throw new StoreError("No bank account to post into", 422);

    const res = await this.importStatement(target.id, "PDF_UPLOAD", [line]);
    return {
      documentId,
      bankAccountId: target.id,
      bankAccountName: target.name,
      imported: res.imported,
      duplicates: res.duplicates,
    };
  }

  async mvrPerUsd(): Promise<number> {
    return 15.42; // MMA reference peg
  }

  async listVendors(): Promise<VendorRow[]> {
    const map = new Map<string, { tin: string; totalSpend: number; billCount: number; lastBillDate: string }>();
    for (const b of this.#bills) {
      const v = map.get(b.vendor) ?? { tin: b.tin, totalSpend: 0, billCount: 0, lastBillDate: b.date };
      v.totalSpend += b.total;
      v.billCount += 1;
      map.set(b.vendor, v);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].totalSpend - a[1].totalSpend)
      .map(([name, v], i) => ({
        id: `vendor-${i + 1}`,
        name,
        tin: v.tin,
        gstRegistered: true,
        currency: "MVR",
        billCount: v.billCount,
        totalSpend: v.totalSpend,
        lastBillDate: v.lastBillDate,
        ini: vendorInitials(name),
      }));
  }
}
