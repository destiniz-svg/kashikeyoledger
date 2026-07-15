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
  assertReconStatus,
  bankTxnSigned,
  formatBillDate,
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
  readonly #authCache = new Map<string, number>();

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

  async listItems(): Promise<ItemRow[]> {
    const query =
      `/rest/v1/items?organization_id=eq.${this.org}&is_active=eq.true` +
      `&select=id,sku,name,unit_of_measure,quantity_on_hand,weighted_avg_cost,low_stock_threshold` +
      `&order=name`;
    const rows = (await this.#request(query)) as {
      id: string;
      sku: string;
      name: string;
      unit_of_measure: string;
      quantity_on_hand: string | number;
      weighted_avg_cost: string | number;
      low_stock_threshold: string | number | null;
    }[];
    return rows.map((r) => {
      const qty = Number(r.quantity_on_hand);
      const cost = Number(r.weighted_avg_cost);
      const threshold = r.low_stock_threshold == null ? null : Number(r.low_stock_threshold);
      return {
        id: r.id,
        sku: r.sku,
        name: r.name,
        unit: r.unit_of_measure,
        qtyOnHand: qty,
        avgCost: cost,
        stockValue: Math.round(qty * cost * 100) / 100,
        threshold,
        status: itemStatus(qty, threshold),
      };
    });
  }

  async listBankAccounts(): Promise<BankAccountRow[]> {
    const query =
      `/rest/v1/bank_accounts?organization_id=eq.${this.org}&is_active=eq.true` +
      `&select=id,name,bank_name,account_number_masked,currency,ledger_account_id,` +
      `bank_transactions(direction,amount,running_balance,txn_date,recon_status)` +
      `&order=name`;
    const rows = (await this.#request(query)) as {
      id: string;
      name: string;
      bank_name: string;
      account_number_masked: string | null;
      currency: string;
      ledger_account_id: string | null;
      bank_transactions: {
        direction: string;
        amount: string | number;
        running_balance: string | number | null;
        txn_date: string;
        recon_status: string;
      }[];
    }[];
    return rows.map((r) => {
      const txns = [...r.bank_transactions].sort((a, b) => a.txn_date.localeCompare(b.txn_date));
      const last = txns.at(-1);
      // Prefer the latest statement running balance; else net the signed lines.
      const balance =
        last?.running_balance != null
          ? Number(last.running_balance)
          : txns.reduce((s, t) => s + bankTxnSigned(t.direction, Number(t.amount)), 0);
      return {
        id: r.id,
        name: r.name,
        bankName: r.bank_name,
        accountMasked: r.account_number_masked ?? "",
        currency: r.currency,
        linkedAccount: r.ledger_account_id != null,
        balance: Math.round(balance * 100) / 100,
        txnCount: txns.length,
        unreconciled: txns.filter((t) => ["UNMATCHED", "SUGGESTED"].includes(t.recon_status)).length,
      };
    });
  }

  async listBankTransactions(): Promise<BankTxnRow[]> {
    const query =
      `/rest/v1/bank_transactions?organization_id=eq.${this.org}` +
      `&select=id,bank_account_id,txn_date,txn_type,bank_reference,counterparty,narrative,` +
      `direction,amount,currency,recon_status,bank_accounts(name),vendors:matched_vendor_id(name)` +
      `&order=txn_date.desc`;
    const rows = (await this.#request(query)) as {
      id: string;
      bank_account_id: string;
      txn_date: string;
      txn_type: string | null;
      bank_reference: string | null;
      counterparty: string | null;
      narrative: string | null;
      direction: string;
      amount: string | number;
      currency: string;
      recon_status: string;
      bank_accounts: { name: string } | null;
      vendors: { name: string } | null;
    }[];
    return rows.map((r) => ({
      id: r.id,
      accountId: r.bank_account_id,
      accountName: r.bank_accounts?.name ?? "",
      date: formatBillDate(r.txn_date),
      isoDate: r.txn_date,
      type: r.txn_type ?? "",
      reference: r.bank_reference ?? "",
      counterparty: r.counterparty ?? "",
      narrative: r.narrative ?? "",
      direction: r.direction,
      amount: bankTxnSigned(r.direction, Number(r.amount)),
      currency: r.currency,
      reconStatus: r.recon_status,
      matchedVendor: r.vendors?.name ?? null,
    }));
  }

  async setBankRecon(
    txnId: string,
    status: string,
    vendorId: string | null = null,
  ): Promise<{ id: string; reconStatus: string }> {
    assertReconStatus(status);
    const result = (await this.#request("/rest/v1/rpc/set_bank_recon", {
      method: "POST",
      body: JSON.stringify({
        p_org: this.org,
        p_txn: txnId,
        p_status: status,
        p_vendor: vendorId,
      }),
    })) as string;
    return { id: txnId, reconStatus: result };
  }

  async listGstFilings(): Promise<GstFilingRow[]> {
    const rows = (await this.#request("/rest/v1/rpc/org_gst_filings", {
      method: "POST",
      body: JSON.stringify({ p_org: this.org }),
    })) as {
      id: string;
      form: string;
      period_start: string;
      period_end: string;
      due_date: string;
      status: string;
      sales_8: string | number;
      sales_zero: string | number;
      sales_exempt: string | number;
      sales_oos: string | number;
      output_tax: string | number;
      input_tax: string | number;
      net_payable: string | number;
    }[];
    return rows.map((r) => ({
      id: r.id,
      form: r.form,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      dueDate: r.due_date,
      status: r.status,
      sales8: Number(r.sales_8),
      salesZero: Number(r.sales_zero),
      salesExempt: Number(r.sales_exempt),
      salesOos: Number(r.sales_oos),
      outputTax: Number(r.output_tax),
      inputTax: Number(r.input_tax),
      netPayable: Number(r.net_payable),
    }));
  }

  async taxpayer(): Promise<{ name: string; tin: string }> {
    const rows = (await this.#request(
      `/rest/v1/organizations?id=eq.${this.org}&select=name,tin`,
    )) as { name: string; tin: string | null }[];
    const org = rows[0];
    return { name: org?.name ?? "", tin: org?.tin ?? "" };
  }

  async verifyMember(token: string): Promise<boolean> {
    const cachedExp = this.#authCache.get(token);
    if (cachedExp && cachedExp > Date.now()) return true;
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
      const ok = Array.isArray(rows) && rows.length > 0;
      if (ok) this.#authCache.set(token, Date.now() + 60_000); // cache successes for 60s
      return ok;
    } catch {
      return false;
    }
  }
}
