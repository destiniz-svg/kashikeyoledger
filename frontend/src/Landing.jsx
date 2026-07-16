import React from "react";
import {
  Sparkles, Landmark, CalendarClock, Package, BarChart3, ShieldCheck,
  Check, ArrowRight, TrendingUp, ReceiptText,
} from "lucide-react";
import { T, mono, sans, num } from "./theme.js";
import { Eyebrow } from "./ui.jsx";

const FEATURES = [
  [Sparkles, "AI bill approval",
    "AI reads each invoice — vendor, TIN, line items, tax — and flags mismatches before you approve."],
  [Landmark, "Bank reconciliation",
    "Import BML statements and auto-match lines to payments: exact, fuzzy, then rules. Bulk-confirm in one pass."],
  [CalendarClock, "MIRA 205 & 206 filing",
    "GGST and TGST returns computed from your books, with the official return boxes and a filled-PDF export."],
  [Package, "Perpetual inventory",
    "Live stock from purchase bills, valued at weighted-average cost, with low-stock alerts."],
  [BarChart3, "Reports & analytics",
    "AP aging, spend by category and vendor, cash position and GST net — all in Rufiyaa."],
  [ShieldCheck, "Books that balance",
    "Every entry is double-entry and balance-checked in the database. Out-of-balance is always zero."],
];

const CHIPS = ["Double-entry", "MVR-native", "MIRA 205 / 206", "Supabase-secured"];

const Logo = () => (
  <div className="flex items-center gap-2.5">
    <div style={{ width: 34, height: 34, borderRadius: 10, background: T.ink, color: "#fff",
      display: "grid", placeItems: "center", fontFamily: mono, fontWeight: 800, fontSize: 17 }}>K</div>
    <div style={{ fontSize: 15.5, fontWeight: 700, color: T.text, letterSpacing: "-0.01em" }}>
      Kashikeyo Ledger</div>
  </div>
);

