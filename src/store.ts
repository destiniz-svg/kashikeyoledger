/**
 * Storage contract for the ledger API. Two implementations exist: an in-memory
 * store (for local dev and tests) and a Supabase-backed store that reads and
 * writes the real Kashikeyo Ledger schema (ledger_accounts / journal_entries /
 * journal_lines), scoped to one organization.
 *
 * Amounts are plain decimal numbers in major currency units (e.g. MVR), to
 * match the `numeric` debit/credit columns in the database.
 */

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
