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
