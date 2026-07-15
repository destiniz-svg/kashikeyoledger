/**
 * In-memory implementation of LedgerStore for local development and tests.
 * Mirrors the real schema's shape (accounts by code, numeric debit/credit,
 * balance validation) but keeps everything in process. Data resets on restart.
 */
import {
  StoreError,
  toMinor,
  validateEntry,
  type AccountRow,
  type EntryInput,
  type EntryRow,
  type LedgerStore,
  type TrialBalanceRow,
} from "./store.ts";

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
}
