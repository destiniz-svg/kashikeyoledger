import type { Money } from "./money.ts";

/**
 * The five fundamental account categories in double-entry accounting.
 * Assets and expenses increase on the debit side; liabilities, equity, and
 * income increase on the credit side.
 */
export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

/** Accounts whose balance naturally increases with debits. */
export const DEBIT_NORMAL: ReadonlySet<AccountType> = new Set<AccountType>([
  "asset",
  "expense",
]);

export interface Account {
  readonly id: string;
  readonly name: string;
  readonly type: AccountType;
  /** ISO 4217 currency code, e.g. "USD". */
  readonly currency: string;
}

/** One side of a journal entry: money debited or credited to an account. */
export interface Posting {
  readonly accountId: string;
  /** Amount in minor units. Always positive; direction carries the sign. */
  readonly amount: Money;
  readonly direction: "debit" | "credit";
}

/**
 * A balanced journal entry. The sum of debit amounts must equal the sum of
 * credit amounts across every posting.
 */
export interface JournalEntry {
  readonly id: string;
  /** ISO-8601 date string, e.g. "2026-07-15". */
  readonly date: string;
  readonly description: string;
  readonly postings: readonly Posting[];
}

/** A computed balance for a single account. */
export interface AccountBalance {
  readonly accountId: string;
  readonly name: string;
  readonly type: AccountType;
  /**
   * The account balance in minor units, expressed in the account's normal
   * direction: positive means a normal balance (debit balance for
   * debit-normal accounts, credit balance for credit-normal accounts).
   */
  readonly balance: Money;
}
