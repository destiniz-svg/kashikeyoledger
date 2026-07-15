import React, { useState, useEffect } from "react";
import {
  LayoutDashboard, ReceiptText, CheckCircle2, Package, Landmark,
  CalendarClock, Search, Bell, ChevronRight, ChevronDown, TrendingUp,
  TrendingDown, Check, X, Sparkles, ShieldCheck, Wallet, ArrowUpRight,
  Clock, Download, ArrowRight, FileText, MoreHorizontal, Plus, Settings,
  Users, BarChart3, ArrowDownLeft, Link2
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip
} from "recharts";
import { getDashboard, getBills, getVendors, getTaxFiling, getReports, getInventory, getBanking, approveBill, rejectBill, API_BASE } from "./api.js";
import { getSession, signIn, signOut, authConfigured } from "./auth.js";
import { exportFilingPdf } from "./mira205.js";

/* ---------------------------------------------------------------------------
   Design tokens — "ledger at depth", now on a light, airy 44-style canvas
--------------------------------------------------------------------------- */
const T = {
  ink: "#0B2A2E", inkSoft: "#123A40",
  paper: "#F7F8F6", surface: "#FFFFFF", line: "#E7EAE7", line2: "#F0F2EF",
  gold: "#B8892B", goldSoft: "#F4EAD0",
  teal: "#2A6F77", tealSoft: "#E6F0F0", tealSofter: "#F0F6F6",
  claim: "#127A5A", claimSoft: "#E0F0E8",
  warn: "#9C6A15", warnSoft: "#F6EBD6",
  exempt: "#A2382A", exemptSoft: "#F6E3DF",
  text: "#0F2124", muted: "#5B6B69", faint: "#8A9896",
};
const mono = 'ui-monospace, "SF Mono", "SFMono-Regular", Menlo, monospace';
const sans = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const num = { fontFamily: mono, fontVariantNumeric: "tabular-nums" };

const fmt = (n, cur = "MVR") =>
  `${cur === "MVR" ? "Rf" : "$"} ${Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt0 = (n) => `Rf ${Number(n).toLocaleString("en-US")}`;

const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_LONG = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MON_SHORT[m - 1]} ${y}`;
};
const monthLabel = (iso) => {
  const [y, m] = iso.split("-").map(Number);
  return `${MON_LONG[m - 1]} ${y}`;
};

function useW() {
  const [w, setW] = useState(() => typeof window !== "undefined" ? window.innerWidth : 1280);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

/* ---------------------------------------------------------------------------
   Seed data (Altura invoices + BML statement vendors)
--------------------------------------------------------------------------- */
const BILLS = [
  { id: "b1", vendor: "Altura Pvt Ltd", tin: "1145053", invoice: "ALT/INV-000024",
    po: "PO-RDC-2026-003845", date: "05 Jul 2026", due: "20 Jul 2026", cur: "MVR",
    subtotal: 91000, rate: 8, gst: 7280, total: 98280, cat: "Equipment",
    taxCat: "GGST", status: "AI_VERIFIED", aging: "current",
    line: "Concrete Mixer (50KG – 1 Bag)", qty: 1, unit: 91000 },
  { id: "b2", vendor: "Island Mark Hardware Pvt Ltd", tin: "—", invoice: "IMH-4471",
    po: "—", date: "11 May 2026", due: "26 May 2026", cur: "MVR",
    subtotal: 4300, rate: 8, gst: 344, total: 4644, cat: "Hardware",
    taxCat: "GGST", status: "DRAFT", aging: "current",
    line: "Assorted fixings & tools", qty: 12, unit: 358.33 },
  { id: "b3", vendor: "Ives Private Limited", tin: "—", invoice: "IVS-2026-118",
    po: "—", date: "11 May 2026", due: "25 May 2026", cur: "MVR",
    subtotal: 6039.58, rate: 8, gst: 483.17, total: 6522.75, cat: "Supplies",
    taxCat: "GGST", status: "AI_VERIFIED", aging: "1_30",
    line: "Packaging & consumables", qty: 1, unit: 6039.58 },
  { id: "b4", vendor: "Tree Top Health Pvt Ltd", tin: "—", invoice: "TTH-9930",
    po: "—", date: "05 Feb 2026", due: "20 Feb 2026", cur: "MVR",
    subtotal: 5809, rate: 0, gst: 0, total: 5809, cat: "Health",
    taxCat: "EXEMPT", status: "AI_VERIFIED", aging: "90_plus",
    line: "Staff medical services", qty: 1, unit: 5809 },
  { id: "b5", vendor: "Beaver Builders Private Limited", tin: "—", invoice: "BB-3382",
    po: "—", date: "14 Jun 2026", due: "29 Jun 2026", cur: "MVR",
    subtotal: 4233.72, rate: 8, gst: 338.70, total: 4572.42, cat: "Construction",
    taxCat: "GGST", status: "DRAFT", aging: "1_30",
    line: "Site labour & materials", qty: 1, unit: 4233.72 },
  { id: "b6", vendor: "Island Choice LLP", tin: "—", invoice: "IC-7781",
    po: "—", date: "12 May 2026", due: "27 May 2026", cur: "MVR",
    subtotal: 215, rate: 8, gst: 17.20, total: 232.20, cat: "F&B",
    taxCat: "GGST", status: "ACCOUNTANT_APPROVED", aging: "current",
    line: "Café supplies", qty: 1, unit: 215 },
];

const TREND = [
  { m: "Jan", val: 42513 }, { m: "Feb", val: 55120 }, { m: "Mar", val: 48300 },
  { m: "Apr", val: 61240 }, { m: "May", val: 72110 }, { m: "Jun", val: 95400 },
  { m: "Jul", val: 120830 }, { m: "Aug", val: 88900 }, { m: "Sep", val: 101200 },
  { m: "Oct", val: 93400 }, { m: "Nov", val: 86750 }, { m: "Dec", val: 118200 },
];

const BY_CATEGORY = [
  { name: "Construction", n: 14, amt: 102513, color: T.teal },
  { name: "Equipment", n: 1, amt: 91000, color: T.ink },
  { name: "Supplies", n: 3, amt: 6040, color: T.gold },
  { name: "Health", n: 1, amt: 5809, color: T.exempt },
  { name: "Hardware", n: 2, amt: 4300, color: T.warn },
  { name: "F&B", n: 5, amt: 4128, color: T.claim },
];
const BY_VENDOR = [
  { name: "Altura Pvt Ltd", n: 1, amt: 98280, ini: "AL" },
  { name: "Beaver Builders", n: 6, amt: 42300, ini: "BB" },
  { name: "Island Mark Hardware", n: 4, amt: 12644, ini: "IM" },
  { name: "Ives Private Ltd", n: 1, amt: 6523, ini: "IV" },
  { name: "Tree Top Health", n: 1, amt: 5809, ini: "TT" },
  { name: "Island Choice LLP", n: 8, amt: 3232, ini: "IC" },
];
const BY_TAX = [
  { name: "GGST 8%", n: 28, amt: 198281, color: T.teal, claim: true },
  { name: "Zero-rated", n: 6, amt: 9700, color: T.claim, claim: true },
  { name: "Exempt · Sec 20", n: 1, amt: 5809, color: T.exempt, claim: false },
];
// Colors applied to live breakdown rows (which arrive without colors).
const CAT_COLORS = [T.teal, T.ink, T.gold, T.exempt, T.warn, T.claim];
const TAX_COLORS = { "GGST 8%": T.teal, "TGST 17%": T.gold, "Zero-rated": T.claim,
  "Exempt · Sec 20": T.exempt, "Out of scope": T.muted };
const dec2 = (n) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------------------------------------------------------------------------
   Shared bits
--------------------------------------------------------------------------- */
const Eyebrow = ({ children, style }) => (
  <div style={{ fontFamily: mono, letterSpacing: "0.14em", fontSize: 10.5,
    textTransform: "uppercase", color: T.faint, ...style }}>{children}</div>
);

const STATUS = {
  DRAFT: { t: "Draft", bg: "#EEF1EF", fg: T.muted },
  AI_VERIFIED: { t: "AI verified", bg: T.tealSoft, fg: T.teal },
  ACCOUNTANT_APPROVED: { t: "Approved", bg: T.claimSoft, fg: T.claim },
  SYNCED: { t: "Synced", bg: T.goldSoft, fg: T.warn },
};
const StatusPill = ({ s }) => {
  const x = STATUS[s];
  return <span style={{ background: x.bg, color: x.fg, fontFamily: mono, fontSize: 11,
    padding: "3px 9px", borderRadius: 999, fontWeight: 600, whiteSpace: "nowrap" }}>{x.t}</span>;
};

const TAXCAT = {
  GGST: { t: "GGST 8%", bg: T.tealSoft, fg: T.teal },
  TGST: { t: "TGST 17%", bg: T.goldSoft, fg: T.warn },
  ZERO_RATED: { t: "Zero-rated", bg: T.claimSoft, fg: T.claim },
  EXEMPT: { t: "Exempt", bg: T.exemptSoft, fg: T.exempt },
};
const TaxChip = ({ c }) => {
  const x = TAXCAT[c];
  return <span style={{ background: x.bg, color: x.fg, fontFamily: mono, fontSize: 11,
    padding: "3px 8px", borderRadius: 6, fontWeight: 600, whiteSpace: "nowrap" }}>{x.t}</span>;
};

/* ---------------------------------------------------------------------------
   Navigation model (nested, 44-style)
--------------------------------------------------------------------------- */
const NAV = [
  { id: "dashboard", label: "Dashboard", short: "Overview", icon: LayoutDashboard },
  { id: "bills", label: "Bills to pay", short: "Bills", icon: ReceiptText, badge: 6 },
  { id: "approval", label: "Approvals", short: "Approve", icon: CheckCircle2, badge: 3 },
  { group: "Purchases", icon: Wallet, children: [
      { id: "vendors", label: "Vendors" },
      { id: "inventory", label: "Inventory" },
      { id: "txns", label: "All transactions" },
  ]},
  { id: "banking", label: "Banking", short: "Banking", icon: Landmark, tag: "Beta" },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "filing", label: "Tax filing", short: "Filing", icon: CalendarClock },
  { id: "settings", label: "Settings", icon: Settings },
];
const PRIMARY = ["dashboard", "approval", "bills", "banking"];
const MORE = ["inventory", "vendors", "reports", "filing", "settings", "txns"];

