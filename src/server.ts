/**
 * HTTP API for the Kashikeyo Ledger, backed by a LedgerStore. In production the
 * store is Supabase (the real schema, scoped to one organization); with no
 * Supabase env vars it falls back to an in-memory store.
 *
 * Listens on `process.env.PORT` (Railway sets this), defaulting to 3000.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { authorizeRead, authorizeWrite, extractApiKey } from "./auth.ts";
import { createStore } from "./createStore.ts";
import { StoreError, type EntryInput, type SaleInput } from "./store.ts";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = "0.0.0.0";
const API_KEY = process.env.KASHIKEYO_API_KEY;
const READ_API_KEY = process.env.KASHIKEYO_READ_API_KEY;
const store = createStore();

/**
 * Data reads (not /health or /) require a valid read/write key OR a logged-in
 * organization member's token — so a signed-in browser user can read even when
 * no read key is configured.
 */
async function readGuard(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const auth = authorizeRead(req.headers, { writeKey: API_KEY, readKey: READ_API_KEY });
  if (auth.ok) return true;
  const presented = extractApiKey(req.headers);
  if (presented && (await store.verifyMember(presented))) return true;
  send(res, auth.status, { error: auth.message });
  return false;
}

/**
 * Writes are authorized by either the full API key (server-to-server) or a
 * Supabase access token from a logged-in organization member (browser users).
 */
async function writeGuard(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const keyAuth = authorizeWrite(req.headers, API_KEY);
  if (keyAuth.ok) return true;
  const presented = extractApiKey(req.headers);
  if (presented && presented !== API_KEY && (await store.verifyMember(presented))) {
    return true;
  }
  send(res, keyAuth.status, { error: keyAuth.message });
  return false;
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, x-api-key, content-type",
  "access-control-max-age": "86400",
};

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    ...CORS_HEADERS,
  });
  res.end(payload);
}

/** First and last calendar day (UTC) of the month containing `d`. */
function monthRange(d: Date): { from: string; to: string } {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const iso = (dt: Date) => dt.toISOString().slice(0, 10);
  return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) };
}

const DASH_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COMPANY_SUFFIX = new Set(["pvt", "ltd", "llp", "limited", "private", "inc", "co", "company"]);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Two-letter initials for a vendor avatar, ignoring company suffixes. */
function initials(name: string): string {
  const words = name
    .split(/\s+/)
    .filter((w) => !COMPANY_SUFFIX.has(w.toLowerCase().replace(/[^a-z]/gi, "")));
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? name).slice(0, 2).toUpperCase();
}

const TAX_LABEL: Record<string, string> = {
  GGST: "GGST 8%",
  TGST: "TGST 17%",
  ZERO_RATED: "Zero-rated",
  EXEMPT: "Exempt · Sec 20",
  OUT_OF_SCOPE: "Out of scope",
};

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Request body too large");
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (raw === "") return {};
  return JSON.parse(raw);
}

