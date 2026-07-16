import React, { useState } from "react";
import { Bell, Plus, CheckCircle2, Landmark, ScanLine, CalendarClock, AlertTriangle,
  UploadCloud, ArrowRight, Check } from "lucide-react";
import { T, mono } from "./theme.js";
import { useDismiss } from "./motion.js";

const NOTIF_ICON = { check: CheckCircle2, bank: Landmark, scan: ScanLine, calendar: CalendarClock, alert: AlertTriangle };
const TONE = {
  warn: { fg: T.warn, bg: T.warnSoft }, teal: { fg: T.teal, bg: T.tealSoft },
  risk: { fg: T.exempt, bg: T.exemptSoft }, ok: { fg: T.claim, bg: T.claimSoft },
};

/** Bell trigger + notifications popover. Driven by real signals. */
export function NotificationBell({ notifications = [], unread = 0, onMarkRead, onNav, mobile }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) onMarkRead?.();
  }
  const btnStyle = mobile
    ? { background: T.paper, borderRadius: 10, padding: 8 }
    : { border: `1px solid ${T.line}`, background: T.surface, borderRadius: 10, padding: 8 };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={toggle} className="focus:outline-none k-press" aria-label="Notifications" style={btnStyle}>
        <Bell size={mobile ? 17 : 16} color={T.muted} className={unread > 0 ? "k-bell-ring" : ""} />
        {unread > 0 && (
          <span className="k-pop" style={{ position: "absolute", top: mobile ? 4 : 5, right: mobile ? 4 : 5,
            minWidth: 15, height: 15, padding: "0 4px", borderRadius: 999, background: T.gold, color: T.ink,
            fontFamily: mono, fontSize: 9, fontWeight: 800, lineHeight: "15px", textAlign: "center",
            boxShadow: `0 0 0 2px ${mobile ? T.surface : T.surface}` }}>{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && (
        <div className="k-in-scale" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 320,
          maxWidth: "86vw", background: T.surface, border: `1px solid ${T.line}`, borderRadius: 14, zIndex: 60,
          boxShadow: "0 24px 60px -28px rgba(11,42,46,0.5)", overflow: "hidden", transformOrigin: "top right" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
            <span style={{ fontSize: 13.5, fontWeight: 680, color: T.text }}>Notifications</span>
            <span style={{ fontFamily: mono, fontSize: 10.5, color: T.faint }}>
              {notifications.length ? `${notifications.length} to act on` : "all clear"}</span>
          </div>
          <div style={{ maxHeight: 340, overflowY: "auto" }}>
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center text-center gap-2" style={{ padding: "30px 20px" }}>
                <div style={{ width: 40, height: 40, borderRadius: 999, background: T.claimSoft,
                  display: "grid", placeItems: "center" }}><Check size={20} color={T.claim} /></div>
                <div style={{ fontSize: 12.5, color: T.muted }}>You're all caught up.</div>
              </div>
            ) : notifications.map((n, idx) => {
              const Icon = NOTIF_ICON[n.icon] || Bell; const tone = TONE[n.tone] || TONE.warn;
              return (
                <button key={n.id} onClick={() => { setOpen(false); onNav(n.nav); }}
                  className="w-full flex items-start gap-3 text-left focus:outline-none k-in"
                  style={{ padding: "11px 14px", borderTop: idx ? `1px solid ${T.line2}` : "none",
                    cursor: "pointer", background: "transparent", animationDelay: `${idx * 40}ms` }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, marginTop: 1,
                    background: tone.bg, display: "grid", placeItems: "center" }}>
                    <Icon size={15} color={tone.fg} /></div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>{n.title}</div>
                    <div style={{ fontSize: 11.5, color: T.faint, marginTop: 1 }}>{n.detail}</div>
                  </div>
                  <ArrowRight size={14} color={T.faint} style={{ marginTop: 4 }} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const QUICK = [
  { id: "inbox", label: "Upload a document", hint: "Receipt, invoice, bank slip", icon: UploadCloud },
  { id: "banking", label: "Import bank statement", hint: "Reconcile a CSV", icon: Landmark },
  { id: "approval", label: "Review approvals", hint: "Approve pending bills", icon: CheckCircle2 },
];

/** The primary "+" create affordance → a menu that routes to real flows. */
export function QuickAdd({ onNav }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} aria-label="Quick add"
        className="rounded-full focus:outline-none k-press k-lift"
        style={{ width: 38, height: 38, background: T.ink, display: "grid", placeItems: "center",
          transition: "transform .2s var(--k-ease)", transform: open ? "rotate(45deg)" : "none" }}>
        <Plus size={18} color="#fff" />
      </button>
      {open && (
        <div className="k-in-scale" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 268,
          background: T.surface, border: `1px solid ${T.line}`, borderRadius: 14, zIndex: 60,
          boxShadow: "0 24px 60px -28px rgba(11,42,46,0.5)", overflow: "hidden", transformOrigin: "top right" }}>
          <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${T.line}`, fontFamily: mono,
            fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: T.faint }}>Quick actions</div>
          {QUICK.map((a, idx) => {
            const Icon = a.icon;
            return (
              <button key={a.id} onClick={() => { setOpen(false); onNav(a.id); }}
                className="w-full flex items-center gap-3 text-left focus:outline-none"
                style={{ padding: "11px 14px", borderTop: idx ? `1px solid ${T.line2}` : "none", cursor: "pointer" }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: T.tealSoft, flexShrink: 0,
                  display: "grid", placeItems: "center" }}><Icon size={15} color={T.teal} /></div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>{a.label}</div>
                  <div style={{ fontSize: 11, color: T.faint }}>{a.hint}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
