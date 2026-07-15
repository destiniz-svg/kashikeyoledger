/**
 * In-memory implementation of LedgerStore for local development and tests.
 * Mirrors the real schema's shape (accounts by code, numeric debit/credit,
 * balance validation) but keeps everything in process. Data resets on restart.
 */
import {
  StoreError,
  agingBucket,
  bankTxnSigned,
  computeSale,
  formatBillDate,
  toMinor,
  validateEntry,
  vendorInitials,
  type AccountRow,
  type BankAccountRow,
  type BankTxnRow,
  type BillRow,
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

  async taxpayer(): Promise<{ name: string; tin: string }> {
    return { name: "Kashikeyo Demo Co", tin: "" };
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
      const txns = DEMO_BANK_TXNS.filter((t) => t.accountId === a.id);
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
    return DEMO_BANK_TXNS.map(({ amt, ...t }) => ({
      ...t,
      accountName: names.get(t.accountId) ?? "",
      date: formatBillDate(t.isoDate),
      amount: bankTxnSigned(t.direction, amt),
    }));
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
