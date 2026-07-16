import React, { useState, useEffect } from "react";
import {
  Sparkles, Landmark, CalendarClock, Package, BarChart3, ShieldCheck,
  Check, ArrowRight, TrendingUp, ReceiptText, ScanLine, Command,
} from "lucide-react";
import { T, mono, sans, num } from "./theme.js";
import { Eyebrow } from "./ui.jsx";
import { useReveal, useCountUp } from "./motion.js";

const FEATURES = [
  [ScanLine, "AI document inbox",
    "Drop any receipt, invoice, bill or bank slip. AI reads the vendor, TIN, line items and tax, classifies it for MIRA, and explains itself."],
  [Sparkles, "Learns from you",
    "Correct a category once and it remembers — future documents from that vendor are auto-classified, with the rule shown for trust."],
  [Landmark, "Bank reconciliation",
    "Import BML statements and auto-match lines to payments — exact, fuzzy, then rules. Post a deposit slip straight to Banking."],
  [CalendarClock, "MIRA 205 & 206 filing",
    "GGST and TGST returns computed from your books, with the official return boxes and a filled-PDF export ready to submit."],
  [BarChart3, "MIRA-ready dashboard",
    "A live readiness score, unclaimable-input-tax alerts, and every figure in both Rufiyaa and USD."],
  [ShieldCheck, "Books that balance",
    "Every entry is double-entry and balance-checked in the database, with an immutable audit trail for the Tax Administration Act."],
];

const CHIPS = ["MVR-native", "MIRA 205 / 206", "Double-entry", "Audit-ready"];
const STATS = [
  ["8%", "GGST handled"],
  ["17%", "TGST handled"],
  ["2", "AI providers"],
  ["0", "spreadsheets"],
];
const FLOW = [
  ["Upload", "Drop a receipt or bank slip"],
  ["AI reads it", "Vendor, TIN, tax, MIRA category"],
  ["You approve", "One click, with the reasoning shown"],
  ["Filed", "MIRA 205 / 206 export ready"],
];

const Logo = ({ light }) => (
  <div className="flex items-center gap-2.5">
    <div style={{ width: 34, height: 34, borderRadius: 10, background: light ? "#fff" : T.ink,
      color: light ? T.ink : "#fff", display: "grid", placeItems: "center", fontFamily: mono,
      fontWeight: 800, fontSize: 17 }}>K</div>
    <div style={{ fontSize: 15.5, fontWeight: 700, color: light ? "#fff" : T.text, letterSpacing: "-0.01em" }}>
      Kashikeyo Ledger</div>
  </div>
);

