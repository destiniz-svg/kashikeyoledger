import React, { useState } from "react";
import { LayoutDashboard, ReceiptText, CheckCircle2, Package, Landmark, CalendarClock, Search,
  ChevronDown, Wallet, MoreHorizontal, Settings as SettingsIcon, Users, BarChart3, ScanLine,
  ArrowLeftRight, Command, Zap } from "lucide-react";
import { T, mono } from "./theme.js";
import { NotificationBell, QuickAdd } from "./chrome.jsx";

/* ---------------------------------------------------------------------------
   Navigation model
--------------------------------------------------------------------------- */
const NAV = [
  { id: "dashboard", label: "Dashboard", short: "Home", icon: LayoutDashboard },
  { id: "inbox", label: "AI Inbox", short: "Inbox", icon: ScanLine, tag: "AI" },
  { id: "bills", label: "Bills to pay", short: "Bills", icon: ReceiptText },
  { id: "approval", label: "Approvals", short: "Approve", icon: CheckCircle2 },
  { group: "Purchases", icon: Wallet, ids: ["vendors", "inventory", "txns"], children: [
      { id: "vendors", label: "Vendors", icon: Users },
      { id: "inventory", label: "Inventory", icon: Package },
      { id: "txns", label: "All transactions", icon: ArrowLeftRight },
  ]},
  { id: "banking", label: "Banking", short: "Banking", icon: Landmark },
  { id: "reports", label: "Reports", short: "Reports", icon: BarChart3 },
  { id: "filing", label: "Tax filing", short: "Filing", icon: CalendarClock },
  { id: "settings", label: "Settings", short: "Settings", icon: SettingsIcon },
];
const PRIMARY = ["dashboard", "approval", "bills", "banking"];
const MORE = [
  ["inbox", ScanLine, "AI Inbox"], ["inventory", Package, "Inventory"], ["vendors", Users, "Vendors"],
  ["txns", ArrowLeftRight, "All transactions"], ["reports", BarChart3, "Reports"],
  ["filing", CalendarClock, "Tax filing"], ["settings", SettingsIcon, "Settings"],
];

