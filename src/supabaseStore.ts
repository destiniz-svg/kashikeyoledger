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
  agingBucket,
  formatBillDate,
  vendorInitials,
  type AccountRow,
  type BillRow,
  type EntryInput,
  type EntryRow,
  type LedgerStore,
  type RevenueSummary,
  type SaleInput,
  type SaleRow,
  type TrialBalanceRow,
  type VendorRow,
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

interface DbSale {
  id: string;
  transaction_date: string;
  currency: string;
  status: string;
  subtotal: string | number;
  tax_total: string | number;
  grand_total: string | number;
  transaction_line_items: {
    description: string;
    quantity: string | number;
    unit_price: string | number;
    line_subtotal: string | number;
    tax_category: string;
    tax_rate_percent: string | number;
    tax_amount: string | number;
    sort_order: number;
  }[];
}

interface DbRevenue {
  sales_count: string | number;
  subtotal: string | number;
  tax_total: string | number;
  grand_total: string | number;
}

interface DbBill {
  id: string;
  invoice_number: string | null;
  po_number: string | null;
  transaction_date: string;
  due_date: string | null;
  currency: string;
  subtotal: string | number;
  tax_total: string | number;
  grand_total: string | number;
  status: string;
  notes: string | null;
  vendors: { name: string; tin: string | null } | null;
  transaction_line_items: {
    tax_category: string;
    tax_rate_percent: string | number;
    description: string;
    quantity: string | number;
    unit_price: string | number;
    sort_order: number;
  }[];
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

  async recordSale(sale: SaleInput): Promise<{ id: string }> {
    const id = (await this.#request("/rest/v1/rpc/record_sale", {
      method: "POST",
      body: JSON.stringify({
        p_org: this.org,
        p_date: sale.date,
        p_currency: sale.currency ?? "MVR",
        p_notes: sale.notes ?? null,
        p_lines: sale.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity ?? 1,
          unit_price: l.unitPrice,
          tax_category: l.taxCategory ?? "OUT_OF_SCOPE",
          tax_rate_percent: l.taxRatePercent ?? 0,
        })),
      }),
    })) as string;
    return { id };
  }

  async listSales(): Promise<SaleRow[]> {
    const query =
      `/rest/v1/transactions?organization_id=eq.${this.org}&type=eq.POS_SALE` +
      `&select=id,transaction_date,currency,status,subtotal,tax_total,grand_total,` +
      `transaction_line_items(description,quantity,unit_price,line_subtotal,tax_category,tax_rate_percent,tax_amount,sort_order)` +
      `&order=transaction_date.desc`;
    const rows = (await this.#request(query)) as DbSale[];
    return rows.map((r) => ({
      id: r.id,
      date: r.transaction_date,
      currency: r.currency,
      status: r.status,
      subtotal: Number(r.subtotal),
      taxTotal: Number(r.tax_total),
      grandTotal: Number(r.grand_total),
      lines: [...r.transaction_line_items]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unit_price),
          lineSubtotal: Number(l.line_subtotal),
          taxCategory: l.tax_category,
          taxRatePercent: Number(l.tax_rate_percent),
          taxAmount: Number(l.tax_amount),
        })),
    }));
  }

  async revenue(from: string, to: string): Promise<RevenueSummary> {
    const rows = (await this.#request("/rest/v1/rpc/org_revenue", {
      method: "POST",
      body: JSON.stringify({ p_org: this.org, p_from: from, p_to: to }),
    })) as DbRevenue[];
    const r = rows[0] ?? { sales_count: 0, subtotal: 0, tax_total: 0, grand_total: 0 };
    return {
      from,
      to,
      salesCount: Number(r.sales_count),
      subtotal: Number(r.subtotal),
      taxTotal: Number(r.tax_total),
      grandTotal: Number(r.grand_total),
    };
  }

  async listBills(): Promise<BillRow[]> {
    const query =
      `/rest/v1/transactions?organization_id=eq.${this.org}` +
      `&type=in.(PURCHASE_BILL,EXPENSE)` +
      `&select=id,invoice_number,po_number,transaction_date,due_date,currency,subtotal,tax_total,grand_total,status,notes,` +
      `vendors(name,tin),transaction_line_items(tax_category,tax_rate_percent,description,quantity,unit_price,sort_order)` +
      `&order=transaction_date.desc`;
    const rows = (await this.#request(query)) as DbBill[];
    return rows.map((r) => {
      const line = [...r.transaction_line_items].sort((a, b) => a.sort_order - b.sort_order)[0];
      return {
        id: r.id,
        vendor: r.vendors?.name ?? "—",
        tin: r.vendors?.tin ?? "—",
        invoice: r.invoice_number ?? "—",
        po: r.po_number ?? "—",
        date: formatBillDate(r.transaction_date),
        due: formatBillDate(r.due_date),
        cur: r.currency,
        subtotal: Number(r.subtotal),
        gst: Number(r.tax_total),
        total: Number(r.grand_total),
        cat: r.notes ?? "",
        taxCat: line?.tax_category ?? "GGST",
        status: r.status,
        aging: agingBucket(r.due_date),
        rate: Number(line?.tax_rate_percent ?? 0),
        line: line?.description ?? "",
        qty: Number(line?.quantity ?? 1),
        unit: Number(line?.unit_price ?? 0),
      };
    });
  }

  async setBillStatus(id: string, status: string): Promise<{ id: string; status: string }> {
    const result = (await this.#request("/rest/v1/rpc/set_transaction_status", {
      method: "POST",
      body: JSON.stringify({ p_org: this.org, p_id: id, p_status: status }),
    })) as string;
    return { id, status: result };
  }

  async listVendors(): Promise<VendorRow[]> {
    const rows = (await this.#request("/rest/v1/rpc/org_vendors", {
      method: "POST",
      body: JSON.stringify({ p_org: this.org }),
    })) as {
      id: string;
      name: string;
      tin: string | null;
      gst_registered: boolean | null;
      currency: string;
      bill_count: string | number;
      total_spend: string | number;
      last_bill_date: string | null;
    }[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      tin: r.tin ?? "—",
      gstRegistered: Boolean(r.gst_registered),
      currency: r.currency,
      billCount: Number(r.bill_count),
      totalSpend: Number(r.total_spend),
      lastBillDate: formatBillDate(r.last_bill_date),
      ini: vendorInitials(r.name),
    }));
  }

  async verifyMember(token: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.#url}/auth/v1/user`, {
        headers: { apikey: this.#key, authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;
      const user = (await res.json()) as { id?: string };
      if (!user?.id) return false;
      const rows = (await this.#request(
        `/rest/v1/organization_members?organization_id=eq.${this.org}` +
          `&user_id=eq.${user.id}&select=role`,
      )) as unknown[];
      return Array.isArray(rows) && rows.length > 0;
    } catch {
      return false;
    }
  }
}
