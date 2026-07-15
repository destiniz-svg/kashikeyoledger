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

async function post(path) {
  // Writes prefer a logged-in user's token; fall back to the key (which the
  // server rejects for writes if it is only the read key — prompting sign-in).
  const token = getToken();
  const headers = token
    ? { authorization: `Bearer ${token}` }
    : KEY
      ? { "x-api-key": KEY }
      : {};
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export const getDashboard = () => get("/dashboard");
export const getBills = () => get("/bills");
export const getVendors = () => get("/vendors");
export const getTaxFiling = () => get("/tax-filing");
export const getReports = () => get("/reports");
export const getInventory = () => get("/inventory");
export const approveBill = (id) => post(`/bills/${encodeURIComponent(id)}/approve`);
export const rejectBill = (id) => post(`/bills/${encodeURIComponent(id)}/reject`);
