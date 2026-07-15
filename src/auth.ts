/**
 * API-key authentication for write requests. Reads are left open; any mutating
 * method (POST/PUT/PATCH/DELETE) must present the configured key.
 *
 * The key is supplied via the `KASHIKEYO_API_KEY` env var. Fail-closed: if no
 * key is configured, writes are rejected (503) rather than left open.
 *
 * Clients send the key as either header:
 *   X-API-Key: <key>
 *   Authorization: Bearer <key>
 */
import { createHash, timingSafeEqual } from "node:crypto";

export interface WriteAuthResult {
  ok: boolean;
  status: number;
  message?: string;
}

type Headers = Record<string, string | string[] | undefined>;

function header(headers: Headers, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Extract the presented key from either supported header. */
export function extractApiKey(headers: Headers): string | undefined {
  const direct = header(headers, "x-api-key");
  if (direct) return direct.trim();
  const auth = header(headers, "authorization");
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match) return match[1].trim();
  }
  return undefined;
}

/** Constant-time string comparison via fixed-length digests. */
function safeEqual(a: string, b: string): boolean {
  const da = createHash("sha256").update(a).digest();
  const db = createHash("sha256").update(b).digest();
  return timingSafeEqual(da, db);
}

/**
 * Decide whether a write request is authorized.
 * @param headers request headers (e.g. `req.headers`)
 * @param configuredKey the value of `KASHIKEYO_API_KEY` (may be undefined)
 */
export function authorizeWrite(
  headers: Headers,
  configuredKey: string | undefined,
): WriteAuthResult {
  if (!configuredKey) {
    return {
      ok: false,
      status: 503,
      message: "Write authentication is not configured (set KASHIKEYO_API_KEY)",
    };
  }
  const presented = extractApiKey(headers);
  if (!presented) {
    return {
      ok: false,
      status: 401,
      message: "Missing API key (send X-API-Key or Authorization: Bearer)",
    };
  }
  if (!safeEqual(presented, configuredKey)) {
    return { ok: false, status: 403, message: "Invalid API key" };
  }
  return { ok: true, status: 200 };
}