// A small non-interactive dashboard mock, so the hero shows the product.
function PreviewCard() {
  const tiles = [
    ["Accounts payable", "45,230", T.warn],
    ["Cash & bank", "312,400", T.text],
    ["GST payable", "7,280", T.claim],
  ];
  const bars = [42, 55, 48, 61, 72, 95, 100, 68];
  return (
    <div className="rounded-2xl p-4 sm:p-5" style={{ background: T.surface, border: `1px solid ${T.line}`,
      boxShadow: "0 24px 60px -30px rgba(11,42,46,0.35)" }}>
      <div className="flex items-center justify-between mb-3">
        <div style={{ fontSize: 12.5, fontWeight: 650, color: T.text }}>Spend Overview</div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: mono,
          fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: T.claim }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: T.claim }} />LIVE</span>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {tiles.map(([label, val, color]) => (
          <div key={label} className="rounded-xl p-2.5" style={{ background: T.paper, border: `1px solid ${T.line}` }}>
            <div style={{ fontFamily: mono, fontSize: 7.5, letterSpacing: "0.08em", textTransform: "uppercase",
              color: T.faint }}>{label}</div>
            <div style={{ ...num, fontSize: 15, fontWeight: 700, color, marginTop: 4 }}>{val}</div>
          </div>
        ))}
      </div>
      <div className="rounded-xl p-3" style={{ background: T.paper, border: `1px solid ${T.line}` }}>
        <div className="flex items-center justify-between mb-2.5">
          <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase",
            color: T.faint }}>Spend trend</div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9.5, color: T.claim }}>
            <TrendingUp size={11} /> +36%</span>
        </div>
        <div className="flex items-end gap-1.5" style={{ height: 60 }}>
          {bars.map((h, i) => (
            <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 3,
              background: i === bars.length - 2 ? T.teal : T.tealSoft }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function Landing({ onSignIn, onEnter }) {
  return (
    <div style={{ fontFamily: sans, color: T.text, minHeight: "100vh", background: T.paper }}>
      <style>{`
        @media (prefers-reduced-motion: reduce){ *{transition:none!important} }
        .kbtn:focus-visible{ outline:2px solid ${T.gold}; outline-offset:2px; }
      `}</style>

      {/* Top bar */}
      <header className="flex items-center justify-between px-5 sm:px-8 lg:px-12"
        style={{ height: 68, borderBottom: `1px solid ${T.line}`, background: T.surface }}>
        <Logo />
        <button onClick={onSignIn} className="kbtn focus:outline-none"
          style={{ background: T.ink, color: "#fff", borderRadius: 10, padding: "9px 18px",
            fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Sign in</button>
      </header>

      {/* Hero */}
      <section className="px-5 sm:px-8 lg:px-12" style={{ paddingTop: 56, paddingBottom: 40 }}>
        <div className="mx-auto grid lg:grid-cols-2 gap-10 lg:gap-14 items-center" style={{ maxWidth: 1120 }}>
          <div>
            <Eyebrow>Accounting for Maldives businesses</Eyebrow>
            <h1 style={{ fontSize: "clamp(30px, 5vw, 48px)", fontWeight: 780, letterSpacing: "-0.03em",
              lineHeight: 1.05, color: T.ink, marginTop: 14 }}>
              The ledger that keeps your books balanced and your filings on time.</h1>
            <p style={{ fontSize: 15.5, lineHeight: 1.6, color: T.muted, marginTop: 18, maxWidth: 520 }}>
              AI-verified bills, bank reconciliation, and MIRA-ready GST returns — one place to run
              your whole business in Rufiyaa, with books that always balance.</p>
            <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 26 }}>
              <button onClick={onSignIn} className="kbtn flex items-center gap-2 focus:outline-none"
                style={{ background: T.ink, color: "#fff", borderRadius: 11, padding: "12px 22px",
                  fontSize: 14, fontWeight: 650, cursor: "pointer" }}>
                Sign in <ArrowRight size={16} /></button>
              <button onClick={onEnter} className="kbtn flex items-center gap-2 focus:outline-none"
                style={{ background: T.surface, color: T.text, border: `1px solid ${T.line}`, borderRadius: 11,
                  padding: "12px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Explore the demo</button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2" style={{ marginTop: 24 }}>
              {CHIPS.map((c) => (
                <span key={c} className="inline-flex items-center gap-1.5"
                  style={{ fontFamily: mono, fontSize: 11, color: T.faint }}>
                  <Check size={12} color={T.claim} /> {c}</span>
              ))}
            </div>
          </div>
          <div className="lg:pl-6"><PreviewCard /></div>
        </div>
      </section>

      {/* Features */}
      <section className="px-5 sm:px-8 lg:px-12" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <div className="mx-auto" style={{ maxWidth: 1120 }}>
          <Eyebrow>Everything the business needs</Eyebrow>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", marginTop: 8,
            marginBottom: 26 }}>From invoice to filing, in one ledger.</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(([Icon, title, body]) => (
              <div key={title} className="rounded-2xl p-5" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: T.tealSofter,
                  display: "grid", placeItems: "center" }}><Icon size={19} color={T.teal} /></div>
                <div style={{ fontSize: 15, fontWeight: 660, color: T.text, marginTop: 14 }}>{title}</div>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: T.muted, marginTop: 6 }}>{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="px-5 sm:px-8 lg:px-12" style={{ paddingBottom: 56 }}>
        <div className="mx-auto rounded-3xl px-6 sm:px-12 py-12 text-center" style={{ maxWidth: 1120,
          background: T.ink, color: "#fff" }}>
          <div className="inline-flex items-center gap-2 mb-4" style={{ fontFamily: mono, fontSize: 11,
            letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.7)" }}>
            <ReceiptText size={14} /> Ready when you are</div>
          <div style={{ fontSize: "clamp(22px, 3.5vw, 32px)", fontWeight: 750, letterSpacing: "-0.02em",
            lineHeight: 1.15 }}>Close your books without the spreadsheet gymnastics.</div>
          <p style={{ fontSize: 14.5, color: "rgba(255,255,255,0.72)", marginTop: 12, maxWidth: 480,
            marginLeft: "auto", marginRight: "auto" }}>
            Sign in to approve bills and record entries, or open the demo to look around first.</p>
          <div className="flex flex-wrap items-center justify-center gap-3" style={{ marginTop: 24 }}>
            <button onClick={onSignIn} className="kbtn flex items-center gap-2 focus:outline-none"
              style={{ background: "#fff", color: T.ink, borderRadius: 11, padding: "12px 24px",
                fontSize: 14, fontWeight: 680, cursor: "pointer" }}>Sign in <ArrowRight size={16} /></button>
            <button onClick={onEnter} className="kbtn focus:outline-none"
              style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.35)",
                borderRadius: 11, padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              Explore the demo</button>
          </div>
        </div>
      </section>

      <footer className="px-5 sm:px-8 lg:px-12" style={{ borderTop: `1px solid ${T.line}`, background: T.surface }}>
        <div className="mx-auto flex flex-col sm:flex-row items-center justify-between gap-3"
          style={{ maxWidth: 1120, paddingTop: 22, paddingBottom: 22 }}>
          <Logo />
          <div style={{ fontFamily: mono, fontSize: 11, color: T.faint }}>
            Double-entry accounting · GST-compliant · Malé, Maldives</div>
        </div>
      </footer>
    </div>
  );
}
