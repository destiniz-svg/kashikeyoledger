/**
 * HTTP API for the Kashikeyo Ledger, backed by a LedgerStore. In production the
 * store is Supabase (the real schema, scoped to one organization); with no
 * Supabase env vars it falls back to an in-memory store.
 *
 * Listens on `process.env.PORT` (Railway sets this), defaulting to 3000.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createStore } from "./createStore.ts";
import { StoreError, type EntryInput } from "./store.ts";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = "0.0.0.0";
const store = createStore();

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

const server = createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;

  try {
    if (method === "GET" && path === "/health") {
      return send(res, 200, { status: "ok", backend: store.backend });
    }

    if (method === "GET" && path === "/") {
      return send(res, 200, {
        service: "kashikeyo-ledger",
        status: "ok",
        backend: store.backend,
        organization: store.org || null,
        endpoints: [
          "GET /health",
          "GET /accounts",
          "POST /accounts { code, name, accountType }",
          "GET /entries",
          "POST /entries { date, memo, lines: [{ accountCode, debit?, credit? }] }",
          "GET /trial-balance",
        ],
        outOfBalanceBy: await store.outOfBalanceBy(),
      });
    }

    if (method === "GET" && path === "/accounts") {
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
      const rows = await store.trialBalance();
      return send(res, 200, { rows, outOfBalanceBy: await store.outOfBalanceBy() });
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
