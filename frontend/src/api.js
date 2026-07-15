// Thin client for the Kashikeyo Ledger API.
// Configure at build time via Netlify env vars:
//   VITE_API_BASE_URL  - the API origin (defaults to the Railway deployment)
//   VITE_API_KEY       - optional read key, needed once read auth is enabled
const BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://kashikeyoledger-production.up.railway.app"
).replace(/\/+$/, "");
const KEY = import.meta.env.VITE_API_KEY;

export const API_BASE = BASE;

async function get(path) {
  const headers = KEY ? { "x-api-key": KEY } : {};
  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export const getDashboard = () => get("/dashboard");
export const getBills = () => get("/bills");
