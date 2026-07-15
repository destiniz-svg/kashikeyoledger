/**
 * Supabase-backed LedgerStore. Reads and writes the real schema via PostgREST,
 * and posts entries through the `post_journal_entry` SQL function so the insert
 * is atomic and balance-validated in the database. All access is scoped to a
 * single organization id.
 *
 * Authenticates with a Supabase key (the service-role key in production, so it
 * can bypass RLS as a trusted backend). The key is read from the environment —
 * never hard-coded.
 */
import {
  StoreError,
  type AccountRow,
  type EntryInput,
  type EntryRow,
  type LedgerStore,
  type TrialBalanceRow,
} from "./store.ts";

export interface SupabaseConfig {
  url: string;
  key: string;
  org: string;
}

interface DbAccount {
  id: string;
  code: string;
  name: string;
  account_type: string;
}

interface DbEntry {
  id: string;
  entry_date: string;
  memo: string | null;
  journal_lines: {
    ledger_account_id: string;
    debit: string | number;
    credit: string | number;
    currency: string;
  }[];
}

interface DbTrialBalanceRow {
  code: string;
  name: string;
  account_type: string;
  debit: string | number;
  credit: string | number;
  balance: string | number;
}

export class SupabaseStore implements LedgerStore {
  readonly backend = "supabase";
  readonly org: string;
  readonly #url: string;
  readonly #key: string;

  constructor(config: SupabaseConfig) {
    this.#url = config.url.replace(/\/+$/, "");
    this.#key = config.key;
    this.org = config.org;
  }

  async #request(path: string, init: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${this.#url}${path}`, {
      ...init,
      headers: {
        apikey: this.#key,
        authorization: `Bearer ${this.#key}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!res.ok) {
      const message =
        body && typeof body === "object" && "message" in body
          ? String((body as { message: unknown }).message)
          : `Supabase request failed (${res.status})`;
      // PostgREST surfaces our RAISE EXCEPTION text on 400; treat as 422.
      throw new StoreError(message, res.status === 400 ? 422 : res.status);
    }
    return body;
  }

  async listAccounts(): Promise<AccountRow[]> {
    const query =
      `/rest/v1/ledger_accounts?organization_id=eq.${this.org}` +
      `&select=id,code,name,account_type&order=code`;
    const rows = (await this.#request(query)) as DbAccount[];
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      accountType: r.account_type,
    }));
  }

  async createAccount(account: AccountRow): Promise<AccountRow> {
    const rows = (await this.#request("/rest/v1/ledger_accounts", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        organization_id: this.org,
        code: account.code,
        name: account.name,
        account_type: account.accountType,
      }),
    })) as DbAccount[];
    const created = rows[0];
    if (!created) throw new StoreError("Account was not created", 500);
    return {
      id: created.id,
      code: created.code,
      name: created.name,
      accountType: created.account_type,
    };
  }

  async listEntries(): Promise<EntryRow[]> {
    const query =
      `/rest/v1/journal_entries?organization_id=eq.${this.org}` +
      `&select=id,entry_date,memo,journal_lines(ledger_account_id,debit,credit,currency)` +
      `&order=entry_date.desc`;
    const rows = (await this.#request(query)) as DbEntry[];
    return rows.map((r) => ({
      id: r.id,
      date: r.entry_date,
      memo: r.memo ?? "",
      lines: r.journal_lines.map((l) => ({
        accountCode: l.ledger_account_id,
        debit: Number(l.debit),
        credit: Number(l.credit),
        currency: l.currency,
      })),
    }));
  }

  async postEntry(entry: EntryInput): Promise<{ id: string }> {
    const id = (await this.#request("/rest/v1/rpc/post_journal_entry", {
      method: "POST",
      body: JSON.stringify({
        p_org: this.org,
        p_date: entry.date,
        p_memo: entry.memo,
        p_lines: entry.lines.map((l) => ({
          account_code: l.accountCode,
          debit: l.debit ?? 0,
          credit: l.credit ?? 0,
        })),
      }),
    })) as string;
    return { id };
  }

  async trialBalance(): Promise<TrialBalanceRow[]> {
    const rows = (await this.#request("/rest/v1/rpc/org_trial_balance", {
      method: "POST",
      body: JSON.stringify({ p_org: this.org }),
    })) as DbTrialBalanceRow[];
    return rows.map((r) => ({
      code: r.code,
      name: r.name,
      accountType: r.account_type,
      debit: Number(r.debit),
      credit: Number(r.credit),
      balance: Number(r.balance),
    }));
  }

  async outOfBalanceBy(): Promise<number> {
    const rows = await this.trialBalance();
    const minor = rows.reduce((sum, r) => sum + Math.round(r.balance * 100), 0);
    return minor / 100;
  }
}