/* ---- Sidebar ------------------------------------------------------------- */
export function Sidebar({ active, onNav, counts, onOpenPalette, auth }) {
  const [open, setOpen] = useState(true);
  const childActive = ["vendors", "inventory", "txns"].includes(active);

  const Item = ({ n }) => {
    const on = active === n.id; const Icon = n.icon;
    const badge = counts?.[n.id];
    return (
      <button onClick={() => onNav(n.id)}
        className="group flex items-center gap-3 rounded-lg text-left focus:outline-none"
        style={{ padding: "9px 11px", position: "relative", transition: "background .18s var(--k-ease), color .18s",
          background: on ? T.tealSoft : "transparent",
          color: on ? T.teal : T.text, fontSize: 13.5, fontWeight: on ? 640 : 460 }}
        onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = T.paper; }}
        onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}>
        <span style={{ position: "absolute", left: 0, top: 8, bottom: 8, width: 3, borderRadius: 3,
          background: T.teal, transform: on ? "scaleY(1)" : "scaleY(0)", transformOrigin: "center",
          transition: "transform .2s var(--k-ease)" }} />
        <Icon size={17} strokeWidth={2} style={{ color: on ? T.teal : T.faint, transition: "color .18s" }} />
        <span className="flex-1">{n.label}</span>
        {badge ? <span className="k-pop" style={{ background: on ? T.teal : T.line2, color: on ? "#fff" : T.muted,
          fontFamily: mono, fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "1px 7px" }}>{badge}</span> : null}
        {n.tag && <span style={{ border: `1px solid ${T.gold}`, color: T.gold, fontFamily: mono,
          fontSize: 8.5, borderRadius: 4, padding: "1px 4px", fontWeight: 700, letterSpacing: "0.04em" }}>{n.tag}</span>}
      </button>
    );
  };

  return (
    <aside style={{ background: T.surface, width: 246, borderRight: `1px solid ${T.line}` }}
      className="shrink-0 flex-col min-h-screen hidden lg:flex">
      {/* Brand */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2.5 px-1">
          <div style={{ width: 32, height: 32, borderRadius: 9, background: T.ink, color: "#fff",
            display: "grid", placeItems: "center", fontFamily: mono, fontWeight: 800, fontSize: 16 }}>K</div>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Kashikeyo</div>
            <div style={{ fontSize: 10, color: T.faint, fontFamily: mono }}>Ledger · Maldives</div>
          </div>
        </div>
      </div>

      {/* Command / search launcher */}
      <div className="px-3 pb-2">
        <button onClick={onOpenPalette} className="w-full flex items-center gap-2 rounded-lg focus:outline-none k-press"
          style={{ border: `1px solid ${T.line}`, background: T.paper, padding: "8px 10px", transition: "border-color .18s" }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.teal)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}>
          <Search size={14} color={T.faint} />
          <span style={{ fontSize: 12.5, color: T.faint, flex: 1, textAlign: "left" }}>Search…</span>
          <kbd style={{ fontFamily: mono, fontSize: 9.5, color: T.faint, border: `1px solid ${T.line}`,
            borderRadius: 5, padding: "1px 5px", display: "inline-flex", alignItems: "center", gap: 2 }}>
            <Command size={9} />K</kbd>
        </button>
      </div>

      <div className="px-3 flex flex-col gap-0.5 flex-1 overflow-y-auto pb-3">
        {NAV.map((n, i) => {
          if (n.group) {
            return (
              <div key={i} className="mt-1">
                <button onClick={() => setOpen((o) => !o)}
                  className="w-full flex items-center gap-3 rounded-lg text-left focus:outline-none"
                  style={{ padding: "9px 11px", color: childActive ? T.teal : T.muted, fontSize: 13.5, fontWeight: 540 }}>
                  <n.icon size={17} strokeWidth={2} style={{ color: childActive ? T.teal : T.faint }} />
                  <span className="flex-1">{n.group}</span>
                  <ChevronDown size={14} color={T.faint}
                    style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .2s var(--k-ease)" }} />
                </button>
                <div style={{ overflow: "hidden", transition: "max-height .28s var(--k-ease), opacity .2s",
                  maxHeight: open ? 160 : 0, opacity: open ? 1 : 0 }}>
                  <div className="flex flex-col" style={{ marginLeft: 27, borderLeft: `1px solid ${T.line}`,
                    paddingLeft: 6, marginTop: 2 }}>
                    {n.children.map((c) => {
                      const on = active === c.id;
                      return (
                        <button key={c.id} onClick={() => onNav(c.id)}
                          className="text-left rounded-lg focus:outline-none"
                          style={{ padding: "7px 10px", fontSize: 13, transition: "background .18s, color .18s",
                            color: on ? T.teal : T.muted, fontWeight: on ? 600 : 450,
                            background: on ? T.tealSofter : "transparent" }}>{c.label}</button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          }
          return <Item key={n.id} n={n} />;
        })}
      </div>

      {/* Connection status — honest Live/Sample */}
      <div className="px-3 py-3" style={{ borderTop: `1px solid ${T.line}` }}>
        {auth?.session ? (
          <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ background: T.paper }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: T.claim,
              boxShadow: `0 0 0 3px ${T.claimSoft}` }} />
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>Live workspace</div>
              <div style={{ fontSize: 10.5, color: T.faint, overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap" }}>{auth.session.user?.email}</div>
            </div>
          </div>
        ) : (
          <button onClick={auth?.onSignIn} className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 focus:outline-none k-lift"
            style={{ background: T.tealSoft, border: `1px solid ${T.tealSoft}` }}>
            <Zap size={15} color={T.teal} />
            <div className="flex-1 text-left min-w-0">
              <div style={{ fontSize: 12, fontWeight: 650, color: T.teal }}>Viewing sample data</div>
              <div style={{ fontSize: 10.5, color: T.teal, opacity: 0.8 }}>Sign in to go live →</div>
            </div>
          </button>
        )}
      </div>
    </aside>
  );
}

/* ---- Mobile top bar ------------------------------------------------------ */
export function MobileHeader({ title, onOpenPalette, onNav, notif }) {
  return (
    <div className="flex lg:hidden items-center justify-between px-4 py-3"
      style={{ borderBottom: `1px solid ${T.line}`, background: T.surface, position: "sticky", top: 0, zIndex: 30 }}>
      <div className="flex items-center gap-2.5 min-w-0">
        <div style={{ width: 28, height: 28, borderRadius: 8, background: T.ink, color: "#fff",
          display: "grid", placeItems: "center", fontFamily: mono, fontWeight: 800, fontSize: 14 }}>K</div>
        <div style={{ fontSize: 14.5, fontWeight: 660, color: T.text, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
      </div>
      <div className="flex items-center gap-1.5">
        <button onClick={onOpenPalette} className="rounded-lg p-2 focus:outline-none k-press" style={{ background: T.paper }}>
          <Search size={17} color={T.muted} /></button>
        <NotificationBell mobile {...notif} onNav={onNav} />
      </div>
    </div>
  );
}

/* ---- Mobile bottom nav --------------------------------------------------- */
export function BottomNav({ active, onNav, counts }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const inMore = MORE.some(([id]) => id === active);
  const tabs = PRIMARY.map((id) => NAV.find((n) => n.id === id));
  return (
    <>
      {moreOpen && (
        <div onClick={() => setMoreOpen(false)} className="lg:hidden"
          style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(11,42,46,0.4)",
            animation: "k-fade-in .16s ease" }}>
          <div onClick={(e) => e.stopPropagation()} className="k-in"
            style={{ position: "absolute", left: 0, right: 0, bottom: 64, background: T.surface,
              borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 12,
              boxShadow: "0 -8px 30px rgba(11,42,46,0.15)" }}>
            <div style={{ width: 36, height: 4, borderRadius: 4, background: T.line, margin: "4px auto 12px" }} />
            {MORE.map(([id, Icon, label]) => {
              const on = active === id;
              return (
                <button key={id} onClick={() => { onNav(id); setMoreOpen(false); }}
                  className="w-full flex items-center gap-3 rounded-xl focus:outline-none"
                  style={{ padding: "13px 14px", background: on ? T.tealSoft : "transparent",
                    color: on ? T.teal : T.text, fontSize: 14.5, fontWeight: 550 }}>
                  <Icon size={19} color={on ? T.teal : T.muted} /> {label}
                  {counts?.[id] ? <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 11,
                    fontWeight: 700, color: T.teal }}>{counts[id]}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <nav className="flex lg:hidden" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 45,
        background: T.surface, borderTop: `1px solid ${T.line}`, height: 64, paddingBottom: "env(safe-area-inset-bottom)" }}>
        {tabs.map((n) => {
          const on = active === n.id; const Icon = n.icon; const badge = counts?.[n.id];
          return (
            <button key={n.id} onClick={() => onNav(n.id)}
              className="flex-1 flex flex-col items-center justify-center gap-1 focus:outline-none k-press"
              style={{ color: on ? T.teal : T.faint, position: "relative" }}>
              {on && <span className="k-pop" style={{ position: "absolute", top: 0, width: 26, height: 3,
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
          className="flex-1 flex flex-col items-center justify-center gap-1 focus:outline-none k-press"
          style={{ color: inMore ? T.teal : T.faint, position: "relative" }}>
          {inMore && <span style={{ position: "absolute", top: 0, width: 26, height: 3, borderRadius: 3, background: T.gold }} />}
          <MoreHorizontal size={21} strokeWidth={inMore ? 2.4 : 2} />
          <span style={{ fontSize: 10, fontWeight: inMore ? 650 : 500 }}>More</span>
        </button>
      </nav>
    </>
  );
}

/* ---- Desktop topbar ------------------------------------------------------ */
export function Topbar({ title, auth, onOpenPalette, onNav, notif }) {
  return (
    <div className="hidden lg:flex items-center justify-between px-8 py-4"
      style={{ borderBottom: `1px solid ${T.line}`, background: "rgba(255,255,255,0.8)",
        backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 25 }}>
      <h1 style={{ fontSize: 20, fontWeight: 720, color: T.text, letterSpacing: "-0.02em" }}>{title}</h1>
      <div className="flex items-center gap-3">
        <button onClick={onOpenPalette}
          className="flex items-center gap-2 rounded-lg px-3 py-2 focus:outline-none k-press"
          style={{ background: T.paper, border: `1px solid ${T.line}`, width: 240, transition: "border-color .18s" }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.teal)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}>
          <Search size={15} color={T.faint} />
          <span style={{ fontSize: 12.5, color: T.faint, flex: 1, textAlign: "left" }}>Search or jump to…</span>
          <kbd style={{ fontFamily: mono, fontSize: 9.5, color: T.faint, border: `1px solid ${T.line}`,
            borderRadius: 5, padding: "1px 5px" }}>⌘K</kbd>
        </button>
        {auth && (auth.session ? (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ border: `1px solid ${T.line}` }}>
            <div style={{ width: 22, height: 22, borderRadius: 999, background: T.tealSoft, color: T.teal,
              display: "grid", placeItems: "center", fontFamily: mono, fontSize: 10, fontWeight: 700 }}>
              {(auth.session.user?.email || "?").slice(0, 2).toUpperCase()}</div>
            <span style={{ fontSize: 12, color: T.text, maxWidth: 120, overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{auth.session.user?.email}</span>
            <button onClick={auth.onSignOut} style={{ fontSize: 11.5, color: T.muted, fontWeight: 600 }}
              className="focus:outline-none">Sign out</button>
          </div>
        ) : (
          <button onClick={auth.onSignIn}
            className="rounded-lg px-3.5 focus:outline-none k-press" style={{ border: `1px solid ${T.line}`,
              fontSize: 12.5, color: T.teal, fontWeight: 600, minHeight: 38 }}>Sign in</button>
        ))}
        <NotificationBell {...notif} onNav={onNav} />
        <QuickAdd onNav={onNav} />
      </div>
    </div>
  );
}
