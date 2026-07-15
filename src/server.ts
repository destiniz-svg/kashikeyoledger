/**
 * A minimal, dependency-free HTTP API around the ledger, suitable for
 * deploying as a web service (e.g. on Railway). State is in-memory and resets
 * on restart — this is a demonstration surface, not a persistence layer.
 *
 * Listens on `process.env.PORT` (Railway sets this), defaulting to 3000.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Ledger, LedgerError, account } from "./ledger.ts";
import { formatMoney } from "./money.ts";
import type { AccountType, Posting } from "./types.ts";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = "0.0.0.0";

const ledger = new Ledger();
// Seed a couple of common accounts so the service is usable immediately.
ledger.addAccount(account("cash", "Cash", "asset"));
ledger.addAccount(account("capital", "Owner's Capital", "equity"));

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

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

function trialBalanceView() {
  return ledger.trialBalance().map((row) => ({
    accountId: row.accountId,
    name: row.name,
    type: row.type,
    balanceMinor: row.balance,
    balance: formatMoney(row.balance),
  }));
}

const server = createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;

  try {
    if (method === "GET" && path === "/health") {
      return send(res, 200, { status: "ok" });
    }

    if (method === "GET" && path === "/") {
      return send(res, 200, {
        service: "kashikeyo-ledger",
        status: "ok",
        endpoints: [
          "GET /health",
          "GET /accounts",
          "POST /accounts { id, name, type, currency? }",
          "GET /entries",
          "POST /entries { date, description, postings: [{ accountId, amount, direction }] }",
          "GET /trial-balance",
        ],
        outOfBalanceBy: formatMoney(ledger.outOfBalanceBy()),
      });
    }

    if (method === "GET" && path === "/accounts") {
      return send(res, 200, ledger.accounts());
    }

    if (method === "POST" && path === "/accounts") {
      const body = (await readJson(req)) as {
        id?: string;
        name?: string;
        type?: AccountType;
        currency?: string;
      };
      if (!body.id || !body.name || !body.type) {
        return send(res, 400, { error: "id, name and type are required" });
      }
      const created = ledger.addAccount(
        account(body.id, body.name, body.type, body.currency ?? "USD"),
      );
      return send(res, 201, created);
    }

    if (method === "GET" && path === "/entries") {
      return send(res, 200, ledger.entries());
    }

    if (method === "POST" && path === "/entries") {
      const body = (await readJson(req)) as {
        date?: string;
        description?: string;
        postings?: Posting[];
      };
      if (!body.date || !body.description || !Array.isArray(body.postings)) {
        return send(res, 400, {
          error: "date, description and postings[] are required",
        });
      }
      const entry = ledger.post({
        date: body.date,
        description: body.description,
        postings: body.postings,
      });
      return send(res, 201, entry);
    }

    if (method === "GET" && path === "/trial-balance") {
      return send(res, 200, {
        rows: trialBalanceView(),
        outOfBalanceBy: formatMoney(ledger.outOfBalanceBy()),
      });
    }

    return send(res, 404, { error: `No route for ${method} ${path}` });
  } catch (err) {
    if (err instanceof LedgerError) {
      return send(res, 422, { error: err.message });
    }
    if (err instanceof SyntaxError) {
      return send(res, 400, { error: "Invalid JSON body" });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return send(res, 500, { error: message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`kashikeyo-ledger listening on http://${HOST}:${PORT}`);
});
