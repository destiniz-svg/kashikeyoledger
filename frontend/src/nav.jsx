import React, { useState } from "react";
import { LayoutDashboard, ReceiptText, CheckCircle2, Package, Landmark, CalendarClock, Search,
  MoreHorizontal, Settings as SettingsIcon, Users, BarChart3, ScanLine, ArrowLeftRight, Command, LogOut } from "lucide-react";
import { T, mono } from "./theme.js";
import { NotificationBell, QuickAdd, AccountMenu } from "./chrome.jsx";
import { displayName, initials } from "./user.js";

/* ---------------------------------------------------------------------------
   Navigation — plain-language labels, grouped into readable sections.
--------------------------------------------------------------------------- */
const SECTIONS = [
  { items: [
    { id: "dashboard", label: "Home", short: "Home", icon: LayoutDashboard },
    { id: "inbox", label: "Scan & Upload", short: "Scan", icon: ScanLine, tag: "AI" },
    { id: "bills", label: "Bills to pay", short: "Bills", icon: ReceiptText },
    { id: "approval", label: "Approvals", short: "Approve", icon: CheckCircle2 },
    { id: "banking", label: "Banking", short: "Banking", icon: Landmark },
  ] },
  { title: "Business", items: [
    { id: "vendors", label: "Suppliers", icon: Users },
    { id: "inventory", label: "Stock", icon: Package },
    { id: "txns", label: "Activity", icon: ArrowLeftRight },
  ] },
  { title: "Insights", items: [
    { id: "reports", label: "Reports", icon: BarChart3 },
    { id: "filing", label: "Taxes", short: "Taxes", icon: CalendarClock },
  ] },
];
const ALL_ITEMS = SECTIONS.flatMap((s) => s.items);
const PRIMARY = ["dashboard", "inbox", "bills", "banking"];
const MORE = [
  ["approval", CheckCircle2, "Approvals"], ["vendors", Users, "Suppliers"], ["inventory", Package, "Stock"],
  ["txns", ArrowLeftRight, "Activity"], ["reports", BarChart3, "Reports"], ["filing", CalendarClock, "Taxes"],
  ["settings", SettingsIcon, "Settings"],
];