/* ---- Light nested sidebar ------------------------------------------------ */
function Sidebar({ active, onNav, counts }) {
  const [open, setOpen] = useState(true);
  const childActive = ["vendors", "inventory", "txns"].includes(active);

  const Item = ({ n }) => {
    const on = active === n.id; const Icon = n.icon;
    const badge = counts?.[n.id] ?? n.badge;
    return (
      <button onClick={() => onNav(n.id)}
        className="flex items-center gap-3 rounded-lg text-left transition-colors focus:outline-none"
        style={{ padding: "9px 11px", position: "relative",
          background: on ? T.tealSoft : "transparent",
          color: on ? T.teal : T.text, fontSize: 13.5, fontWeight: on ? 600 : 460 }}>
        <Icon size={17} strokeWidth={2} style={{ color: on ? T.teal : T.faint }} />
        <span className="flex-1">{n.label}</span>
        {badge ? <span style={{ background: on ? T.teal : T.line2, color: on ? "#fff" : T.muted,
          fontFamily: mono, fontSize: 10.5, fontWeight: 700, borderRadius: 999,
          padding: "1px 7px" }}>{badge}</span> : null}
        {n.tag && <span style={{ border: `1px solid ${T.line}`, color: T.gold, fontFamily: mono,
          fontSize: 9.5, borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>{n.tag}</span>}
      </button>
    );
  };

  return (
    <aside style={{ background: T.surface, width: 244, borderRight: `1px solid ${T.line}` }}
      className="shrink-0 flex-col min-h-screen hidden lg:flex">
      {/* workspace switcher */}
      <div className="px-4 pt-5 pb-4">
        <button className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors focus:outline-none"
          style={{ border: `1px solid ${T.line}` }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: T.gold,
            display: "grid", placeItems: "center", flexShrink: 0 }}>
            <span style={{ fontFamily: mono, fontWeight: 700, color: T.ink, fontSize: 15 }}>K</span>
          </div>
          <div className="flex-1 text-left min-w-0">
            <div style={{ fontSize: 13.5, fontWeight: 650, color: T.text }}>Kashikeyo</div>
            <div style={{ fontSize: 10, color: T.faint, fontFamily: mono }}>Ledger · MV</div>
          </div>
          <ChevronDown size={15} color={T.faint} />
        </button>
      </div>

      <div className="px-3 flex flex-col gap-0.5 flex-1 overflow-y-auto">
        {NAV.map((n, i) => {
          if (n.group) {
            return (
              <div key={i} className="mt-1">
                <button onClick={() => setOpen((o) => !o)}
                  className="w-full flex items-center gap-3 rounded-lg text-left focus:outline-none"
                  style={{ padding: "9px 11px", color: childActive ? T.teal : T.muted,
                    fontSize: 13.5, fontWeight: 540 }}>
                  <n.icon size={17} strokeWidth={2}
                    style={{ color: childActive ? T.teal : T.faint }} />
                  <span className="flex-1">{n.group}</span>
                  <ChevronDown size={14} color={T.faint}
                    style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
                </button>
                {open && (
                  <div className="flex flex-col" style={{ marginLeft: 27,
                    borderLeft: `1px solid ${T.line}`, paddingLeft: 6, marginTop: 2 }}>
                    {n.children.map((c) => {
                      const on = active === c.id;
                      return (
                        <button key={c.id} onClick={() => onNav(c.id)}
                          className="text-left rounded-lg focus:outline-none transition-colors"
                          style={{ padding: "7px 10px", fontSize: 13,
                            color: on ? T.teal : T.muted, fontWeight: on ? 600 : 450,
                            background: on ? T.tealSofter : "transparent" }}>
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
          return <Item key={n.id} n={n} />;
        })}
      </div>

      {/* company switcher + data toggle */}
      <div className="px-3 py-3" style={{ borderTop: `1px solid ${T.line}` }}>
        <button className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 focus:outline-none"
          style={{ background: T.paper }}>
          <div style={{ width: 26, height: 26, borderRadius: 999, background: T.teal,
            display: "grid", placeItems: "center", color: "#fff", fontFamily: mono,
            fontSize: 10.5, fontWeight: 700, flexShrink: 0 }}>RD</div>
          <div className="flex-1 text-left min-w-0">
            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Road Dev Corp</div>
          </div>
          <ChevronDown size={14} color={T.faint} />
        </button>
        <div className="flex items-center justify-between px-2.5 mt-2.5">
          <span style={{ fontSize: 12, color: T.muted }}>Demo data</span>
          <span style={{ width: 34, height: 20, borderRadius: 999, background: T.teal,
            position: "relative", display: "inline-block" }}>
            <span style={{ position: "absolute", top: 2, right: 2, width: 16, height: 16,
              borderRadius: 999, background: "#fff" }} />
          </span>
        </div>
      </div>
    </aside>
  );
}

/* ---- Mobile top bar + bottom nav ----------------------------------------- */
function MobileHeader({ title }) {
  return (
    <div className="flex lg:hidden items-center justify-between px-4 py-3"
      style={{ borderBottom: `1px solid ${T.line}`, background: T.surface,
        position: "sticky", top: 0, zIndex: 30 }}>
      <div className="flex items-center gap-2.5 min-w-0">
        <div style={{ width: 28, height: 28, borderRadius: 7, background: T.gold,
          display: "grid", placeItems: "center", flexShrink: 0 }}>
          <span style={{ fontFamily: mono, fontWeight: 700, color: T.ink, fontSize: 14 }}>K</span>
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 650, color: T.text, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
      </div>
      <div className="flex items-center gap-1.5">
        <button className="rounded-lg p-2 focus:outline-none" style={{ background: T.paper }}>
          <Search size={17} color={T.muted} /></button>
        <button className="rounded-lg p-2 relative focus:outline-none" style={{ background: T.paper }}>
          <Bell size={17} color={T.muted} />
          <span style={{ position: "absolute", top: 6, right: 6, width: 6, height: 6,
            borderRadius: 999, background: T.gold }} /></button>
      </div>
    </div>
  );
}

function BottomNav({ active, onNav, counts }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const inMore = MORE.includes(active);
  const tabs = PRIMARY.map((id) => NAV.find((n) => n.id === id));
  return (
    <>
      {moreOpen && (
        <div onClick={() => setMoreOpen(false)} className="lg:hidden"
          style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(11,42,46,0.4)" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ position: "absolute", left: 0, right: 0, bottom: 64, background: T.surface,
              borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 12,
              boxShadow: "0 -8px 30px rgba(11,42,46,0.15)" }}>
            <div style={{ width: 36, height: 4, borderRadius: 4, background: T.line,
              margin: "4px auto 12px" }} />
            {[["inventory", Package, "Inventory"], ["vendors", Users, "Vendors"],
              ["reports", BarChart3, "Reports"], ["filing", CalendarClock, "Tax filing"],
              ["settings", Settings, "Settings"]].map(([id, Icon, label]) => {
              const on = active === id;
              return (
                <button key={id} onClick={() => { onNav(id); setMoreOpen(false); }}
                  className="w-full flex items-center gap-3 rounded-xl focus:outline-none"
                  style={{ padding: "13px 14px", background: on ? T.tealSoft : "transparent",
                    color: on ? T.teal : T.text, fontSize: 14.5, fontWeight: 550 }}>
                  <Icon size={19} color={on ? T.teal : T.muted} /> {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <nav className="flex lg:hidden" style={{ position: "fixed", left: 0, right: 0, bottom: 0,
        zIndex: 45, background: T.surface, borderTop: `1px solid ${T.line}`, height: 64,
        paddingBottom: "env(safe-area-inset-bottom)" }}>
        {tabs.map((n) => {
          const on = active === n.id; const Icon = n.icon;
          const badge = counts?.[n.id] ?? n.badge;
          return (
            <button key={n.id} onClick={() => onNav(n.id)}
              className="flex-1 flex flex-col items-center justify-center gap-1 focus:outline-none"
              style={{ color: on ? T.teal : T.faint, position: "relative" }}>
              {on && <span style={{ position: "absolute", top: 0, width: 26, height: 3,
                borderRadius: 3, background: T.gold }} />}
              <div className="relative">
                <Icon size={21} strokeWidth={on ? 2.4 : 2} />
                {badge ? <span style={{ position: "absolute", top: -5, right: -8, background: T.gold,
                  color: T.ink, fontFamily: mono, fontSize: 9, fontWeight: 700, borderRadius: 999,
                  padding: "0px 4px", lineHeight: "14px" }}>{badge}</span> : null}
              </div>
              <span style={{ fontSize: 10, fontWeight: on ? 650 : 500 }}>{n.short}</span>
            </button>
          );
        })}
        <button onClick={() => setMoreOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-1 focus:outline-none"
          style={{ color: inMore ? T.teal : T.faint, position: "relative" }}>
          {inMore && <span style={{ position: "absolute", top: 0, width: 26, height: 3,
            borderRadius: 3, background: T.gold }} />}
          <MoreHorizontal size={21} strokeWidth={inMore ? 2.4 : 2} />
          <span style={{ fontSize: 10, fontWeight: inMore ? 650 : 500 }}>More</span>
        </button>
      </nav>
    </>
  );
}

/* ---- Desktop topbar (title + search + bell + add) ------------------------ */
function Topbar({ title, auth }) {
  return (
    <div className="hidden lg:flex items-center justify-between px-8 py-5"
      style={{ borderBottom: `1px solid ${T.line}`, background: T.surface }}>
      <h1 style={{ fontSize: 21, fontWeight: 700, color: T.text, letterSpacing: "-0.02em" }}>
        {title}</h1>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg px-3 py-2"
          style={{ background: T.paper, border: `1px solid ${T.line}`, width: 220 }}>
          <Search size={15} color={T.faint} />
          <input placeholder="Search…" className="bg-transparent outline-none w-full"
            style={{ fontSize: 12.5, color: T.text }} />
        </div>
        {auth && (auth.session ? (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ border: `1px solid ${T.line}` }}>
            <div style={{ width: 22, height: 22, borderRadius: 999, background: T.tealSoft,
              color: T.teal, display: "grid", placeItems: "center", fontFamily: mono,
              fontSize: 10, fontWeight: 700 }}>
              {(auth.session.user?.email || "?").slice(0, 2).toUpperCase()}</div>
            <span style={{ fontSize: 12, color: T.text, maxWidth: 140, overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{auth.session.user?.email}</span>
            <button onClick={auth.onSignOut} style={{ fontSize: 11.5, color: T.muted, fontWeight: 600 }}
              className="focus:outline-none">Sign out</button>
          </div>
        ) : (
          <button onClick={auth.onSignIn}
            className="rounded-lg px-3.5 focus:outline-none transition-opacity hover:opacity-90"
            style={{ border: `1px solid ${T.line}`, fontSize: 12.5, color: T.teal,
              fontWeight: 600, minHeight: 38 }}>Sign in</button>
        ))}
        <button className="rounded-lg p-2 relative focus:outline-none"
          style={{ border: `1px solid ${T.line}`, background: T.surface }}>
          <Bell size={16} color={T.muted} />
          <span style={{ position: "absolute", top: 6, right: 6, width: 6, height: 6,
            borderRadius: 999, background: T.gold }} /></button>
        <button className="rounded-full focus:outline-none transition-opacity hover:opacity-90"
          style={{ width: 38, height: 38, background: T.ink, display: "grid", placeItems: "center" }}>
          <Plus size={18} color="#fff" /></button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Dashboard — cloned layout from reference 44
--------------------------------------------------------------------------- */
function StatCard({ label, value, cur, sub, action, onAction, accent }) {
  return (
    <div className="rounded-2xl p-4 sm:p-5" style={{ background: T.surface,
      border: `1px solid ${T.line}` }}>
      <div className="flex items-start justify-between">
        <Eyebrow>{label}</Eyebrow>
        {action ? (
          <button onClick={onAction}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 focus:outline-none transition-colors"
            style={{ border: `1px solid ${T.line}`, fontSize: 11.5, color: T.teal, fontWeight: 600 }}>
            {action}</button>
        ) : (
          <ArrowUpRight size={16} color={T.faint} />
        )}
      </div>
      <div className="flex items-end gap-1.5 mt-3">
        <div style={{ ...num, fontSize: "clamp(21px, 4.6vw, 27px)", fontWeight: 650,
          color: accent || T.text, letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
        {cur && <span style={{ fontFamily: mono, fontSize: 11.5, color: T.faint,
          marginBottom: 2 }}>{cur}</span>}
      </div>
      <div style={{ fontSize: 11.5, color: T.muted, marginTop: 8 }}>{sub}</div>
    </div>
  );
}

function BreakdownList({ title, rows, variant, onMore }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between mb-4">
        <div style={{ fontSize: 14.5, fontWeight: 650, color: T.text }}>{title}</div>
        <button onClick={onMore} style={{ fontSize: 11.5, color: T.teal, fontWeight: 600 }}
          className="focus:outline-none">See all</button>
      </div>
      <div className="flex flex-col">
        {rows.map((r, i) => (
          <div key={r.name} className="flex items-center gap-3 py-2.5"
            style={{ borderTop: i ? `1px solid ${T.line2}` : "none" }}>
            {variant === "avatar" ? (
              <div style={{ width: 32, height: 32, borderRadius: 999, background: T.tealSoft,
                color: T.teal, display: "grid", placeItems: "center", fontFamily: mono,
                fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{r.ini}</div>
            ) : (
              <div style={{ width: 32, height: 32, borderRadius: 9, background: `${r.color}1A`,
                display: "grid", placeItems: "center", flexShrink: 0 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: r.color }} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 13, fontWeight: 550, color: T.text, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
              <div style={{ fontFamily: mono, fontSize: 10.5, color: T.faint }}>
                {r.n} {variant === "tax" ? "lines" : "bills"}
                {variant === "tax" && (r.claim
                  ? <span style={{ color: T.claim }}> · claimable</span>
                  : <span style={{ color: T.exempt }}> · not claimable</span>)}
              </div>
            </div>
            <div style={{ ...num, fontSize: 12.5, fontWeight: 600, color: T.text,
              whiteSpace: "nowrap" }}>{fmt0(r.amt)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DropPill({ children }) {
  return (
    <button className="flex items-center gap-1.5 rounded-lg px-3 py-2 focus:outline-none"
      style={{ border: `1px solid ${T.line}`, background: T.surface, fontSize: 12.5,
        color: T.text, fontWeight: 500 }}>
      {children} <ChevronDown size={14} color={T.faint} />
    </button>
  );
}

/* ---- Live ledger strip — real data from the API, with graceful fallback --- */
function LiveLedgerStrip({ state }) {
  if (state.status === "loading") {
    return (
      <div className="rounded-2xl p-4 mb-4" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <span style={{ fontSize: 12.5, color: T.muted }}>Connecting to your ledger…</span>
      </div>
    );
  }
  if (state.status === "offline") {
    return (
      <div className="rounded-2xl p-4 mb-4 flex items-center gap-2.5 flex-wrap"
        style={{ background: T.warnSoft, border: "1px solid #E7D3A6" }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: T.warn, flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, color: T.warn, fontWeight: 550 }}>
          Live ledger offline — showing sample data below.</span>
        <span style={{ fontFamily: mono, fontSize: 10.5, color: T.faint, marginLeft: "auto" }}>{API_BASE}</span>
      </div>
    );
  }
  const d = state.data;
  const tiles = [
    ["Accounts payable", fmt(d.accountsPayable)],
    ["Cash & bank", fmt(d.cashAndBank)],
    ["Expenses", fmt(d.expenses)],
    ["Revenue (MTD)", fmt(d.revenueThisMonth.grandTotal)],
    ["Out of balance", fmt(d.outOfBalanceBy)],
  ];
  return (
    <div className="rounded-2xl p-4 sm:p-5 mb-4" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="flex items-center gap-2 mb-3.5">
        <span style={{ width: 8, height: 8, borderRadius: 999, background: T.claim,
          boxShadow: `0 0 0 3px ${T.claimSoft}` }} />
        <Eyebrow style={{ color: T.claim }}>Live from your ledger</Eyebrow>
        <span style={{ fontFamily: mono, fontSize: 10.5, color: T.faint, marginLeft: "auto" }}>
          {d.revenueThisMonth.from} – {d.revenueThisMonth.to}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <Eyebrow>{label}</Eyebrow>
            <div style={{ ...num, fontSize: 17, fontWeight: 650, color: T.text, marginTop: 4,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Dashboard({ onNav }) {
  const [state, setState] = useState({ status: "loading", data: null });
  useEffect(() => {
    let alive = true;
    getDashboard()
      .then((d) => alive && setState({ status: "live", data: d }))
      .catch(() => alive && setState({ status: "offline", data: null }));
    return () => { alive = false; };
  }, []);
  const d = state.data;
  const live = state.status === "live" && d;

  const catRows = live && d.spendByCategory?.length
    ? d.spendByCategory.map((r, i) => ({ ...r, color: CAT_COLORS[i % CAT_COLORS.length] }))
    : BY_CATEGORY;
  const vendorRows = live && d.spendByVendor?.length ? d.spendByVendor : BY_VENDOR;
  const taxRows = live && d.spendByTax?.length
    ? d.spendByTax.map((r) => ({ ...r, color: TAX_COLORS[r.name] || T.teal }))
    : BY_TAX;
  const trendData = live && d.spendTrend?.length ? d.spendTrend : TREND;
  const totalSpend = live ? fmt0(d.totalSpend) : "Rf 213,790";
  const billCount = live ? d.billCount : 26;
  const largest = live ? d.largestBill : { vendor: "Altura Pvt Ltd", amt: 98280, date: "05 Jul" };
  const delta = trendData.length >= 2 && trendData[trendData.length - 2].val
    ? Math.round((trendData[trendData.length - 1].val - trendData[trendData.length - 2].val) /
        trendData[trendData.length - 2].val * 100)
    : null;

  return (
    <div className="p-4 sm:p-6 lg:p-8" style={{ background: T.paper }}>
      <LiveLedgerStrip state={state} />
      {/* stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Accounts payable" value={live ? dec2(d.accountsPayable) : "45,230.00"} cur="MVR"
          sub={`${billCount} bills`} action="Review" onAction={() => onNav("bills")} />
        <StatCard label="Awaiting approval" value={live ? String(d.pendingApprovals) : "3"}
          sub="draft or AI-verified" accent={T.teal} />
        <StatCard label="Claimable input tax" value={live ? dec2(d.claimableInputTax) : "8,107.00"} cur="MVR"
          sub="toward MIRA 205" accent={T.claim} />
        <StatCard label="Inventory value" value="312,400" cur="MVR"
          sub="weighted average cost" />
      </div>

      {/* overview band */}
      <div className="flex items-center justify-between mt-7 mb-4 flex-wrap gap-3">
        <div style={{ fontSize: 17, fontWeight: 680, color: T.text }}>Overview</div>
        <div className="flex items-center gap-2">
          <DropPill>All vendors</DropPill>
          <DropPill>This month</DropPill>
        </div>
      </div>

      {/* chart + right rail */}
      <div className="rounded-2xl overflow-hidden" style={{ background: T.surface,
        border: `1px solid ${T.line}` }}>
        <div className="grid grid-cols-1 lg:grid-cols-3">
          <div className="lg:col-span-2 p-4 sm:p-6" style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 650, color: T.text, marginBottom: 14 }}>
              Purchase spending trend</div>
            <ResponsiveContainer width="100%" height={252}>
              <AreaChart data={trendData} margin={{ left: -14, right: 6, top: 4 }}>
                <defs>
                  <linearGradient id="fillTeal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.teal} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={T.teal} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={T.line2} />
                <XAxis dataKey="m" tick={{ fontSize: 10.5, fill: T.faint }}
                  axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={{ fontSize: 10, fill: T.faint, fontFamily: mono }} axisLine={false}
                  tickLine={false} width={40} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip cursor={{ stroke: T.teal, strokeWidth: 1, strokeDasharray: "3 3" }}
                  contentStyle={{ borderRadius: 10, border: `1px solid ${T.line}`,
                    fontFamily: mono, fontSize: 12 }}
                  formatter={(v) => [fmt0(v), "Spend"]} />
                <Area type="monotone" dataKey="val" stroke={T.teal} strokeWidth={2.5}
                  fill="url(#fillTeal)" dot={false}
                  activeDot={{ r: 5, fill: T.teal, stroke: "#fff", strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="p-5 sm:p-6 flex flex-col gap-5"
            style={{ borderLeft: `1px solid ${T.line}` }}>
            <div>
              <Eyebrow>Total spend</Eyebrow>
              <div style={{ ...num, fontSize: 24, fontWeight: 680, color: T.text,
                marginTop: 6, letterSpacing: "-0.02em" }}>{totalSpend}</div>
              <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>
                {billCount} bills{live ? " · all periods" : " · 1–31 Jul 2026"}</div>
              {delta !== null && (
                <div className="flex items-center gap-1 mt-2" style={{ ...num, fontSize: 11.5,
                  color: delta >= 0 ? T.exempt : T.claim, fontWeight: 600 }}>
                  {delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                  {delta >= 0 ? "+" : ""}{delta}% vs prev. month</div>
              )}
            </div>
            <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 18 }}>
              <Eyebrow>Largest bill</Eyebrow>
              <div style={{ ...num, fontSize: 20, fontWeight: 680, color: T.text, marginTop: 6 }}>
                {fmt0(largest.amt)}</div>
              <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>
                {largest.vendor} · {largest.date}</div>
              <button onClick={() => onNav("approval")}
                className="flex items-center gap-1.5 mt-3 focus:outline-none"
                style={{ fontSize: 12, color: T.teal, fontWeight: 600 }}>
                Open in approval queue <ArrowRight size={13} /></button>
            </div>
          </div>
        </div>

        {/* three breakdown columns */}
        <div className="grid grid-cols-1 md:grid-cols-3" style={{ borderTop: `1px solid ${T.line}` }}>
          <div className="p-5 sm:p-6" style={{ borderBottom: `1px solid ${T.line}` }}>
            <BreakdownList title="Spend by category" rows={catRows} variant="cat"
              onMore={() => onNav("reports")} />
          </div>
          <div className="p-5 sm:p-6"
            style={{ borderBottom: `1px solid ${T.line}` }}>
            <div className="md:border-l md:border-r md:px-6 md:-mx-6 md:h-full"
              style={{ borderColor: T.line }}>
              <BreakdownList title="Spend by vendor" rows={vendorRows} variant="avatar"
                onMore={() => onNav("vendors")} />
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <BreakdownList title="Spend by tax class" rows={taxRows} variant="tax"
              onMore={() => onNav("filing")} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Approval (tabbed on mobile, split on desktop)
--------------------------------------------------------------------------- */
function InvoiceReplica({ b, pad }) {
  return (
    <div className="mx-auto" style={{ background: "#fff", width: "100%", maxWidth: 460,
      border: `1px solid ${T.line}`, borderRadius: 6, boxShadow: "0 1px 3px rgba(11,42,46,0.06)",
      padding: pad }}>
      <div className="flex justify-between items-start" style={{ marginBottom: 20 }}>
        <div className="pr-3">
          <div style={{ fontWeight: 700, fontSize: 14.5, color: T.text }}>{b.vendor}</div>
          <div style={{ fontSize: 9.5, color: T.muted, lineHeight: 1.5, marginTop: 3 }}>
            Company ID : C05262022 · Tax ID : {b.tin}<br />6F, G. Velimaa, Majeedhee Magu, Male'</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: "0.12em", color: T.faint,
            textTransform: "uppercase" }}>Tax Invoice</div>
          <div style={{ fontFamily: mono, fontSize: 11.5, color: T.text, marginTop: 3 }}>{b.invoice}</div>
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${T.line}`, borderBottom: `1px solid ${T.line}`,
        padding: "10px 0", marginBottom: 14, display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div className="min-w-0">
          <div style={{ fontSize: 8.5, color: T.faint, textTransform: "uppercase",
            letterSpacing: "0.1em", fontFamily: mono }}>Bill to</div>
          <div style={{ fontSize: 10.5, color: T.text, marginTop: 3, fontWeight: 550 }}>
            Road Development Corporation Ltd</div>
          <div style={{ fontSize: 9, color: T.muted, fontFamily: mono }}>TIN 1110219GST501</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 9, color: T.muted, fontFamily: mono,
          whiteSpace: "nowrap" }}><div>Date : {b.date}</div><div>P.O.# : {b.po}</div></div>
      </div>
      <table style={{ width: "100%", fontSize: 10.5, color: T.text }}>
        <thead><tr style={{ color: T.faint, fontFamily: mono, fontSize: 8.5,
          textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <td style={{ paddingBottom: 6 }}>Item &amp; Description</td>
          <td style={{ textAlign: "right", paddingBottom: 6 }}>Qty</td>
          <td style={{ textAlign: "right", paddingBottom: 6 }}>Amount</td></tr></thead>
        <tbody><tr style={{ borderTop: `1px solid ${T.line}` }}>
          <td style={{ padding: "9px 0" }}>{b.line}</td>
          <td style={{ textAlign: "right", ...num }}>{b.qty.toFixed(2)}</td>
          <td style={{ textAlign: "right", ...num }}>
            {b.subtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td></tr></tbody>
      </table>
      <div style={{ marginTop: 12, marginLeft: "auto", width: 190, fontSize: 10.5 }}>
        {[["Sub Total", b.subtotal], [`GST (${b.rate}%)`, b.gst]].map(([k, v]) => (
          <div key={k} className="flex justify-between" style={{ padding: "3px 0", color: T.muted }}>
            <span>{k}</span><span style={num}>{v.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></div>
        ))}
        <div className="flex justify-between" style={{ padding: "7px 0", marginTop: 4,
          borderTop: `1.5px solid ${T.ink}`, fontWeight: 700, color: T.text }}>
          <span>Total MVR</span>
          <span style={num}>{b.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></div>
      </div>
    </div>
  );
}

function ExtractedField({ label, value, confidence }) {
  return (
    <div className="min-w-0">
      <Eyebrow>{label}</Eyebrow>
      <div className="flex items-center gap-2 mt-1.5">
        <div style={{ fontSize: 13.5, color: T.text, fontWeight: 550, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
        {confidence && <span style={{ width: 6, height: 6, borderRadius: 999, flexShrink: 0,
          background: confidence > 0.9 ? T.claim : T.warn }} />}
      </div>
    </div>
  );
}

function DataPanel({ b, onApprove, onReject, busy, error }) {
  const recomputed = +(b.subtotal * b.rate / 100).toFixed(2);
  const verified = Math.abs(recomputed - b.gst) < 0.01;
  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <Eyebrow>Extracted data</Eyebrow>
        <span className="flex items-center gap-1.5" style={{ fontFamily: mono, fontSize: 10.5,
          color: T.teal }}><Sparkles size={12} /> Claude · 94% confidence</span>
      </div>
      <div className="grid grid-cols-2 gap-y-4 gap-x-4 sm:gap-x-6 mb-6">
        <ExtractedField label="Vendor" value={b.vendor} confidence={0.96} />
        <ExtractedField label="Vendor TIN" value={b.tin} confidence={0.91} />
        <ExtractedField label="Invoice no." value={b.invoice} confidence={0.98} />
        <ExtractedField label="PO number" value={b.po} confidence={0.88} />
        <ExtractedField label="Invoice date" value={b.date} confidence={0.95} />
        <ExtractedField label="Currency" value={b.cur} confidence={0.99} />
      </div>
      <Eyebrow style={{ marginBottom: 8 }}>Line items · MIRA classification</Eyebrow>
      <div className="rounded-lg mb-5" style={{ border: `1px solid ${T.line}` }}>
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3">
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 12.5, color: T.text, fontWeight: 550 }}>{b.line}</div>
            <div style={{ fontFamily: mono, fontSize: 10.5, color: T.faint, marginTop: 2 }}>
              {b.qty} × {fmt(b.unit)}</div>
          </div>
          <TaxChip c={b.taxCat} />
          <div style={{ ...num, fontSize: 12.5, color: T.text, fontWeight: 600, textAlign: "right",
            whiteSpace: "nowrap" }}>{fmt(b.subtotal).replace("Rf ", "")}</div>
        </div>
      </div>
      <div className="rounded-lg p-4 mb-5 flex items-start gap-3"
        style={{ background: verified ? T.claimSoft : T.exemptSoft,
          border: `1px solid ${verified ? "#BFE0D2" : "#E8C9C2"}` }}>
        <ShieldCheck size={20} color={verified ? T.claim : T.exempt}
          style={{ marginTop: 1, flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 12.5, fontWeight: 650, color: verified ? T.claim : T.exempt }}>
            {verified ? "Tax verified" : "Tax mismatch — review"}</div>
          <div style={{ fontFamily: mono, fontSize: 10.5, color: T.muted, marginTop: 3,
            wordBreak: "break-word" }}>
            {b.rate}% × {b.subtotal.toLocaleString("en-US")} = {recomputed.toLocaleString("en-US",
              { minimumFractionDigits: 2 })} · matches invoice</div>
          {b.taxCat === "EXEMPT" && <div style={{ fontSize: 11, color: T.exempt, marginTop: 4 }}>
            Section 20 exempt — input tax <b>cannot</b> be claimed.</div>}
        </div>
      </div>
      <div className="rounded-lg p-4 mb-6" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        {[["Subtotal", b.subtotal], [`GST (${b.rate}%)`, b.gst]].map(([k, v]) => (
          <div key={k} className="flex justify-between py-1" style={{ fontSize: 12.5, color: T.muted }}>
            <span>{k}</span><span style={num}>{fmt(v)}</span></div>
        ))}
        <div className="flex justify-between pt-3 mt-2"
          style={{ borderTop: `1px solid ${T.line}`, fontWeight: 700, color: T.text }}>
          <span style={{ fontSize: 13 }}>Total payable</span>
          <span style={{ ...num, fontSize: 15 }}>{fmt(b.total)}</span></div>
      </div>
      {b.status === "ACCOUNTANT_APPROVED" ? (
        <div className="rounded-lg p-4 flex items-center gap-3"
          style={{ background: T.goldSoft, border: `1px solid #E7D3A6` }}>
          <div style={{ width: 30, height: 30, borderRadius: 999, background: T.gold,
            display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Check size={17} color={T.ink} strokeWidth={3} /></div>
          <div><div style={{ fontSize: 13, fontWeight: 650, color: T.warn }}>
            Approved &amp; queued for sync</div>
            <div style={{ fontFamily: mono, fontSize: 10.5, color: T.muted }}>
              ACCOUNTANT_APPROVED → pushing to Zoho Books</div></div>
        </div>
      ) : b.status === "REJECTED" ? (
        <div className="rounded-lg p-4 flex items-center gap-3"
          style={{ background: T.exemptSoft, border: "1px solid #E8C9C2" }}>
          <div style={{ width: 30, height: 30, borderRadius: 999, background: T.exempt,
            display: "grid", placeItems: "center", flexShrink: 0 }}>
            <X size={17} color="#fff" strokeWidth={3} /></div>
          <div><div style={{ fontSize: 13, fontWeight: 650, color: T.exempt }}>Rejected</div>
            <div style={{ fontFamily: mono, fontSize: 10.5, color: T.muted }}>
              REJECTED — removed from the approval queue</div></div>
        </div>
      ) : (
        <div>
        {error && (
          <div className="rounded-lg p-2.5 mb-3" style={{ background: T.exemptSoft,
            border: "1px solid #E8C9C2", fontSize: 11.5, color: T.exempt }}>{error}</div>
        )}
        <div className="flex gap-3">
          <button onClick={onReject} disabled={busy}
            className="rounded-lg px-4 flex items-center gap-2 focus:outline-none"
            style={{ border: `1px solid ${T.line}`, background: T.surface, color: T.muted,
              fontSize: 13, fontWeight: 550, minHeight: 46, opacity: busy ? 0.6 : 1 }}><X size={16} /> Reject</button>
          <button onClick={onApprove} disabled={busy}
            className="flex-1 rounded-lg px-4 flex items-center justify-center gap-2 transition-opacity hover:opacity-90 focus:outline-none"
            style={{ background: T.claim, color: "#fff", fontSize: 13, fontWeight: 600, minHeight: 46,
              opacity: busy ? 0.7 : 1 }}>
            <Check size={17} strokeWidth={2.5} /> {busy ? "Working…" : "Approve & sync"}</button>
        </div>
        </div>
      )}
      <div className="flex items-center justify-center gap-1.5 sm:gap-2 mt-4 flex-wrap"
        style={{ fontFamily: mono, fontSize: 10, color: T.faint }}>
        <span>DRAFT</span><ChevronRight size={11} />
        <span style={{ color: T.teal }}>AI_VERIFIED</span><ChevronRight size={11} />
        <span style={{ color: b.status === "ACCOUNTANT_APPROVED" ? T.claim : T.faint }}>APPROVED</span>
        <ChevronRight size={11} />
        <span style={{ color: T.faint }}>SYNCED</span>
      </div>
    </>
  );
}

function Approval({ session, onRequireLogin }) {
  const w = useW(); const desktop = w >= 1024;
  const [bills, setBills] = useState(BILLS);
  const [live, setLive] = useState(false);
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState("data");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function load() {
    try {
      const d = await getBills();
      if (Array.isArray(d) && d.length) { setBills(d); setLive(true); }
    } catch { /* keep current data */ }
  }
  useEffect(() => { load(); }, []);

  const queue = bills.filter((x) => x.status === "DRAFT" || x.status === "AI_VERIFIED");
  // Show the explicitly selected bill (even just-processed), else the first pending.
  const b = bills.find((x) => x.id === sel) || queue[0];

  async function act(action) {
    if (!b || busy) return;
    if (live && !session) { onRequireLogin(); return; }
    setBusy(true); setErr(null);
    setSel(b.id); // pin selection so the result shows on this bill
    try {
      if (live) {
        await (action === "approve" ? approveBill(b.id) : rejectBill(b.id));
        await load(); // refetch true state from the DB
      } else {
        const status = action === "approve" ? "ACCOUNTANT_APPROVED" : "REJECTED";
        setBills((prev) => prev.map((x) => (x.id === b.id ? { ...x, status } : x)));
      }
    } catch {
      setErr(`${action === "approve" ? "Approve" : "Reject"} failed — please sign in again.`);
    } finally {
      setBusy(false);
    }
  }
  const doApprove = () => act("approve");
  const doReject = () => act("reject");

  if (!b) {
    return (
      <div className="p-4 sm:p-8" style={{ background: T.paper }}>
        <div className="rounded-2xl p-8 sm:p-10 text-center max-w-md mx-auto"
          style={{ background: T.surface, border: `1px solid ${T.line}` }}>
          <CheckCircle2 size={30} color={T.claim} style={{ margin: "0 auto 12px" }} />
          <div style={{ fontSize: 15.5, fontWeight: 660, color: T.text }}>Approval queue clear</div>
          <div style={{ fontSize: 12.5, color: T.muted, marginTop: 5 }}>
            No bills awaiting review.</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ background: T.paper }}>
      <div className="flex items-center gap-2 px-4 sm:px-8 pt-3"
        style={{ background: T.surface }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: live ? T.claim : T.faint }} />
        <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
          color: live ? T.claim : T.faint }}>{live ? "LIVE" : "SAMPLE"}</span>
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: T.muted }}>
          {session ? (
            `Signed in as ${session.user?.email}`
          ) : live ? (
            <button onClick={onRequireLogin} className="focus:outline-none"
              style={{ color: T.teal, fontWeight: 600 }}>Sign in to approve</button>
          ) : "Sample data"}
        </span>
      </div>
      <div className="flex gap-2 px-4 sm:px-8 py-3 sm:py-4 overflow-x-auto"
        style={{ borderBottom: `1px solid ${T.line}`, background: T.surface }}>
        {queue.map((q) => {
          const on = q.id === sel;
          return (
            <button key={q.id} onClick={() => setSel(q.id)}
              className="rounded-lg px-3.5 py-2.5 text-left shrink-0 transition-colors focus:outline-none"
              style={{ border: `1px solid ${on ? T.teal : T.line}`,
                background: on ? T.tealSofter : T.surface, minWidth: 168 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.vendor}</div>
              <div className="flex items-center justify-between mt-1.5 gap-2">
                <span style={{ ...num, fontSize: 11, color: T.muted }}>{fmt(q.total)}</span>
                <StatusPill s={q.status} />
              </div>
            </button>
          );
        })}
      </div>
      {desktop ? (
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", minHeight: 620 }}>
          <div className="p-8" style={{ borderRight: `1px solid ${T.line}` }}>
            <div className="flex items-center justify-between mb-4">
              <Eyebrow>Source document</Eyebrow>
              <span className="flex items-center gap-1.5" style={{ fontFamily: mono, fontSize: 11,
                color: T.muted }}><FileText size={13} /> {b.invoice}.pdf</span>
            </div>
            <InvoiceReplica b={b} pad={30} />
          </div>
          <div className="p-8 flex flex-col">
            <DataPanel b={b} onApprove={doApprove} onReject={doReject} busy={busy} error={err} />
          </div>
        </div>
      ) : (
        <div className="p-4 sm:p-6" style={{ paddingBottom: 88 }}>
          <div className="flex p-1 rounded-lg mb-5" style={{ background: T.line2, gap: 4 }}>
            {[["data", "Extracted data"], ["doc", "Source document"]].map(([id, lab]) => {
              const on = tab === id;
              return (
                <button key={id} onClick={() => setTab(id)}
                  className="flex-1 rounded-md focus:outline-none transition-colors"
                  style={{ background: on ? T.surface : "transparent", color: on ? T.text : T.muted,
                    fontSize: 12.5, fontWeight: on ? 650 : 500, minHeight: 38,
                    boxShadow: on ? "0 1px 2px rgba(11,42,46,0.08)" : "none" }}>{lab}</button>
              );
            })}
          </div>
          {tab === "doc" ? (
            <div>
              <div className="flex items-center gap-1.5 mb-3" style={{ fontFamily: mono,
                fontSize: 11, color: T.muted }}><FileText size={13} /> {b.invoice}.pdf</div>
              <InvoiceReplica b={b} pad={20} />
            </div>
          ) : <DataPanel b={b} onApprove={doApprove} onReject={doReject} busy={busy} error={err} />}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Bills — table (md+) / cards (mobile)
--------------------------------------------------------------------------- */
const AGE = {
  current: ["Current", T.claim],
  "1_30": ["1–30 days", T.warn],
  "31_60": ["31–60 days", T.warn],
  "61_90": ["61–90 days", T.exempt],
  "90_plus": ["90+ days", T.exempt],
};
const ageOf = (k) => AGE[k] || AGE.current;

function Bills() {
  const w = useW(); const wide = w >= 768;
  const [bills, setBills] = useState(BILLS);
  const [live, setLive] = useState(false);
  useEffect(() => {
    let alive = true;
    getBills()
      .then((d) => { if (alive && Array.isArray(d) && d.length) { setBills(d); setLive(true); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return (
    <div className="p-4 sm:p-6 lg:p-8" style={{ background: T.paper }}>
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${T.line}`,
        background: T.surface }}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 gap-3"
          style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Eyebrow>Accounts payable</Eyebrow>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4,
                fontFamily: mono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em",
                color: live ? T.claim : T.faint }}>
                <span style={{ width: 6, height: 6, borderRadius: 999,
                  background: live ? T.claim : T.faint }} />
                {live ? "LIVE" : "SAMPLE"}
              </span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 620, color: T.text, marginTop: 2 }}>
              All bills &amp; expenses</div>
          </div>
          <button className="flex items-center gap-2 rounded-lg px-3 sm:px-3.5 focus:outline-none shrink-0"
            style={{ border: `1px solid ${T.line}`, fontSize: 12.5, color: T.muted, minHeight: 40 }}>
            <Download size={14} /> <span className="hidden sm:inline">Export for MIRA 205</span>
            <span className="sm:hidden">Export</span>
          </button>
        </div>
        {wide ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: T.paper }}>
              {["Vendor", "Invoice", "Date", "Tax", "Aging", "Status", "Total"].map((h, i) => (
                <th key={h} style={{ textAlign: i > 5 ? "right" : "left", padding: "11px 16px",
                  fontFamily: mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
                  color: T.faint, fontWeight: 600, borderBottom: `1px solid ${T.line}` }}>{h}</th>
              ))}</tr></thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id} style={{ borderBottom: `1px solid ${T.line2}` }}>
                  <td style={{ padding: "13px 16px" }}>
                    <div style={{ fontSize: 13, fontWeight: 550, color: T.text }}>{b.vendor}</div>
                    <div style={{ fontFamily: mono, fontSize: 10.5, color: T.faint }}>{b.cat}</div></td>
                  <td style={{ padding: "13px 16px", fontFamily: mono, fontSize: 12, color: T.muted }}>
                    {b.invoice}</td>
                  <td style={{ padding: "13px 16px", fontSize: 12.5, color: T.muted }}>{b.date}</td>
                  <td style={{ padding: "13px 16px" }}><TaxChip c={b.taxCat} /></td>
                  <td style={{ padding: "13px 16px" }}>
                    <span style={{ fontSize: 11.5, color: ageOf(b.aging)[1], fontWeight: 600 }}>
                      {ageOf(b.aging)[0]}</span></td>
                  <td style={{ padding: "13px 16px" }}><StatusPill s={b.status} /></td>
                  <td style={{ padding: "13px 16px", textAlign: "right", ...num, fontSize: 13,
                    fontWeight: 600, color: T.text }}>{fmt(b.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div>
            {bills.map((b, i) => (
              <div key={b.id} className="px-4 py-3.5"
                style={{ borderTop: i ? `1px solid ${T.line2}` : "none" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{b.vendor}</div>
                    <div style={{ fontFamily: mono, fontSize: 10.5, color: T.faint, marginTop: 1 }}>
                      {b.invoice} · {b.cat}</div></div>
                  <div style={{ ...num, fontSize: 14, fontWeight: 700, color: T.text,
                    whiteSpace: "nowrap" }}>{fmt(b.total)}</div>
                </div>
                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  <TaxChip c={b.taxCat} /><StatusPill s={b.status} />
                  <span style={{ fontSize: 11, color: ageOf(b.aging)[1], fontWeight: 600 }}>
                    · {ageOf(b.aging)[0]}</span>
                  <span style={{ fontFamily: mono, fontSize: 10.5, color: T.faint,
                    marginLeft: "auto" }}>due {b.due}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Vendors — directory with spend rollups
--------------------------------------------------------------------------- */
const VENDOR_DEMO = BY_VENDOR.map((v) => ({
  id: v.name, name: v.name, ini: v.ini, tin: "—", gstRegistered: true,
  currency: "MVR", billCount: v.n, totalSpend: v.amt, lastBillDate: "—",
}));

function Vendors() {
  const w = useW(); const wide = w >= 768;
  const [rows, setRows] = useState(VENDOR_DEMO);
  const [live, setLive] = useState(false);
  useEffect(() => {
    let alive = true;
    getVendors()
      .then((d) => { if (alive && Array.isArray(d) && d.length) { setRows(d); setLive(true); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const total = rows.reduce((s, v) => s + v.totalSpend, 0);
  return (
    <div className="p-4 sm:p-6 lg:p-8" style={{ background: T.paper }}>
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${T.line}`,
        background: T.surface }}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 gap-3"
          style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Eyebrow>Purchases</Eyebrow>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4,
                fontFamily: mono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em",
                color: live ? T.claim : T.faint }}>
                <span style={{ width: 6, height: 6, borderRadius: 999,
                  background: live ? T.claim : T.faint }} />{live ? "LIVE" : "SAMPLE"}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 620, color: T.text, marginTop: 2 }}>
              {rows.length} vendors</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <Eyebrow>Total spend</Eyebrow>
            <div style={{ ...num, fontSize: 15, fontWeight: 700, color: T.text, marginTop: 2 }}>
              {fmt0(total)}</div>
          </div>
        </div>
        {wide ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: T.paper }}>
              {["Vendor", "GST", "Bills", "Last activity", "Total spend"].map((h, i) => (
                <th key={h} style={{ textAlign: i > 3 ? "right" : "left", padding: "11px 16px",
                  fontFamily: mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
                  color: T.faint, fontWeight: 600, borderBottom: `1px solid ${T.line}` }}>{h}</th>
              ))}</tr></thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id} style={{ borderBottom: `1px solid ${T.line2}` }}>
                  <td style={{ padding: "13px 16px" }}>
                    <div className="flex items-center gap-3">
                      <div style={{ width: 32, height: 32, borderRadius: 999, background: T.tealSoft,
                        color: T.teal, display: "grid", placeItems: "center", fontFamily: mono,
                        fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{v.ini}</div>
                      <div className="min-w-0">
                        <div style={{ fontSize: 13, fontWeight: 550, color: T.text }}>{v.name}</div>
                        <div style={{ fontFamily: mono, fontSize: 10.5, color: T.faint }}>
                          TIN {v.tin}</div></div>
                    </div></td>
                  <td style={{ padding: "13px 16px" }}>
                    {v.gstRegistered
                      ? <span style={{ background: T.tealSoft, color: T.teal, fontFamily: mono,
                          fontSize: 11, padding: "3px 8px", borderRadius: 6, fontWeight: 600 }}>Registered</span>
                      : <span style={{ fontSize: 11.5, color: T.faint }}>—</span>}</td>
                  <td style={{ padding: "13px 16px", ...num, fontSize: 12.5, color: T.muted }}>
                    {v.billCount}</td>
                  <td style={{ padding: "13px 16px", fontSize: 12.5, color: T.muted }}>
                    {v.lastBillDate}</td>
                  <td style={{ padding: "13px 16px", textAlign: "right", ...num, fontSize: 13,
                    fontWeight: 600, color: T.text }}>{fmt(v.totalSpend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div>
            {rows.map((v, i) => (
              <div key={v.id} className="flex items-center gap-3 px-4 py-3.5"
                style={{ borderTop: i ? `1px solid ${T.line2}` : "none" }}>
                <div style={{ width: 34, height: 34, borderRadius: 999, background: T.tealSoft,
                  color: T.teal, display: "grid", placeItems: "center", fontFamily: mono,
                  fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{v.ini}</div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</div>
                  <div style={{ fontFamily: mono, fontSize: 10.5, color: T.faint }}>
                    {v.billCount} bills · {v.lastBillDate}</div></div>
                <div style={{ ...num, fontSize: 14, fontWeight: 700, color: T.text,
                  whiteSpace: "nowrap" }}>{fmt(v.totalSpend)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Tax filing — MIRA 205 (GGST) return
--------------------------------------------------------------------------- */
const FILING_STATUS = {
  FILED: { t: "Filed", bg: T.claimSoft, fg: T.claim },
  DUE_SOON: { t: "Due soon", bg: T.goldSoft, fg: T.warn },
  UPCOMING: { t: "Upcoming", bg: "#EEF1EF", fg: T.muted },
  OVERDUE: { t: "Overdue", bg: T.exemptSoft, fg: T.exempt },
  EXPORTED: { t: "Exported", bg: T.tealSoft, fg: T.teal },
};
const FilingChip = ({ s }) => {
  const x = FILING_STATUS[s] || FILING_STATUS.UPCOMING;
  return <span style={{ background: x.bg, color: x.fg, fontFamily: mono, fontSize: 11,
    padding: "3px 9px", borderRadius: 999, fontWeight: 600, whiteSpace: "nowrap" }}>{x.t}</span>;
};
const F0 = { sales8: 0, salesZero: 0, salesExempt: 0, salesOos: 0 };
const FILING_DEMO = [
  { id: "f-3", form: "MIRA_205_GGST", periodStart: "2026-05-01", periodEnd: "2026-05-31", dueDate: "2026-06-28", status: "FILED", ...F0, outputTax: 0, inputTax: 844.37, netPayable: -844.37 },
  { id: "f-4", form: "MIRA_205_GGST", periodStart: "2026-06-01", periodEnd: "2026-06-30", dueDate: "2026-07-28", status: "DUE_SOON", ...F0, outputTax: 0, inputTax: 338.7, netPayable: -338.7 },
  { id: "f-5", form: "MIRA_205_GGST", periodStart: "2026-07-01", periodEnd: "2026-07-31", dueDate: "2026-08-28", status: "UPCOMING", ...F0, sales8: 81, outputTax: 6, inputTax: 7280, netPayable: -7274 },
  { id: "f-6", form: "MIRA_205_GGST", periodStart: "2026-08-01", periodEnd: "2026-08-31", dueDate: "2026-09-28", status: "UPCOMING", ...F0, outputTax: 0, inputTax: 0, netPayable: 0 },
];

// MIRA 205 boxes for a filing period. Amounts are rounded to the nearest
// Rufiyaa, matching the official return.
function mira205Boxes(f) {
  const r = (n) => Math.round(n);
  const totalSales = f.sales8 + f.salesZero + f.salesExempt + f.salesOos;
  const liability = f.outputTax - f.inputTax; // Box 6 − Box 7 (Box 8 = Box 9 = 0)
  return [
    ["1", "Sales of supplies subject to GST at 8% (inclusive of GST)", r(f.sales8)],
    ["2", "Sales of zero-rated supplies", r(f.salesZero)],
    ["3", "Sales of exempt supplies", r(f.salesExempt)],
    ["4", "Sales of supplies which are out of scope of GST", r(f.salesOos)],
    ["5", "Total sales (Sum of Boxes 1 to 4)", r(totalSales)],
    ["6", "Output tax", r(f.outputTax)],
    ["7", "Input tax", r(f.inputTax)],
    ["8", "GST re irrecoverable debts / rate-change credit notes", 0],
    ["9", "GST collected in excess", 0],
    ["10", "GST LIABILITY FOR THE PERIOD (Box 6 − Box 7 − Box 8 + Box 9)", r(liability)],
    ["11", "Amount of GST being paid", r(Math.max(0, liability))],
  ];
}

function exportFilingCsv(f) {
  const header = [
    ["MIRA 205 — GST Return (General Goods and Services)"],
    ["Taxable period", `${f.periodStart} to ${f.periodEnd}`],
    ["Due date", f.dueDate],
    ["Amounts in Rufiyaa (rounded to the nearest Rufiyaa)"],
    [],
    ["Box", "Description", "Amount (MVR)"],
  ];
  const rows = header.concat(mira205Boxes(f));
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = `MIRA205-${f.periodStart}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function TaxFiling() {
  const w = useW(); const wide = w >= 768;
  const [filings, setFilings] = useState(FILING_DEMO);
  const [taxpayer, setTaxpayer] = useState({ name: "Kashikeyo Demo Co", tin: "" });
  const [live, setLive] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    getTaxFiling()
      .then((d) => {
        if (!alive || !d?.filings?.length) return;
        setFilings(d.filings); setLive(true);
        if (d.taxpayer) setTaxpayer(d.taxpayer);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  async function downloadPdf(f) {
    setPdfBusy(true);
    try { await exportFilingPdf(f, taxpayer); }
    catch { exportFilingCsv(f); } // fall back to CSV if the form can't be filled
    finally { setPdfBusy(false); }
  }
  const current = filings.find((f) => f.status !== "FILED") || filings[filings.length - 1];
  const daysToDue = current
    ? Math.ceil((Date.parse(`${current.dueDate}T00:00:00Z`) - Date.now()) / 86_400_000)
    : 0;
  const payable = current && current.netPayable > 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8" style={{ background: T.paper }}>
      <div className="flex items-center gap-2 mb-4">
        <Eyebrow>GST filing</Eyebrow>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: mono,
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", color: live ? T.claim : T.faint }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: live ? T.claim : T.faint }} />
          {live ? "LIVE" : "SAMPLE"}</span>
        <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 11, color: T.faint }}>
          MIRA 205 · GGST 8%</span>
      </div>

      {current && (
        <div className="rounded-2xl p-5 sm:p-6 mb-5" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div style={{ fontSize: 17, fontWeight: 680, color: T.text }}>{monthLabel(current.periodStart)}</div>
              <div className="flex items-center gap-2 mt-1.5">
                <FilingChip s={current.status} />
                <span style={{ fontSize: 12, color: daysToDue < 0 ? T.exempt : T.muted }}>
                  due {fmtDate(current.dueDate)}
                  {daysToDue >= 0 ? ` · in ${daysToDue} days` : ` · ${-daysToDue} days overdue`}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => exportFilingCsv(current)}
                className="rounded-lg px-3 focus:outline-none transition-colors"
                style={{ border: `1px solid ${T.line}`, color: T.muted, fontSize: 12.5, fontWeight: 600, minHeight: 42 }}>
                CSV</button>
              <button onClick={() => downloadPdf(current)} disabled={pdfBusy}
                className="flex items-center gap-2 rounded-lg px-3.5 focus:outline-none transition-opacity hover:opacity-90"
                style={{ background: T.ink, color: "#fff", fontSize: 12.5, fontWeight: 600, minHeight: 42,
                  opacity: pdfBusy ? 0.7 : 1 }}>
                <Download size={15} /> {pdfBusy ? "Filling…" : "Export MIRA 205 (PDF)"}</button>
            </div>
          </div>
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <Eyebrow>MIRA 205 · return boxes</Eyebrow>
              <span style={{ fontFamily: mono, fontSize: 10, color: T.faint }}>Rufiyaa (rounded)</span>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
              {mira205Boxes(current).map(([n, label, amt], i) => {
                const hi = n === "10";
                return (
                  <div key={n} className="flex items-center gap-3 px-3 sm:px-4 py-2.5"
                    style={{ borderTop: i ? `1px solid ${T.line2}` : "none",
                      background: hi ? (payable ? T.warnSoft : T.claimSoft) : T.surface }}>
                    <span style={{ width: 20, height: 20, borderRadius: 999, flexShrink: 0,
                      background: hi ? (payable ? T.warn : T.claim) : T.line2,
                      color: hi ? "#fff" : T.muted, display: "grid", placeItems: "center",
                      fontFamily: mono, fontSize: 10, fontWeight: 700 }}>{n}</span>
                    <span style={{ flex: 1, fontSize: 12.5, color: T.text,
                      fontWeight: hi ? 650 : 450 }}>{label}</span>
                    <span style={{ ...num, fontSize: 13, fontWeight: hi ? 700 : 600, whiteSpace: "nowrap",
                      color: hi ? (payable ? T.warn : T.claim) : T.text }}>
                      {Number(amt).toLocaleString("en-US")}</span>
                  </div>
                );
              })}
            </div>
            {!payable && current.netPayable !== 0 && (
              <div style={{ fontSize: 11, color: T.claim, marginTop: 6 }}>
                Box 10 is negative — a net input-tax credit carried to the next period.</div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-2xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div className="px-4 sm:px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontSize: 14.5, fontWeight: 650, color: T.text }}>Filing calendar</div>
        </div>
        {wide ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: T.paper }}>
              {["Period", "Due date", "Status", "Output", "Input", "Net"].map((h, i) => (
                <th key={h} style={{ textAlign: i > 2 ? "right" : "left", padding: "11px 16px",
                  fontFamily: mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
                  color: T.faint, fontWeight: 600, borderBottom: `1px solid ${T.line}` }}>{h}</th>
              ))}</tr></thead>
            <tbody>
              {filings.map((f) => (
                <tr key={f.id} style={{ borderBottom: `1px solid ${T.line2}` }}>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: T.text }}>{monthLabel(f.periodStart)}</td>
                  <td style={{ padding: "12px 16px", fontSize: 12.5, color: T.muted }}>{fmtDate(f.dueDate)}</td>
                  <td style={{ padding: "12px 16px" }}><FilingChip s={f.status} /></td>
                  <td style={{ padding: "12px 16px", textAlign: "right", ...num, fontSize: 12.5, color: T.muted }}>{fmt(f.outputTax).replace("Rf ", "")}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", ...num, fontSize: 12.5, color: T.muted }}>{fmt(f.inputTax).replace("Rf ", "")}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", ...num, fontSize: 13, fontWeight: 600,
                    color: f.netPayable > 0 ? T.warn : T.claim }}>{fmt(f.netPayable).replace("Rf ", "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div>
            {filings.map((f, i) => (
              <div key={f.id} className="px-4 py-3.5" style={{ borderTop: i ? `1px solid ${T.line2}` : "none" }}>
                <div className="flex items-center justify-between gap-2">
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{monthLabel(f.periodStart)}</div>
                  <div style={{ ...num, fontSize: 13.5, fontWeight: 700,
                    color: f.netPayable > 0 ? T.warn : T.claim }}>{fmt(f.netPayable)}</div>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <FilingChip s={f.status} />
                  <span style={{ fontFamily: mono, fontSize: 10.5, color: T.faint, marginLeft: "auto" }}>
                    due {fmtDate(f.dueDate)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Inventory — perpetual stock with weighted-average cost
--------------------------------------------------------------------------- */
const STOCK_STATUS = {
  in_stock: { t: "In stock", bg: T.claimSoft, fg: T.claim },
  low: { t: "Low", bg: T.goldSoft, fg: T.warn },
  out: { t: "Out", bg: T.exemptSoft, fg: T.exempt },
};
const StockChip = ({ s }) => {
  const x = STOCK_STATUS[s] || STOCK_STATUS.in_stock;
  return <span style={{ background: x.bg, color: x.fg, fontFamily: mono, fontSize: 11,
    padding: "3px 9px", borderRadius: 999, fontWeight: 600, whiteSpace: "nowrap" }}>{x.t}</span>;
};
const INVENTORY_DEMO = {
  items: [
    { id: "1", sku: "MIX-01", name: "Concrete Mixer (50KG)", unit: "unit", qtyOnHand: 3, avgCost: 91000, stockValue: 273000, threshold: 2, status: "in_stock" },
    { id: "2", sku: "CEM-50", name: "Cement (50kg bag)", unit: "bag", qtyOnHand: 120, avgCost: 95, stockValue: 11400, threshold: 40, status: "in_stock" },
    { id: "3", sku: "GRV-M3", name: "Gravel", unit: "m3", qtyOnHand: 15, avgCost: 520, stockValue: 7800, threshold: 8, status: "in_stock" },
    { id: "4", sku: "RBR-12", name: "Steel Rebar 12mm", unit: "length", qtyOnHand: 30, avgCost: 180, stockValue: 5400, threshold: 50, status: "low" },
    { id: "5", sku: "PVC-04", name: 'PVC Pipe 4"', unit: "length", qtyOnHand: 8, avgCost: 120, stockValue: 960, threshold: 20, status: "low" },
    { id: "6", sku: "SND-M3", name: "Sand", unit: "m3", qtyOnHand: 0, avgCost: 450, stockValue: 0, threshold: 10, status: "out" },
  ],
  totalValue: 304179.96, lowCount: 2, outCount: 1,
};

function Inventory() {
  const w = useW(); const wide = w >= 768;
  const [data, setData] = useState(INVENTORY_DEMO);
  const [live, setLive] = useState(false);
  useEffect(() => {
    let alive = true;
    getInventory()
      .then((d) => { if (alive && d?.items) { setData(d); setLive(true); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return (
    <div className="p-4 sm:p-6 lg:p-8" style={{ background: T.paper }}>
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-5">
        <KpiTile label="Inventory value" value={fmt0(data.totalValue)} accent={T.text} />
        <KpiTile label="Low stock" value={String(data.lowCount)} accent={data.lowCount ? T.warn : T.text} />
        <KpiTile label="Out of stock" value={String(data.outCount)} accent={data.outCount ? T.exempt : T.text} />
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${T.line}`, background: T.surface }}>
        <div className="flex items-center gap-2 px-4 sm:px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontSize: 14.5, fontWeight: 650, color: T.text }}>Stock on hand</div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: mono,
            fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", color: live ? T.claim : T.faint }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: live ? T.claim : T.faint }} />
            {live ? "LIVE" : "SAMPLE"}</span>
          <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 10.5, color: T.faint }}>
            weighted-average cost</span>
        </div>
        {wide ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: T.paper }}>
              {["Item", "On hand", "Avg cost", "Stock value", "Status"].map((h, i) => (
                <th key={h} style={{ textAlign: i > 0 && i < 4 ? "right" : "left", padding: "11px 16px",
                  fontFamily: mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
                  color: T.faint, fontWeight: 600, borderBottom: `1px solid ${T.line}` }}>{h}</th>
              ))}</tr></thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.id} style={{ borderBottom: `1px solid ${T.line2}` }}>
                  <td style={{ padding: "13px 16px" }}>
                    <div style={{ fontSize: 13, fontWeight: 550, color: T.text }}>{it.name}</div>
                    <div style={{ fontFamily: mono, fontSize: 10.5, color: T.faint }}>{it.sku}</div></td>
                  <td style={{ padding: "13px 16px", textAlign: "right", ...num, fontSize: 12.5, color: T.text }}>
                    {it.qtyOnHand} <span style={{ color: T.faint, fontSize: 10.5 }}>{it.unit}</span></td>
                  <td style={{ padding: "13px 16px", textAlign: "right", ...num, fontSize: 12.5, color: T.muted }}>
                    {fmt(it.avgCost).replace("Rf ", "")}</td>
                  <td style={{ padding: "13px 16px", textAlign: "right", ...num, fontSize: 13, fontWeight: 600, color: T.text }}>
                    {fmt(it.stockValue).replace("Rf ", "")}</td>
                  <td style={{ padding: "13px 16px" }}><StockChip s={it.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div>
            {data.items.map((it, i) => (
              <div key={it.id} className="px-4 py-3.5" style={{ borderTop: i ? `1px solid ${T.line2}` : "none" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{it.name}</div>
                    <div style={{ fontFamily: mono, fontSize: 10.5, color: T.faint, marginTop: 1 }}>
                      {it.sku} · {it.qtyOnHand} {it.unit}</div></div>
                  <div style={{ ...num, fontSize: 14, fontWeight: 700, color: T.text, whiteSpace: "nowrap" }}>
                    {fmt(it.stockValue)}</div>
                </div>
                <div className="mt-2"><StockChip s={it.status} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Banking — bank accounts + statement reconciliation
--------------------------------------------------------------------------- */
const RECON_META = {
  MATCHED: { t: "Matched", bg: T.claimSoft, fg: T.claim },
  SUGGESTED: { t: "Suggested", bg: T.goldSoft, fg: T.warn },
  UNMATCHED: { t: "Unmatched", bg: T.exemptSoft, fg: T.exempt },
  EXCLUDED: { t: "Excluded", bg: "#EEF1EF", fg: T.muted },
};
const ReconChip = ({ s }) => {
  const x = RECON_META[s] || RECON_META.UNMATCHED;
  return <span style={{ background: x.bg, color: x.fg, fontFamily: mono, fontSize: 11,
    padding: "3px 9px", borderRadius: 999, fontWeight: 600, whiteSpace: "nowrap" }}>{x.t}</span>;
};
const BANKING_DEMO = {
  currency: "MVR", mvrBalance: 246048.63,
  summary: { total: 13, unmatched: 4, suggested: 3, matched: 4, excluded: 2, unreconciled: 7 },
  accounts: [
    { id: "ba-mvr", name: "Business Current", bankName: "Bank of Maldives", accountMasked: "•••• 4021", currency: "MVR", linkedAccount: true, balance: 246048.63, txnCount: 11, unreconciled: 5 },
    { id: "ba-usd", name: "USD Settlement", bankName: "Bank of Maldives", accountMasked: "•••• 8837", currency: "USD", linkedAccount: false, balance: 9750, txnCount: 2, unreconciled: 2 },
  ],
  transactions: [
    { id: "bt-1", accountName: "Business Current", date: "12 Jul 2026", type: "TRANSFER", reference: "FT26071240", counterparty: "Card Settlement", narrative: "POS card settlement — BML Merchant", direction: "CREDIT", amount: 27300, currency: "MVR", reconStatus: "SUGGESTED", matchedVendor: null },
    { id: "bt-2", accountName: "Business Current", date: "10 Jul 2026", type: "TRANSFER", reference: "FT26071005", counterparty: "Payroll", narrative: "Staff salary — July", direction: "DEBIT", amount: -12000, currency: "MVR", reconStatus: "EXCLUDED", matchedVendor: null },
    { id: "bt-3", accountName: "Business Current", date: "06 Jul 2026", type: "TRANSFER", reference: "FT26070619", counterparty: "Island Choice LLP", narrative: "Payment IC-7781", direction: "DEBIT", amount: -232.2, currency: "MVR", reconStatus: "MATCHED", matchedVendor: "Island Choice LLP" },
    { id: "bt-4", accountName: "Business Current", date: "02 Jul 2026", type: "TRANSFER", reference: "FT26070211", counterparty: "MTCC", narrative: "Incoming transfer", direction: "CREDIT", amount: 18750, currency: "MVR", reconStatus: "UNMATCHED", matchedVendor: null },
    { id: "bt-5", accountName: "Business Current", date: "28 Jun 2026", type: "TRANSFER", reference: "FT26062830", counterparty: "Beaver Builders", narrative: "Transfer", direction: "DEBIT", amount: -4572.42, currency: "MVR", reconStatus: "UNMATCHED", matchedVendor: null },
    { id: "bt-7", accountName: "Business Current", date: "18 Jun 2026", type: "TRANSFER", reference: "FT26061808", counterparty: "Ives Private Limited", narrative: "Supplier payment", direction: "DEBIT", amount: -6522.75, currency: "MVR", reconStatus: "SUGGESTED", matchedVendor: "Ives Private Limited" },
    { id: "bt-10", accountName: "Business Current", date: "05 Jun 2026", type: "TRANSFER", reference: "FT26060544", counterparty: "Altura Pvt Ltd", narrative: "Payment ALT/INV-000024", direction: "DEBIT", amount: -98280, currency: "MVR", reconStatus: "MATCHED", matchedVendor: "Altura Pvt Ltd" },
    { id: "bt-12", accountName: "USD Settlement", date: "08 Jul 2026", type: "WIRE", reference: "TT26070801", counterparty: "Export Receipt", narrative: "Inbound settlement", direction: "CREDIT", amount: 3200, currency: "USD", reconStatus: "UNMATCHED", matchedVendor: null },
    { id: "bt-13", accountName: "USD Settlement", date: "20 Jun 2026", type: "WIRE", reference: "TT26062001", counterparty: "Overseas Supplier", narrative: "Import wire", direction: "DEBIT", amount: -1450, currency: "USD", reconStatus: "UNMATCHED", matchedVendor: null },
  ],
};
const BANK_FILTERS = [
  ["all", "All"],
  ["review", "Needs review"],
  ["MATCHED", "Matched"],
  ["EXCLUDED", "Excluded"],
];

function Banking() {
  const w = useW(); const wide = w >= 768;
  const [data, setData] = useState(BANKING_DEMO);
  const [live, setLive] = useState(false);
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    let alive = true;
    getBanking()
      .then((d) => { if (alive && d?.accounts) { setData(d); setLive(true); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const s = data.summary || { total: 0, matched: 0, unreconciled: 0 };
  const txns = data.transactions.filter((t) =>
    filter === "all" ? true
      : filter === "review" ? ["UNMATCHED", "SUGGESTED"].includes(t.reconStatus)
        : t.reconStatus === filter);

  return (
    <div className="p-4 sm:p-6 lg:p-8" style={{ background: T.paper }}>
      <div className="flex items-center gap-2 mb-4">
        <Eyebrow>Banking &amp; reconciliation</Eyebrow>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: mono,
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", color: live ? T.claim : T.faint }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: live ? T.claim : T.faint }} />
          {live ? "LIVE" : "SAMPLE"}</span>
      </div>

      {/* Account cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
        {data.accounts.map((a) => (
          <div key={a.id} className="rounded-2xl p-5" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div style={{ width: 38, height: 38, borderRadius: 11, background: T.tealSoft,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Landmark size={18} color={T.teal} />
                </div>
                <div className="min-w-0">
                  <div style={{ fontSize: 14, fontWeight: 650, color: T.text }}>{a.name}</div>
                  <div style={{ fontFamily: mono, fontSize: 11, color: T.faint }}>
                    {a.bankName} · {a.accountMasked}</div>
                </div>
              </div>
              <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
                color: a.linkedAccount ? T.claim : T.faint, display: "inline-flex", alignItems: "center", gap: 3,
                whiteSpace: "nowrap" }}>
                <Link2 size={11} />{a.linkedAccount ? "Linked" : "Unlinked"}</span>
            </div>
            <div className="flex items-end justify-between mt-4">
              <div>
                <Eyebrow>Balance</Eyebrow>
                <div style={{ ...num, fontSize: 22, fontWeight: 680, color: T.text,
                  letterSpacing: "-0.02em", marginTop: 3 }}>
                  {fmt(a.balance, a.currency)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ ...num, fontSize: 12.5, color: T.muted }}>{a.txnCount} lines</div>
                <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 600,
                  color: a.unreconciled ? T.warn : T.claim, marginTop: 2 }}>
                  {a.unreconciled ? `${a.unreconciled} to review` : "reconciled"}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Reconciliation summary */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-5">
        <KpiTile label="Statement lines" value={String(s.total)} accent={T.text} />
        <KpiTile label="Matched" value={String(s.matched)} accent={s.matched ? T.claim : T.text} />
        <KpiTile label="To reconcile" value={String(s.unreconciled)} accent={s.unreconciled ? T.warn : T.claim} />
      </div>

      {/* Transactions */}
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${T.line}`, background: T.surface }}>
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontSize: 14.5, fontWeight: 650, color: T.text }}>Bank statement</div>
          <div className="flex items-center gap-1.5" style={{ marginLeft: "auto" }}>
            {BANK_FILTERS.map(([id, label]) => {
              const on = filter === id;
              return (
                <button key={id} onClick={() => setFilter(id)}
                  style={{ fontFamily: mono, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.03em",
                    padding: "5px 11px", borderRadius: 999, cursor: "pointer",
                    border: `1px solid ${on ? T.teal : T.line}`,
                    background: on ? T.teal : T.surface, color: on ? "#fff" : T.muted }}>
                  {label}</button>
              );
            })}
          </div>
        </div>
        {wide ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: T.paper }}>
              {["Date", "Description", "Match", "Amount", "Status"].map((h, i) => (
                <th key={h} style={{ textAlign: i === 3 ? "right" : "left", padding: "11px 16px",
                  fontFamily: mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
                  color: T.faint, fontWeight: 600, borderBottom: `1px solid ${T.line}` }}>{h}</th>
              ))}</tr></thead>
            <tbody>
              {txns.map((t) => {
                const inflow = t.amount >= 0;
                return (
                  <tr key={t.id} style={{ borderBottom: `1px solid ${T.line2}` }}>
                    <td style={{ padding: "13px 16px", whiteSpace: "nowrap" }}>
                      <div style={{ ...num, fontSize: 12, color: T.text }}>{t.date}</div>
                      <div style={{ fontFamily: mono, fontSize: 10, color: T.faint }}>{t.accountName}</div></td>
                    <td style={{ padding: "13px 16px" }}>
                      <div style={{ fontSize: 13, fontWeight: 550, color: T.text }}>{t.counterparty}</div>
                      <div style={{ fontFamily: mono, fontSize: 10.5, color: T.faint }}>
                        {t.reference} · {t.narrative}</div></td>
                    <td style={{ padding: "13px 16px" }}>
                      {t.matchedVendor
                        ? <span style={{ fontSize: 12, color: T.muted }}>{t.matchedVendor}</span>
                        : <span style={{ fontFamily: mono, fontSize: 11, color: T.faint }}>—</span>}</td>
                    <td style={{ padding: "13px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, ...num,
                        fontSize: 13, fontWeight: 650, color: inflow ? T.claim : T.text }}>
                        {inflow ? <ArrowDownLeft size={13} color={T.claim} /> : <ArrowUpRight size={13} color={T.faint} />}
                        {inflow ? "+" : "−"}{fmt(Math.abs(t.amount), t.currency)}</span></td>
                    <td style={{ padding: "13px 16px" }}><ReconChip s={t.reconStatus} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div>
            {txns.map((t, i) => {
              const inflow = t.amount >= 0;
              return (
                <div key={t.id} className="px-4 py-3.5" style={{ borderTop: i ? `1px solid ${T.line2}` : "none" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{t.counterparty}</div>
                      <div style={{ fontFamily: mono, fontSize: 10.5, color: T.faint, marginTop: 1 }}>
                        {t.date} · {t.accountName}</div></div>
                    <div style={{ ...num, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap",
                      color: inflow ? T.claim : T.text }}>
                      {inflow ? "+" : "−"}{fmt(Math.abs(t.amount), t.currency)}</div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <ReconChip s={t.reconStatus} />
                    {t.matchedVendor && <span style={{ fontSize: 11.5, color: T.muted }}>{t.matchedVendor}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {txns.length === 0 && (
          <div style={{ padding: "28px 16px", textAlign: "center", fontFamily: mono, fontSize: 12, color: T.faint }}>
            No lines in this view.</div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Reports — financial KPIs, AP aging, spend analysis
--------------------------------------------------------------------------- */
const AGING_META = {
  current: ["Current", T.claim],
  "1_30": ["1–30 days", T.warn],
  "31_60": ["31–60 days", T.warn],
  "61_90": ["61–90 days", T.exempt],
  "90_plus": ["90+ days", T.exempt],
};
const REPORT_DEMO = {
  kpis: { totalSpend: 120060.37, billCount: 6, revenueThisMonth: 3561, salesCount: 1,
    expenses: 150, cashAndBank: -150, accountsPayable: 0, claimableInputTax: 8463.07,
    gstNetPosition: -338.7, outOfBalanceBy: 0 },
  apAging: [
    { bucket: "current", amount: 98280, count: 1 },
    { bucket: "1_30", amount: 4572.42, count: 1 },
    { bucket: "31_60", amount: 11398.95, count: 3 },
    { bucket: "61_90", amount: 0, count: 0 },
    { bucket: "90_plus", amount: 5809, count: 1 },
  ],
  spendByCategory: BY_CATEGORY.map((c) => ({ name: c.name, n: c.n, amt: c.amt })),
};

function KpiTile({ label, value, cur, accent }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <Eyebrow>{label}</Eyebrow>
      <div className="flex items-end gap-1.5 mt-2.5">
        <div style={{ ...num, fontSize: 20, fontWeight: 680, color: accent || T.text,
          letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
        {cur && <span style={{ fontFamily: mono, fontSize: 10.5, color: T.faint, marginBottom: 1 }}>{cur}</span>}
      </div>
    </div>
  );
}

function Reports() {
  const w = useW(); const wide = w >= 768;
  const [data, setData] = useState(REPORT_DEMO);
  const [live, setLive] = useState(false);
  useEffect(() => {
    let alive = true;
    getReports()
      .then((d) => { if (alive && d?.kpis) { setData(d); setLive(true); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const k = data.kpis;
  const maxAging = Math.max(1, ...data.apAging.map((a) => a.amount));
  const catRows = data.spendByCategory.map((c, i) => ({ ...c, color: CAT_COLORS[i % CAT_COLORS.length] }));
  const gstPayable = k.gstNetPosition > 0;

  const tiles = [
    ["Total spend", fmt0(k.totalSpend), null, T.text],
    ["Revenue (MTD)", fmt0(k.revenueThisMonth), null, T.claim],
    ["Expenses", fmt0(k.expenses), null, T.text],
    ["Cash & bank", fmt0(k.cashAndBank), null, k.cashAndBank < 0 ? T.exempt : T.text],
    ["Accounts payable", fmt0(k.accountsPayable), null, T.warn],
    ["Claimable input tax", fmt0(k.claimableInputTax), null, T.claim],
    [gstPayable ? "GST payable" : "GST credit", fmt0(Math.abs(k.gstNetPosition)), null, gstPayable ? T.warn : T.claim],
    ["Out of balance", fmt(k.outOfBalanceBy), null, k.outOfBalanceBy === 0 ? T.claim : T.exempt],
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8" style={{ background: T.paper }}>
      <div className="flex items-center gap-2 mb-4">
        <Eyebrow>Financial reports</Eyebrow>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: mono,
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", color: live ? T.claim : T.faint }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: live ? T.claim : T.faint }} />
          {live ? "LIVE" : "SAMPLE"}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {tiles.map(([label, value, cur, accent]) => (
          <KpiTile key={label} label={label} value={value} cur={cur} accent={accent} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
        {/* AP aging */}
        <div className="rounded-2xl p-5 sm:p-6" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
          <div style={{ fontSize: 14.5, fontWeight: 650, color: T.text, marginBottom: 16 }}>
            Accounts payable — aging</div>
          <div className="flex flex-col gap-3.5">
            {data.apAging.map((a) => {
              const [label, color] = AGING_META[a.bucket] || ["—", T.muted];
              return (
                <div key={a.bucket}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span style={{ fontSize: 12.5, color: T.text, fontWeight: 500 }}>{label}
                      <span style={{ fontFamily: mono, fontSize: 10.5, color: T.faint }}> · {a.count}</span></span>
                    <span style={{ ...num, fontSize: 12.5, fontWeight: 600, color: T.text }}>{fmt0(a.amount)}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: T.line2, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 999, background: color,
                      width: `${Math.max(a.amount > 0 ? 3 : 0, (a.amount / maxAging) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Spend by category */}
        <div className="rounded-2xl p-5 sm:p-6" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
          <BreakdownList title="Spend by category" rows={catRows} variant="cat" onMore={() => {}} />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Placeholder
--------------------------------------------------------------------------- */
const PLACE = {
  inventory: [Package, "Perpetual inventory",
    ["Real-time stock from incoming purchase bills",
     "Weighted average cost valuation, synced to COGS on POS sales",
     "SKU management and low-stock reorder alerts"]],
  banking: [Landmark, "Banking & reconciliation",
    ["Import BML statements (CSV / PDF), deduplicated on re-import",
     "Auto-match bank lines to payments — exact, fuzzy, then rules",
     "Bulk-confirm suggested matches in one review pass"]],
  filing: [CalendarClock, "Tax filing calendar",
    ["MIRA 205 (GGST) & 206 (TGST) reminders on your taxable period",
     "Income tax obligations across interim and final returns",
     "One-click export packs to prepare each filing"]],
  vendors: [Users, "Vendors",
    ["Vendor directory with TIN and bank-alias matching",
     "Spend history and payables per vendor",
     "Bank-statement name aliases for reconciliation"]],
  reports: [BarChart3, "Reports",
    ["Financial health scorecards and KPI trends",
     "Spend, AP aging, inventory turnover, cash runway",
     "Industry benchmarks by MIRA industry code"]],
  txns: [ReceiptText, "All transactions",
    ["Unified log of bills, expenses and POS sales",
     "Filter by vendor, category, tax class and status",
     "Drill into any journal or sync record"]],
  settings: [Settings, "Settings",
    ["Organization profile, sector and GST registration",
     "Roles & access (Owner, Manager, Accountant)",
     "Connected accounting software and API keys"]],
};

function Placeholder({ id }) {
  const [Icon, title, points] = PLACE[id] || [FileText, "Coming soon", []];
  return (
    <div className="p-4 sm:p-6 lg:p-8" style={{ background: T.paper }}>
      <div className="rounded-2xl p-6 sm:p-10 max-w-2xl" style={{ background: T.surface,
        border: `1px dashed ${T.line}` }}>
        <div style={{ width: 44, height: 44, borderRadius: 11, background: T.tealSoft,
          display: "grid", placeItems: "center", marginBottom: 16 }}>
          <Icon size={22} color={T.teal} /></div>
        <div style={{ fontSize: 17, fontWeight: 660, color: T.text }}>{title}</div>
        <div style={{ fontSize: 13, color: T.muted, marginTop: 6, lineHeight: 1.6 }}>
          Wired into the schema and ready to build next. This module will cover:</div>
        <div className="mt-4 flex flex-col gap-2.5">
          {points.map((p) => (
            <div key={p} className="flex items-start gap-2.5">
              <ArrowUpRight size={15} color={T.gold} style={{ marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: T.text }}>{p}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   App shell
--------------------------------------------------------------------------- */
const TITLES = {
  dashboard: "Spend Overview", approval: "Approval queue", bills: "Bills & expenses",
  inventory: "Inventory", banking: "Banking", filing: "Tax filing", vendors: "Vendors",
  reports: "Reports", txns: "All transactions", settings: "Settings",
};

function LoginModal({ onClose, onSignedIn }) {
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

export default function App() {
  const [active, setActive] = useState("dashboard");
  const [session, setSession] = useState(() => getSession());
  const [loginOpen, setLoginOpen] = useState(false);
  const [counts, setCounts] = useState({});
  const title = TITLES[active] || "Kashikeyo";
  const isCore = ["dashboard", "approval", "bills"].includes(active);
  const auth = {
    session,
    onSignIn: () => setLoginOpen(true),
    onSignOut: () => { signOut(); setSession(null); },
  };
  // Live nav badges: pending approvals + bill count. Refetch on login and nav
  // so the counts reflect actions taken elsewhere in the app.
  useEffect(() => {
    let alive = true;
    getDashboard()
      .then((d) => { if (alive && d) setCounts({ approval: d.pendingApprovals, bills: d.billCount }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [session, active]);

  return (
    <div style={{ fontFamily: sans, color: T.text, minHeight: "100vh", display: "flex",
      background: T.paper }}>
      <style>{`
        @media (prefers-reduced-motion: reduce){ *{transition:none!important;animation:none!important} }
        button:focus-visible{ outline:2px solid ${T.gold}; outline-offset:2px; }
        ::-webkit-scrollbar{height:8px;width:8px}
        ::-webkit-scrollbar-thumb{background:${T.line};border-radius:8px}
        input::placeholder{color:${T.faint}}
      `}</style>
      <Sidebar active={active} onNav={setActive} counts={counts} />
      <main className="flex-1 min-w-0 flex flex-col">
        <MobileHeader title={title} />
        <Topbar title={title} auth={auth} />
        <div className="flex-1" style={{ paddingBottom: 64 }} key={session ? "auth" : "anon"}>
          {active === "dashboard" && <Dashboard onNav={setActive} />}
          {active === "approval" && <Approval session={session} onRequireLogin={() => setLoginOpen(true)} />}
          {active === "bills" && <Bills />}
          {active === "vendors" && <Vendors />}
          {active === "filing" && <TaxFiling />}
          {active === "reports" && <Reports />}
          {active === "inventory" && <Inventory />}
          {active === "banking" && <Banking />}
          {!isCore && !["vendors", "filing", "reports", "inventory", "banking"].includes(active) && <Placeholder id={active} />}
        </div>
      </main>
      <BottomNav active={active} onNav={setActive} counts={counts} />
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)}
        onSignedIn={(s) => { setSession(s); setLoginOpen(false); }} />}
    </div>
  );
}
