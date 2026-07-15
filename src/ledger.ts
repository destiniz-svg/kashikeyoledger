import { assertMoney, type Money } from "./money.ts";
import {
  DEBIT_NORMAL,
  type Account,
  type AccountBalance,
  type AccountType,
  type JournalEntry,
  type Posting,
} from "./types.ts";

/** Raised when an operation would violate a ledger invariant. */
export class LedgerError extends Error {
  override name = "LedgerError";
}

let entryCounter = 0;

/**
 * An in-memory double-entry ledger. Accounts are registered up front; journal
 * entries are posted only if they balance and reference known accounts in a
 * single currency. Account balances are derived from the entry history, so the
 * ledger is always internally consistent.
 */
export class Ledger {
  readonly #accounts = new Map<string, Account>();
  readonly #entries: JournalEntry[] = [];

  /** Register a new account. Throws if the id is already in use. */
  addAccount(account: Account): Account {
    if (this.#accounts.has(account.id)) {
      throw new LedgerError(`Account "${account.id}" already exists`);
    }
    if (account.id.trim() === "") {
      throw new LedgerError("Account id must not be empty");
    }
    this.#accounts.set(account.id, account);
    return account;
  }

  getAccount(id: string): Account | undefined {
    return this.#accounts.get(id);
  }

  accounts(): readonly Account[] {
    return [...this.#accounts.values()];
  }

  entries(): readonly JournalEntry[] {
    return [...this.#entries];
  }

  /**
   * Post a journal entry after validating it. Pass an entry without an `id` and
   * one will be generated. Returns the stored entry.
   */
  post(entry: Omit<JournalEntry, "id"> & { id?: string }): JournalEntry {
    const stored: JournalEntry = {
      id: entry.id ?? `je-${++entryCounter}`,
      date: entry.date,
      description: entry.description,
      postings: entry.postings,
    };
    this.#validate(stored);
    this.#entries.push(stored);
    return stored;
  }

  #validate(entry: JournalEntry): void {
    if (entry.postings.length < 2) {
      throw new LedgerError(
        `Entry "${entry.id}" must have at least two postings, got ${entry.postings.length}`,
      );
    }

    let debits = 0;
    let credits = 0;
    let currency: string | undefined;

    for (const p of entry.postings) {
      const account = this.#accounts.get(p.accountId);
      if (!account) {
        throw new LedgerError(
          `Entry "${entry.id}" references unknown account "${p.accountId}"`,
        );
      }
      if (currency === undefined) {
        currency = account.currency;
      } else if (account.currency !== currency) {
        throw new LedgerError(
          `Entry "${entry.id}" mixes currencies (${currency} and ${account.currency})`,
        );
      }
      assertMoney(p.amount);
      if (p.amount <= 0) {
        throw new LedgerError(
          `Posting to "${p.accountId}" must be a positive amount, got ${p.amount}`,
        );
      }
      if (p.direction === "debit") debits += p.amount;
      else credits += p.amount;
    }

    if (debits !== credits) {
      throw new LedgerError(
        `Entry "${entry.id}" does not balance: debits ${debits} !== credits ${credits}`,
      );
    }
  }

  /** The signed balance of one account, in its normal direction. */
  balanceOf(accountId: string): Money {
    const account = this.#accounts.get(accountId);
    if (!account) {
      throw new LedgerError(`Unknown account "${accountId}"`);
    }
    const debitNormal = DEBIT_NORMAL.has(account.type);
    let balance = 0;
    for (const entry of this.#entries) {
      for (const p of entry.postings) {
        if (p.accountId !== accountId) continue;
        const isDebit = p.direction === "debit";
        // A debit increases a debit-normal account and decreases a
        // credit-normal one; credits do the reverse.
        balance += isDebit === debitNormal ? p.amount : -p.amount;
      }
    }
    return balance;
  }

  /** A snapshot balance for every account. */
  trialBalance(): readonly AccountBalance[] {
    return this.accounts().map((a) => ({
      accountId: a.id,
      name: a.name,
      type: a.type,
      balance: this.balanceOf(a.id),
    }));
  }

  /**
   * Verify the accounting equation across all debit-normal vs credit-normal
   * accounts. In a consistent ledger the two sides are equal; returns the
   * (signed) difference, which is `0` when the books balance.
   */
  outOfBalanceBy(): Money {
    let debitSide = 0;
    let creditSide = 0;
    for (const a of this.accounts()) {
      const raw = this.#rawBalance(a.id);
      if (raw >= 0) debitSide += raw;
      else creditSide += -raw;
    }
    return debitSide - creditSide;
  }

  /** Balance expressed on the debit axis (debits positive, credits negative). */
  #rawBalance(accountId: string): Money {
    let balance = 0;
    for (const entry of this.#entries) {
      for (const p of entry.postings) {
        if (p.accountId !== accountId) continue;
        balance += p.direction === "debit" ? p.amount : -p.amount;
      }
    }
    return balance;
  }
}

/** Convenience helper to build a posting. */
export function debit(accountId: string, amount: Money): Posting {
  return { accountId, amount, direction: "debit" };
}

/** Convenience helper to build a posting. */
export function credit(accountId: string, amount: Money): Posting {
  return { accountId, amount, direction: "credit" };
}

/** Convenience helper to build an account. */
export function account(
  id: string,
  name: string,
  type: AccountType,
  currency = "USD",
): Account {
  return { id, name, type, currency };
}