const server = createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;

  try {
    // CORS preflight — respond before anything else.
    if (method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      return res.end();
    }

    // Writes require the API key or a logged-in member's token; reads are open.
    const isWrite = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
    if (isWrite && !(await writeGuard(req, res))) return;

    if (method === "GET" && path === "/health") {
      return send(res, 200, { status: "ok", backend: store.backend });
    }

    if (method === "GET" && path === "/") {
      return send(res, 200, {
        service: "kashikeyo-ledger",
        status: "ok",
        backend: store.backend,
        organization: store.org || null,
        writeAuth: API_KEY ? "required (X-API-Key or Bearer)" : "not configured",
        readAuth: API_KEY || READ_API_KEY ? "required (X-API-Key or Bearer)" : "open",
        endpoints: [
          "GET /health",
          "GET /accounts  [read]",
          "POST /accounts { code, name, accountType }  [write]",
          "GET /entries  [read]",
          "POST /entries { date, memo, lines: [{ accountCode, debit?, credit? }] }  [write]",
          "GET /trial-balance  [read]",
          "GET /bills  [read]",
          "GET /vendors  [read]",
          "GET /tax-filing  [read]",
          "GET /reports  [read]",
          "POST /bills/:id/approve  [write]",
          "POST /bills/:id/reject  [write]",
          "GET /sales  [read]",
          "POST /sales { date, currency?, notes?, lines: [{ description, quantity?, unitPrice, taxCategory?, taxRatePercent? }] }  [write]",
          "GET /revenue?from=YYYY-MM-DD&to=YYYY-MM-DD  [read]",
        ],
        outOfBalanceBy: await store.outOfBalanceBy(),
      });
    }

    if (method === "GET" && path === "/accounts") {
      if (!(await readGuard(req, res))) return;
      return send(res, 200, await store.listAccounts());
    }

    if (method === "POST" && path === "/accounts") {
      const body = (await readJson(req)) as {
        code?: string;
        name?: string;
        accountType?: string;
      };
      if (!body.code || !body.name || !body.accountType) {
        return send(res, 400, { error: "code, name and accountType are required" });
      }
      const created = await store.createAccount({
        code: body.code,
        name: body.name,
        accountType: body.accountType,
      });
      return send(res, 201, created);
    }

    if (method === "GET" && path === "/entries") {
      if (!(await readGuard(req, res))) return;
      return send(res, 200, await store.listEntries());
    }

    if (method === "POST" && path === "/entries") {
      const body = (await readJson(req)) as Partial<EntryInput>;
      if (!body.date || !body.memo || !Array.isArray(body.lines)) {
        return send(res, 400, { error: "date, memo and lines[] are required" });
      }
      const result = await store.postEntry({
        date: body.date,
        memo: body.memo,
        lines: body.lines,
      });
      return send(res, 201, result);
    }

    if (method === "GET" && path === "/trial-balance") {
      if (!(await readGuard(req, res))) return;
      const rows = await store.trialBalance();
      return send(res, 200, { rows, outOfBalanceBy: await store.outOfBalanceBy() });
    }

    if (method === "GET" && path === "/dashboard") {
      if (!(await readGuard(req, res))) return;
      const tb = await store.trialBalance();
      const sumBy = (types: string[]) =>
        tb.filter((r) => types.includes(r.accountType)).reduce((s, r) => s + r.balance, 0);
      // ASSET/BANK/EXPENSE/COGS are debit-normal (+balance); LIABILITY/TAX are
      // credit-normal, so their "owed" amount is the negated net balance.
      const { from, to } = monthRange(new Date());
      const revenue = await store.revenue(from, to);
      const spendByAccount = tb
        .filter((r) => ["EXPENSE", "COGS"].includes(r.accountType) && r.balance !== 0)
        .map((r) => ({ code: r.code, name: r.name, amount: r.balance }))
        .sort((a, b) => b.amount - a.amount);

      // Purchase-side breakdowns computed from bills.
      const bills = await store.listBills();
      const group = <K extends string>(keyFn: (b: (typeof bills)[number]) => K) => {
        const m = new Map<K, { amt: number; n: number }>();
        for (const b of bills) {
          const k = keyFn(b);
          const cur = m.get(k) ?? { amt: 0, n: 0 };
          cur.amt += b.total;
          cur.n += 1;
          m.set(k, cur);
        }
        return m;
      };
      const spendByCategory = [...group((b) => b.cat || "Uncategorised")]
        .map(([name, v]) => ({ name, n: v.n, amt: round2(v.amt) }))
        .sort((a, b) => b.amt - a.amt);
      const spendByVendor = [...group((b) => b.vendor)]
        .map(([name, v]) => ({ name, n: v.n, amt: round2(v.amt), ini: initials(name) }))
        .sort((a, b) => b.amt - a.amt);
      const spendByTax = [...group((b) => b.taxCat)]
        .map(([k, v]) => ({ name: TAX_LABEL[k] ?? k, n: v.n, amt: round2(v.amt), claim: k !== "EXEMPT" }))
        .sort((a, b) => b.amt - a.amt);

      // Monthly spend trend, ordered chronologically.
      const trend = new Map<string, { order: number; val: number }>();
      for (const b of bills) {
        const [, mon, yr] = b.date.split(" ");
        const idx = DASH_MONTHS.indexOf(mon);
        if (idx < 0) continue;
        const key = `${mon} ${yr}`;
        const cur = trend.get(key) ?? { order: Number(yr) * 12 + idx, val: 0 };
        cur.val += b.total;
        trend.set(key, cur);
      }
      const spendTrend = [...trend]
        .map(([label, v]) => ({ m: label.split(" ")[0], val: round2(v.val), order: v.order }))
        .sort((a, b) => a.order - b.order)
        .map(({ m, val }) => ({ m, val }));

      const totalSpend = round2(bills.reduce((s, b) => s + b.total, 0));
      const largest = bills.reduce(
        (max, b) => (b.total > max.amt ? { vendor: b.vendor, amt: b.total, date: b.date } : max),
        { vendor: "", amt: 0, date: "" },
      );
      const pendingApprovals = bills.filter((b) => ["DRAFT", "AI_VERIFIED"].includes(b.status)).length;
      const claimableInputTax = round2(
        bills.filter((b) => b.taxCat !== "EXEMPT").reduce((s, b) => s + b.gst, 0),
      );

      return send(res, 200, {
        organization: store.org || null,
        currency: "MVR",
        accountsPayable: -sumBy(["LIABILITY"]),
        taxPayable: -sumBy(["TAX"]),
        cashAndBank: sumBy(["ASSET", "BANK"]),
        expenses: sumBy(["EXPENSE", "COGS"]),
        revenueThisMonth: revenue,
        spendByAccount,
        outOfBalanceBy: await store.outOfBalanceBy(),
        billCount: bills.length,
        totalSpend,
        largestBill: largest,
        pendingApprovals,
        claimableInputTax,
        spendByCategory,
        spendByVendor,
        spendByTax,
        spendTrend,
      });
    }

    if (method === "GET" && path === "/bills") {
      if (!(await readGuard(req, res))) return;
      return send(res, 200, await store.listBills());
    }

    if (method === "GET" && path === "/vendors") {
      if (!(await readGuard(req, res))) return;
      return send(res, 200, await store.listVendors());
    }

    if (method === "GET" && path === "/tax-filing") {
      if (!(await readGuard(req, res))) return;
      return send(res, 200, {
        form: "MIRA_205_GGST",
        taxpayer: await store.taxpayer(),
        filings: await store.listGstFilings(),
      });
    }

    if (method === "GET" && path === "/reports") {
      if (!(await readGuard(req, res))) return;
      const tb = await store.trialBalance();
      const bills = await store.listBills();
      const sumType = (types: string[]) =>
        tb.filter((r) => types.includes(r.accountType)).reduce((s, r) => s + r.balance, 0);
      const { from, to } = monthRange(new Date());
      const revenue = await store.revenue(from, to);
      const filings = await store.listGstFilings();
      const currentFiling = filings.find((f) => f.status !== "FILED") ?? filings.at(-1);

      const AGING = ["current", "1_30", "31_60", "61_90", "90_plus"];
      const apAging = AGING.map((bucket) => {
        const rows = bills.filter((b) => b.aging === bucket);
        return { bucket, amount: round2(rows.reduce((s, b) => s + b.total, 0)), count: rows.length };
      });

      const catMap = new Map<string, { amt: number; n: number }>();
      for (const b of bills) {
        const k = b.cat || "Uncategorised";
        const cur = catMap.get(k) ?? { amt: 0, n: 0 };
        cur.amt += b.total; cur.n += 1;
        catMap.set(k, cur);
      }
      const spendByCategory = [...catMap]
        .map(([name, v]) => ({ name, n: v.n, amt: round2(v.amt) }))
        .sort((a, b) => b.amt - a.amt);

      return send(res, 200, {
        currency: "MVR",
        kpis: {
          totalSpend: round2(bills.reduce((s, b) => s + b.total, 0)),
          billCount: bills.length,
          revenueThisMonth: revenue.grandTotal,
          salesCount: revenue.salesCount,
          expenses: sumType(["EXPENSE", "COGS"]),
          cashAndBank: sumType(["ASSET", "BANK"]),
          accountsPayable: -sumType(["LIABILITY"]),
          claimableInputTax: round2(
            bills.filter((b) => b.taxCat !== "EXEMPT").reduce((s, b) => s + b.gst, 0),
          ),
          gstNetPosition: currentFiling ? currentFiling.netPayable : 0,
          outOfBalanceBy: await store.outOfBalanceBy(),
        },
        apAging,
        spendByCategory,
      });
    }

    const billAction = /^\/bills\/([^/]+)\/(approve|reject)$/.exec(path);
    if (method === "POST" && billAction) {
      const [, id, action] = billAction;
      const status = action === "approve" ? "ACCOUNTANT_APPROVED" : "REJECTED";
      return send(res, 200, await store.setBillStatus(id, status));
    }

    if (method === "GET" && path === "/sales") {
      if (!(await readGuard(req, res))) return;
      return send(res, 200, await store.listSales());
    }

    if (method === "POST" && path === "/sales") {
      const body = (await readJson(req)) as Partial<SaleInput>;
      if (!body.date || !Array.isArray(body.lines)) {
        return send(res, 400, { error: "date and lines[] are required" });
      }
      const result = await store.recordSale({
        date: body.date,
        currency: body.currency,
        notes: body.notes,
        lines: body.lines,
      });
      return send(res, 201, result);
    }

    if (method === "GET" && path === "/revenue") {
      if (!(await readGuard(req, res))) return;
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      if (!from || !to) {
        return send(res, 400, { error: "from and to query params are required (YYYY-MM-DD)" });
      }
      return send(res, 200, await store.revenue(from, to));
    }

    return send(res, 404, { error: `No route for ${method} ${path}` });
  } catch (err) {
    if (err instanceof StoreError) {
      return send(res, err.status, { error: err.message });
    }
    if (err instanceof SyntaxError) {
      return send(res, 400, { error: "Invalid JSON body" });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return send(res, 500, { error: message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    `kashikeyo-ledger listening on http://${HOST}:${PORT} (backend: ${store.backend})`,
  );
});
