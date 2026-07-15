import React, { useState } from "react";
import { signIn, authConfigured } from "./auth.js";
import { T } from "./theme.js";
import { Eyebrow } from "./ui.jsx";

export function LoginModal({ onClose, onSignedIn }) {
  const [email, setEmail] = useState("owner@kashikeyo.local");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const input = {
    width: "100%", marginTop: 6, marginBottom: 14, padding: "10px 12px",
    border: `1px solid ${T.line}`, borderRadius: 9, fontSize: 13, color: T.text,
    background: T.paper, outline: "none",
  };
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { onSignedIn(await signIn(email, password)); }
    catch (ex) { setErr(ex.message || "Sign-in failed"); }
    finally { setBusy(false); }
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60,
      background: "rgba(11,42,46,0.45)", display: "grid", placeItems: "center", padding: 16 }}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit}
        style={{ background: T.surface, borderRadius: 16, padding: 24, width: "100%",
          maxWidth: 360, border: `1px solid ${T.line}` }}>
        <div style={{ fontSize: 16, fontWeight: 680, color: T.text }}>Sign in</div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 4, marginBottom: 16 }}>
          Sign in to approve bills or record entries.</div>
        {!authConfigured && (
          <div style={{ background: T.warnSoft, border: "1px solid #E7D3A6", borderRadius: 8,
            padding: 10, fontSize: 11.5, color: T.warn, marginBottom: 14 }}>
            Auth isn't configured (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).</div>
        )}
        <Eyebrow>Email</Eyebrow>
        <input style={input} value={email} onChange={(e) => setEmail(e.target.value)}
          type="email" autoComplete="username" />
        <Eyebrow>Password</Eyebrow>
        <input style={input} value={password} onChange={(e) => setPassword(e.target.value)}
          type="password" autoComplete="current-password" />
        {err && <div style={{ color: T.exempt, fontSize: 12, marginBottom: 12 }}>{err}</div>}
        <button type="submit" disabled={busy}
          className="w-full rounded-lg focus:outline-none transition-opacity hover:opacity-90"
          style={{ background: T.claim, color: "#fff", fontSize: 13.5, fontWeight: 600,
            minHeight: 44, opacity: busy ? 0.7 : 1 }}>
          {busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