// Animated dashboard mock — bars grow on mount, a KPI counts up.
function PreviewCard() {
  const [grown, setGrown] = useState(false);
  useEffect(() => { const t = setTimeout(() => setGrown(true), 150); return () => clearTimeout(t); }, []);
  const payable = useCountUp(45230, 1100);
  const bars = [42, 55, 48, 61, 72, 95, 100, 68];
  const tiles = [
    ["Accounts payable", `Rf ${Math.round(payable).toLocaleString("en-US")}`, T.warn],
    ["Cash & bank", "Rf 312,400", T.text],
    ["GST payable", "Rf 7,280", T.claim],
  ];
  return (
    <div className="rounded-2xl p-4 sm:p-5" style={{ background: T.surface, border: `1px solid ${T.line}`,
      boxShadow: "0 40px 90px -40px rgba(11,42,46,0.45)" }}>
      <div className="flex items-center justify-between mb-3">
        <div style={{ fontSize: 12.5, fontWeight: 650, color: T.text }}>Spend Overview</div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: mono,
          fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: T.claim }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: T.claim,
            animation: "k-pulse 1.6s ease-in-out infinite" }} />LIVE</span>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {tiles.map(([label, val, color], i) => (
          <div key={label} className="rounded-xl p-2.5 k-in" style={{ background: T.paper,
            border: `1px solid ${T.line}`, animationDelay: `${i * 90 + 200}ms` }}>
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
            <div key={i} style={{ flex: 1, height: grown ? `${h}%` : "6%", borderRadius: 3,
              background: i === bars.length - 2 ? T.teal : T.tealSoft,
              transition: `height .8s cubic-bezier(.22,1,.36,1) ${i * 60}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Reveal({ children, delay = 0, className = "" }) {
  const [ref, shown] = useReveal();
  return (
    <div ref={ref} className={`k-reveal ${shown ? "is-in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}>{children}</div>
  );
}

export function Landing({ onSignIn, onEnter }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <div style={{ fontFamily: sans, color: T.text, minHeight: "100vh", background: T.paper }}>
      <style>{`.kbtn:focus-visible{ outline:2px solid ${T.gold}; outline-offset:2px; }`}</style>

      {/* Sticky header */}
      <header className="flex items-center justify-between px-5 sm:px-8 lg:px-12"
        style={{ height: 66, position: "sticky", top: 0, zIndex: 40,
          background: scrolled ? "rgba(255,255,255,0.82)" : "transparent",
          backdropFilter: scrolled ? "blur(10px)" : "none",
          borderBottom: `1px solid ${scrolled ? T.line : "transparent"}`, transition: "all .25s var(--k-ease)" }}>
        <Logo />
        <div className="flex items-center gap-2">
          <button onClick={onEnter} className="kbtn focus:outline-none hidden sm:inline-flex k-press"
            style={{ color: T.text, borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 600 }}>
            Explore demo</button>
          <button onClick={onSignIn} className="kbtn focus:outline-none k-press k-lift"
            style={{ background: T.ink, color: "#fff", borderRadius: 10, padding: "9px 18px",
              fontSize: 13, fontWeight: 600 }}>Sign in</button>
        </div>
      </header>

      {/* Hero */}
      <section className="px-5 sm:px-8 lg:px-12" style={{ paddingTop: 56, paddingBottom: 48, position: "relative", overflow: "hidden" }}>
        <div aria-hidden style={{ position: "absolute", top: -120, right: -80, width: 520, height: 520,
          background: `radial-gradient(circle, ${T.tealSoft} 0%, transparent 62%)`, pointerEvents: "none" }} />
        <div className="mx-auto grid lg:grid-cols-2 gap-10 lg:gap-14 items-center" style={{ maxWidth: 1120, position: "relative" }}>
          <div className="k-in">
            <div className="inline-flex items-center gap-2 mb-4" style={{ background: T.surface,
              border: `1px solid ${T.line}`, borderRadius: 999, padding: "5px 12px", fontFamily: mono,
              fontSize: 11, color: T.teal, fontWeight: 600 }}>
              <Sparkles size={13} /> AI-native accounting for the Maldives</div>
            <h1 style={{ fontSize: "clamp(31px, 5.2vw, 50px)", fontWeight: 790, letterSpacing: "-0.03em",
              lineHeight: 1.04, color: T.ink }}>
              Books that balance.<br />Filings that{" "}
              <span style={{ background: `linear-gradient(90deg, ${T.teal}, ${T.gold})`,
                WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>file themselves.</span></h1>
            <p style={{ fontSize: 15.5, lineHeight: 1.6, color: T.muted, marginTop: 18, maxWidth: 520 }}>
              Drop a receipt and AI reads it into MIRA-ready books — vendor, TIN, tax and all.
              Reconcile the bank, watch your readiness score, and export GST returns, all in Rufiyaa.</p>
            <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 26 }}>
              <button onClick={onSignIn} className="kbtn flex items-center gap-2 focus:outline-none k-press k-lift"
                style={{ background: T.ink, color: "#fff", borderRadius: 11, padding: "12px 22px",
                  fontSize: 14, fontWeight: 650 }}>Get started <ArrowRight size={16} /></button>
              <button onClick={onEnter} className="kbtn flex items-center gap-2 focus:outline-none k-press"
                style={{ background: T.surface, color: T.text, border: `1px solid ${T.line}`, borderRadius: 11,
                  padding: "12px 22px", fontSize: 14, fontWeight: 600 }}>Explore the demo</button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2" style={{ marginTop: 24 }}>
              {CHIPS.map((c) => (
                <span key={c} className="inline-flex items-center gap-1.5" style={{ fontFamily: mono, fontSize: 11, color: T.faint }}>
                  <Check size={12} color={T.claim} /> {c}</span>
              ))}
            </div>
          </div>
          <div className="lg:pl-6 k-in-scale" style={{ animationDelay: "120ms" }}><PreviewCard /></div>
        </div>
      </section>

      {/* Stats band */}
      <section className="px-5 sm:px-8 lg:px-12" style={{ paddingBottom: 8 }}>
        <Reveal>
          <div className="mx-auto grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ maxWidth: 1120 }}>
            {STATS.map(([v, l], i) => (
              <div key={l} className="rounded-2xl p-5 text-center k-lift" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
                <div style={{ ...num, fontSize: 30, fontWeight: 780, color: T.ink, letterSpacing: "-0.02em" }}>{v}</div>
                <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase",
                  color: T.faint, marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Features */}
      <section className="px-5 sm:px-8 lg:px-12" style={{ paddingTop: 48, paddingBottom: 48 }}>
        <div className="mx-auto" style={{ maxWidth: 1120 }}>
          <Reveal>
            <Eyebrow>Everything the business needs</Eyebrow>
            <div style={{ fontSize: "clamp(22px, 3vw, 30px)", fontWeight: 740, color: T.text,
              letterSpacing: "-0.02em", marginTop: 8, marginBottom: 26 }}>From receipt to filing, in one ledger.</div>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(([Icon, title, body], i) => (
              <Reveal key={title} delay={(i % 3) * 80}>
                <div className="rounded-2xl p-5 k-lift h-full" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: T.tealSofter,
                    display: "grid", placeItems: "center" }}><Icon size={19} color={T.teal} /></div>
                  <div style={{ fontSize: 15, fontWeight: 670, color: T.text, marginTop: 14 }}>{title}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.55, color: T.muted, marginTop: 6 }}>{body}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Flow band (dark) */}
      <section className="px-5 sm:px-8 lg:px-12" style={{ paddingBottom: 48 }}>
        <Reveal>
          <div className="mx-auto rounded-3xl px-6 sm:px-10 py-10" style={{ maxWidth: 1120, background: T.ink }}>
            <div className="text-center mb-8">
              <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
                color: "rgba(255,255,255,0.6)" }}>How it works</div>
              <div style={{ fontSize: "clamp(20px, 3vw, 26px)", fontWeight: 730, color: "#fff", marginTop: 8 }}>
                Four steps from paper to filed.</div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {FLOW.map(([step, desc], i) => (
                <div key={step} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)" }}>
                  <div style={{ ...num, fontSize: 12, fontWeight: 700, color: T.gold }}>0{i + 1}</div>
                  <div style={{ fontSize: 14.5, fontWeight: 660, color: "#fff", marginTop: 8 }}>{step}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.66)", marginTop: 4 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* CTA */}
      <section className="px-5 sm:px-8 lg:px-12" style={{ paddingBottom: 56 }}>
        <Reveal>
          <div className="mx-auto rounded-3xl px-6 sm:px-12 py-12 text-center" style={{ maxWidth: 1120,
            background: `linear-gradient(135deg, ${T.ink}, ${T.inkSoft})`, color: "#fff", position: "relative", overflow: "hidden" }}>
            <div aria-hidden style={{ position: "absolute", bottom: -100, left: -60, width: 360, height: 360,
              background: `radial-gradient(circle, rgba(184,137,43,0.22) 0%, transparent 62%)` }} />
            <div className="inline-flex items-center gap-2 mb-4" style={{ fontFamily: mono, fontSize: 11,
              letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.7)", position: "relative" }}>
              <ReceiptText size={14} /> Ready when you are</div>
            <div style={{ fontSize: "clamp(23px, 3.6vw, 34px)", fontWeight: 760, letterSpacing: "-0.02em",
              lineHeight: 1.12, position: "relative" }}>Close your books without the spreadsheet gymnastics.</div>
            <p style={{ fontSize: 14.5, color: "rgba(255,255,255,0.74)", marginTop: 12, maxWidth: 480,
              marginLeft: "auto", marginRight: "auto", position: "relative" }}>
              Sign in to approve bills and record entries, or open the demo to look around first.</p>
            <div className="flex flex-wrap items-center justify-center gap-3" style={{ marginTop: 24, position: "relative" }}>
              <button onClick={onSignIn} className="kbtn flex items-center gap-2 focus:outline-none k-press k-lift"
                style={{ background: "#fff", color: T.ink, borderRadius: 11, padding: "12px 24px",
                  fontSize: 14, fontWeight: 680 }}>Get started <ArrowRight size={16} /></button>
              <button onClick={onEnter} className="kbtn inline-flex items-center gap-2 focus:outline-none k-press"
                style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.35)",
                  borderRadius: 11, padding: "12px 24px", fontSize: 14, fontWeight: 600 }}>
                <Command size={14} /> Explore the demo</button>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="px-5 sm:px-8 lg:px-12" style={{ borderTop: `1px solid ${T.line}`, background: T.surface }}>
        <div className="mx-auto flex flex-col sm:flex-row items-center justify-between gap-3"
          style={{ maxWidth: 1120, paddingTop: 22, paddingBottom: 22 }}>
          <Logo />
          <div style={{ fontFamily: mono, fontSize: 11, color: T.faint }}>
            Double-entry accounting · MIRA-compliant · Malé, Maldives</div>
        </div>
      </footer>
    </div>
  );
}
