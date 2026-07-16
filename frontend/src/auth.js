// Supabase email/password auth via the REST endpoint. Configure at build time:
//   VITE_SUPABASE_URL       - your project URL
//   VITE_SUPABASE_ANON_KEY  - the anon/publishable key (public)
const SB_URL = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const SB_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const STORE_KEY = "kashikeyo.session";

export const authConfigured = Boolean(SB_URL && SB_ANON);

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "null");
  } catch {
    return null;
  }
}

/** The access token, or null if absent/expired. */
export function getToken() {
  const s = getSession();
  if (!s?.access_token) return null;
  if (s.expires_at && Date.now() / 1000 > s.expires_at - 30) return null;
  return s.access_token;
}

export async function signIn(email, password) {
  if (!authConfigured) throw new Error("Auth is not configured for this site.");
  let res;
  try {
    res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SB_ANON, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    // fetch itself failed — wrong URL, DNS, CORS or offline.
    throw new Error(`Couldn't reach the auth server at ${SB_URL || "(no URL set)"}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // GoTrue uses several field names: error_description (bad login), msg
    // (rate limit etc.), message ("Invalid API key" on a bad anon key). Surface
    // whichever is present so the real reason isn't hidden as "Sign-in failed".
    const detail =
      data.error_description || data.msg || data.message || data.error_code ||
      data.error || `HTTP ${res.status}`;
    throw new Error(detail);
  }
  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    user: data.user ? { id: data.user.id, email: data.user.email } : null,
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(session));
  return session;
}

export function signOut() {
  localStorage.removeItem(STORE_KEY);
}
