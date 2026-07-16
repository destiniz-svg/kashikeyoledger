import React, { useState } from "react";
import { LayoutDashboard, ReceiptText, CheckCircle2, Package, Landmark, CalendarClock, Search, Bell, ChevronDown, Wallet, MoreHorizontal, Plus, Settings as SettingsIcon, Users, BarChart3 } from "lucide-react";
import { T, mono } from "./theme.js";

/* ---------------------------------------------------------------------------
   Navigation model (nested, 44-style)
--------------------------------------------------------------------------- */
const NAV = [
  { id: "dashboard", label: "Dashboard", short: "Overview", icon: LayoutDashboard },
  { id: "bills", label: "Bills to pay", short: "Bills", icon: ReceiptText },
  { id: "approval", label: "Approvals", short: "Approve", icon: CheckCircle2 },
  { group: "Purchases", icon: Wallet, children: [
      { id: "vendors", label: "Vendors" },
      { id: "inventory", label: "Inventory" },
      { id: "txns", label: "All transactions" },
  ]},
  { id: "banking", label: "Banking", short: "Banking", icon: Landmark },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "filing", label: "Tax filing", short: "Filing", icon: CalendarClock },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];
const PRIMARY = ["dashboard", "approval", "bills", "banking"];
const MORE = ["inventory", "vendors", "reports", "filing", "settings", "txns"];

/* ---- Light nested sidebar ------------------------------------------------ */
export function Sidebar({ active, onNav, counts }) {
  const [open, setOpen] = useState(true);
  const childActive = ["vendors", "inventory", "txns"].includes(active);

  const Item = ({ n }) => {
    const on = active === n.id; const Icon = n.icon;
    const badge = counts?.[n.id];
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
export function MobileHeader({ title }) {
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

export function BottomNav({ active, onNav, counts }) {
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
          const badge = counts?.[n.id];
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
export function Topbar({ title, auth }) {
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

