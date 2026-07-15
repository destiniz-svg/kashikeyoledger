/**
 * In-memory implementation of LedgerStore for local development and tests.
 * Mirrors the real schema's shape (accounts by code, numeric debit/credit,
 * balance validation) but keeps everything in process. Data resets on restart.
 */
import {
  StoreError,
  agingBucket,
  computeSale,
  toMinor,
  validateEntry,
  type AccountRow,
  type BillRow,
  type EntryInput,
  type EntryRow,
  type LedgerStore,
  type RevenueSummary,
  type SaleInput,
  type SaleRow,
  type TrialBalanceRow,
} from "./store.ts";

/** Demo purchase bills mirroring the seeded Supabase org (aging computed live). */
const DEMO_BILLS: (Omit<BillRow, "aging"> & { dueIso: string })[] = [
  { id: "bill-1", vendor: "Altura Pvt Ltd", tin: "1145053", invoice: "ALT/INV-000024", po: "PO-RDC-2026-003845", date: "05 Jul 2026", due: "20 Jul 2026", dueIso: "2026-07-20", cur: "MVR", subtotal: 91000, gst: 7280, total: 98280, cat: "Equipment", taxCat: "GGST", status: "AI_VERIFIED", rate: 8, line: "Concrete Mixer (50KG - 1 Bag)", qty: 1, unit: 91000 },
  { id: "bill-2", vendor: "Island Mark Hardware Pvt Ltd", tin: "—", invoice: "IMH-4471", po: "—", date: "11 May 2026", due: "26 May 2026", dueIso: "2026-05-26", cur: "MVR", subtotal: 4300, gst: 344, total: 4644, cat: "Hardware", taxCat: "GGST", status: "DRAFT", rate: 8, line: "Assorted fixings & tools", qty: 12, unit: 358.33 },
  { id: "bill-3", vendor: "Ives Private Limited", tin: "—", invoice: "IVS-2026-118", po: "—", date: "11 May 2026", due: "25 May 2026", dueIso: "2026-05-25", cur: "MVR", subtotal: 6039.58, gst: 483.17, total: 6522.75, cat: "Supplies", taxCat: "GGST", status: "AI_VERIFIED", rate: 8, line: "Packaging & consumables", qty: 1, unit: 6039.58 },
  { id: "bill-4", vendor: "Tree Top Health Pvt Ltd", tin: "—", invoice: "TTH-9930", po: "—", date: "05 Feb 2026", due: "20 Feb 2026", dueIso: "2026-02-20", cur: "MVR", subtotal: 5809, gst: 0, total: 5809, cat: "Health", taxCat: "EXEMPT", status: "AI_VERIFIED", rate: 0, line: "Staff medical services", qty: 1, unit: 5809 },
  { id: "bill-5", vendor: "Beaver Builders Private Limited", tin: "—", invoice: "BB-3382", po: "—", date: "14 Jun 2026", due: "29 Jun 2026", dueIso: "2026-06-29", cur: "MVR", subtotal: 4233.72, gst: 338.7, total: 4572.42, cat: "Construction", taxCat: "GGST", status: "DRAFT", rate: 8, line: "Site labour & materials", qty: 1, unit: 4233.72 },
  { id: "bill-6", vendor: "Island Choice LLP", tin: "—", invoice: "IC-7781", po: "—", date: "12 May 2026", due: "27 May 2026", dueIso: "2026-05-27", cur: "MVR", subtotal: 215, gst: 17.2, total: 232.2, cat: "F&B", taxCat: "GGST", status: "ACCOUNTANT_APPROVED", rate: 8, line: "Cafe supplies", qty: 1, unit: 215 },
];

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
}
