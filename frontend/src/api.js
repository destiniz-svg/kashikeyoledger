// Thin client for the Kashikeyo Ledger API.
// Configure at build time via Netlify env vars:
//   VITE_API_BASE_URL  - the API origin (defaults to the Railway deployment)
//   VITE_API_KEY       - optional read key, needed once read auth is enabled
const BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://kashikeyoledger-production.up.railway.app"
).replace(/\/+$/, "");
const KEY = import.meta.env.VITE_API_KEY;

import { getToken } from "./auth.js";

export const API_BASE = BASE;

async function get(path) {
  // A logged-in member's token authorizes reads too (works even when no
  // read-only key is configured on the server); else fall back to the key.
  const token = getToken();
  const headers = token
    ? { authorization: `Bearer ${token}` }
    : KEY
      ? { "x-api-key": KEY }
      : {};
  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

async function post(path, body) {
  // Writes prefer a logged-in user's token; fall back to the key (which the
  // server rejects for writes if it is only the read key — prompting sign-in).
  const token = getToken();
  const headers = token
    ? { authorization: `Bearer ${token}` }
    : KEY
      ? { "x-api-key": KEY }
      : {};
  const init = { method: "POST", headers };
  if (body !== undefined) {
    init.headers = { ...headers, "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export const getDashboard = () => get("/dashboard");
export const getBills = () => get("/bills");
export const getVendors = () => get("/vendors");
export const getTaxFiling = () => get("/tax-filing");
export const getReports = () => get("/reports");
export const getCompliance = () => get("/compliance");
export const getInventory = () => get("/inventory");
export const getBanking = () => get("/banking");
export const getSettings = () => get("/settings");
export const getTransactions = () => get("/transactions");
export const getDocuments = () => get("/documents");
export const uploadDocument = (filename, contentType, dataBase64, captureSource) =>
  post("/documents", { filename, contentType, dataBase64, captureSource });
export const overrideDocument = (id, override) =>
  post(`/documents/${encodeURIComponent(id)}/override`, override);
export const getRules = () => get("/rules");
export const deleteRule = (id) => del(`/rules/${encodeURIComponent(id)}`);

async function patch(path, body) {
  const token = getToken();
  const headers = token
    ? { authorization: `Bearer ${token}`, "content-type": "application/json" }
    : KEY
      ? { "x-api-key": KEY, "content-type": "application/json" }
      : { "content-type": "application/json" };
  const res = await fetch(`${BASE}${path}`, { method: "PATCH", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
async function del(path) {
  const token = getToken();
  const headers = token ? { authorization: `Bearer ${token}` } : KEY ? { "x-api-key": KEY } : {};
  const res = await fetch(`${BASE}${path}`, { method: "DELETE", headers });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
export const updateSettings = (patchBody) => patch("/settings", patchBody);
const bankAction = (id, action) => post(`/banking/${encodeURIComponent(id)}/${action}`);
export const confirmBankTxn = (id, vendorId) =>
  post(`/banking/${encodeURIComponent(id)}/confirm`, vendorId ? { vendorId } : undefined);
export const excludeBankTxn = (id) => bankAction(id, "exclude");
export const unmatchBankTxn = (id) => bankAction(id, "unmatch");
export const importStatement = (bankAccountId, lines, source = "CSV_UPLOAD") =>
  post("/banking/import", { bankAccountId, source, lines });
export const approveBill = (id) => post(`/bills/${encodeURIComponent(id)}/approve`);
export const rejectBill = (id) => post(`/bills/${encodeURIComponent(id)}/reject`);