/* ---- Sidebar ------------------------------------------------------------- */
export function Sidebar({ active, onNav, counts, onOpenPalette, auth }) {
  const Item = ({ n }) => {
    const on = active === n.id; const Icon = n.icon;
    const badge = counts?.[n.id];
    return (
      <button onClick={() => onNav(n.id)}
        className="group flex items-center gap-3 rounded-lg text-left focus:outline-none"
        style={{ padding: "9px 11px", position: "relative", transition: "background .18s var(--k-ease), color .18s",
          background: on ? T.tealSoft : "transparent", color: on ? T.teal : T.text, fontSize: 13.5, fontWeight: on ? 640 : 460 }}
        onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = T.paper; }}
        onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}>
        <span style={{ position: "absolute", left: 0, top: 8, bottom: 8, width: 3, borderRadius: 3, background: T.teal,
          transform: on ? "scaleY(1)" : "scaleY(0)", transition: "transform .2s var(--k-ease)" }} />
        <Icon size={17} strokeWidth={2} style={{ color: on ? T.teal : T.faint, transition: "color .18s" }} />
        <span className="flex-1">{n.label}</span>
        {badge ? <span className="k-pop" style={{ background: on ? T.teal : T.line2, color: on ? "#fff" : T.muted,
          fontFamily: mono, fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "1px 7px" }}>{badge}</span> : null}
        {n.tag && <span style={{ border: `1px solid ${T.gold}`, color: T.gold, fontFamily: mono, fontSize: 8.5,
          borderRadius: 4, padding: "1px 4px", fontWeight: 700, letterSpacing: "0.04em" }}>{n.tag}</span>}
      </button>
    );
  };

  return (
    <aside style={{ background: T.surface, width: 246, borderRight: `1px solid ${T.line}` }}
      className="shrink-0 flex-col min-h-screen hidden lg:flex">
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2.5 px-1">
          <div style={{ width: 32, height: 32, borderRadius: 9, background: T.ink, color: "#fff",
            display: "grid", placeItems: "center", fontFamily: mono, fontWeight: 800, fontSize: 16 }}>K</div>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Kashikeyo</div>
            <div style={{ fontSize: 10, color: T.faint, fontFamily: mono }}>Bookkeeping · Maldives</div>
          </div>
        </div>
      </div>

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
        {SECTIONS.map((sec, i) => (
          <div key={i} className={i ? "mt-3" : ""}>
            {sec.title && (
              <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase",
                color: T.faint, padding: "4px 11px 6px" }}>{sec.title}</div>
            )}
            {sec.items.map((n) => <Item key={n.id} n={n} />)}
          </div>
        ))}
      </div>

      {/* Account footer with sign out */}
      <div className="px-3 py-3" style={{ borderTop: `1px solid ${T.line}` }}>
        {auth?.session ? (
          <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ background: T.paper }}>
            <div style={{ width: 30, height: 30, borderRadius: 999, background: T.tealSoft, color: T.teal, flexShrink: 0,
              display: "grid", placeItems: "center", fontFamily: mono, fontSize: 11, fontWeight: 800 }}>{initials(auth.session)}</div>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 12, fontWeight: 650, color: T.text }}>{displayName(auth.session)}</div>
              <div style={{ fontSize: 10, color: T.faint, overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap" }}>{auth.session.user?.email}</div>
            </div>
            <button onClick={auth.onSignOut} aria-label="Sign out" title="Sign out"
              className="focus:outline-none k-press" style={{ color: T.faint, padding: 4 }}>
              <LogOut size={16} /></button>
          </div>
        ) : (
          <button onClick={auth?.onSignIn} className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 focus:outline-none k-lift"
            style={{ background: T.tealSoft }}>
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
export function MobileHeader({ title, onOpenPalette, onNav, notif, auth }) {
  return (
    <div className="flex lg:hidden items-center justify-between px-4 py-3"
      style={{ borderBottom: `1px solid ${T.line}`, background: T.surface, position: "sticky", top: 0, zIndex: 30 }}>
      <div className="flex items-center gap-2.5 min-w-0">
        <div style={{ width: 28, height: 28, borderRadius: 8, background: T.ink, color: "#fff",
          display: "grid", placeItems: "center", fontFamily: mono, fontWeight: 800, fontSize: 14 }}>K</div>
        <div style={{ fontSize: 15, fontWeight: 680, color: T.text, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
      </div>
      <div className="flex items-center gap-1.5">
        <button onClick={onOpenPalette} className="rounded-lg p-2 focus:outline-none k-press" style={{ background: T.paper }}>
          <Search size={17} color={T.muted} /></button>
        <NotificationBell mobile {...notif} onNav={onNav} />
        <AccountMenu mobile auth={auth} onNav={onNav} />
      </div>
    </div>
  );
}

/* ---- Mobile bottom nav --------------------------------------------------- */
export function BottomNav({ active, onNav, counts, auth }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const inMore = MORE.some(([id]) => id === active);
  const tabs = PRIMARY.map((id) => ALL_ITEMS.find((n) => n.id === id));
  return (
    <>
      {moreOpen && (
        <div onClick={() => setMoreOpen(false)} className="lg:hidden"
          style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(11,42,46,0.4)", animation: "k-fade-in .16s ease" }}>
          <div onClick={(e) => e.stopPropagation()} className="k-in"
            style={{ position: "absolute", left: 0, right: 0, bottom: 64, background: T.surface,
              borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 12, maxHeight: "70vh", overflowY: "auto",
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
            {/* Account row — the mobile home for sign in / sign out */}
            <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 8, paddingTop: 8 }}>
              {auth?.session ? (
                <div className="flex items-center gap-3 px-3.5 py-2.5">
                  <div style={{ width: 34, height: 34, borderRadius: 999, background: T.tealSoft, color: T.teal, flexShrink: 0,
                    display: "grid", placeItems: "center", fontFamily: mono, fontSize: 12, fontWeight: 800 }}>{initials(auth.session)}</div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 13.5, fontWeight: 650, color: T.text }}>{displayName(auth.session)}</div>
                    <div style={{ fontSize: 11, color: T.faint, overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap" }}>{auth.session.user?.email}</div>
                  </div>
                  <button onClick={() => { auth.onSignOut(); setMoreOpen(false); }}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 focus:outline-none"
                    style={{ border: `1px solid ${T.line}`, color: T.exempt, fontSize: 12.5, fontWeight: 600 }}>
                    <LogOut size={15} /> Sign out</button>
                </div>
              ) : (
                <button onClick={() => { auth?.onSignIn(); setMoreOpen(false); }}
                  className="w-full flex items-center gap-3 rounded-xl focus:outline-none"
                  style={{ padding: "13px 14px", color: T.teal, fontSize: 14.5, fontWeight: 600 }}>
                  Sign in to go live</button>
              )}
            </div>
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
              {on && <span className="k-pop" style={{ position: "absolute", top: 0, width: 26, height: 3, borderRadius: 3, background: T.gold }} />}
              <div className="relative">
                <Icon size={21} strokeWidth={on ? 2.4 : 2} />
                {badge ? <span style={{ position: "absolute", top: -5, right: -8, background: T.gold, color: T.ink,
                  fontFamily: mono, fontSize: 9, fontWeight: 700, borderRadius: 999, padding: "0px 4px", lineHeight: "14px" }}>{badge}</span> : null}
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
        <button onClick={onOpenPalette} className="flex items-center gap-2 rounded-lg px-3 py-2 focus:outline-none k-press"
          style={{ background: T.paper, border: `1px solid ${T.line}`, width: 240, transition: "border-color .18s" }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.teal)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}>
          <Search size={15} color={T.faint} />
          <span style={{ fontSize: 12.5, color: T.faint, flex: 1, textAlign: "left" }}>Search or jump to…</span>
          <kbd style={{ fontFamily: mono, fontSize: 9.5, color: T.faint, border: `1px solid ${T.line}`,
            borderRadius: 5, padding: "1px 5px" }}>⌘K</kbd>
        </button>
        <NotificationBell {...notif} onNav={onNav} />
        <QuickAdd onNav={onNav} />
        <AccountMenu auth={auth} onNav={onNav} />
      </div>
    </div>
  );
}
