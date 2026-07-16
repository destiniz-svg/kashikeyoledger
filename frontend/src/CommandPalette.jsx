import React, { useState, useEffect, useMemo, useRef } from "react";
import { Search, CornerDownLeft, LayoutDashboard, ScanLine, ReceiptText, CheckCircle2,
  Users, Package, ArrowLeftRight, Landmark, BarChart3, CalendarClock, Settings as SettingsIcon,
  UploadCloud, LogIn, LogOut } from "lucide-react";
import { T, mono, sans } from "./theme.js";

// Every destination + quick action, one keystroke away.
const COMMANDS = [
  { id: "dashboard", label: "Home", hint: "Your business at a glance", icon: LayoutDashboard, kind: "nav", keys: "overview dashboard spend" },
  { id: "inbox", label: "Scan & Upload", hint: "Read receipts & invoices with AI", icon: ScanLine, kind: "nav", keys: "ai inbox receipt invoice upload document" },
  { id: "bills", label: "Bills to pay", hint: "What you owe", icon: ReceiptText, kind: "nav", keys: "purchases expenses payable owe" },
  { id: "approval", label: "Approvals", hint: "Approve or reject bills", icon: CheckCircle2, kind: "nav", keys: "queue verify" },
  { id: "banking", label: "Banking", hint: "Match your bank statement", icon: Landmark, kind: "nav", keys: "bank reconcile statement" },
  { id: "vendors", label: "Suppliers", hint: "Who you buy from", icon: Users, kind: "nav", keys: "vendors" },
  { id: "inventory", label: "Stock", hint: "What's on hand", icon: Package, kind: "nav", keys: "inventory items" },
  { id: "txns", label: "Activity", hint: "Everything that happened", icon: ArrowLeftRight, kind: "nav", keys: "transactions history log" },
  { id: "reports", label: "Reports", hint: "Charts & insights", icon: BarChart3, kind: "nav", keys: "analytics aging" },
  { id: "filing", label: "Taxes", hint: "Your GST returns", icon: CalendarClock, kind: "nav", keys: "gst tgst mira filing return" },
  { id: "settings", label: "Settings", hint: "Business & tax details", icon: SettingsIcon, kind: "nav", keys: "profile config account" },
  { id: "act-upload", label: "Scan a document", hint: "Receipt, invoice or bank slip", icon: UploadCloud, kind: "action", to: "inbox", keys: "new add upload" },
  { id: "act-import", label: "Import bank statement", hint: "Match a CSV", icon: Landmark, kind: "action", to: "banking", keys: "new csv" },
];

export function CommandPalette({ open, onClose, onNav, auth }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const commands = useMemo(() => {
    const base = [...COMMANDS];
    if (auth?.session) base.push({ id: "act-signout", label: "Sign out", icon: LogOut, kind: "auth", keys: "logout" });
    else base.push({ id: "act-signin", label: "Sign in", hint: "Unlock write actions", icon: LogIn, kind: "auth", keys: "login" });
    return base;
  }, [auth?.session]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands;
    return commands.filter((c) =>
      (c.label + " " + (c.hint || "") + " " + (c.keys || "")).toLowerCase().includes(s));
  }, [q, commands]);

  useEffect(() => { if (open) { setQ(""); setI(0); setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);
  useEffect(() => { setI(0); }, [q]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setI((v) => Math.min(results.length - 1, v + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setI((v) => Math.max(0, v - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); run(results[i]); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, results, i]); // eslint-disable-line

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${i}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [i]);

  function run(cmd) {
    if (!cmd) return;
    onClose();
    if (cmd.kind === "auth") { cmd.id === "act-signout" ? auth?.onSignOut?.() : auth?.onSignIn?.(); return; }
    onNav(cmd.to || cmd.id);
  }

  if (!open) return null;
  return (
    <div onMouseDown={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(11,42,46,0.34)",
        backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "12vh 16px 16px", animation: "k-fade-in .16s ease" }}>
      <div onMouseDown={(e) => e.stopPropagation()} className="k-in-scale"
        style={{ width: "100%", maxWidth: 560, background: T.surface, borderRadius: 16,
          border: `1px solid ${T.line}`, boxShadow: "0 30px 80px -30px rgba(11,42,46,0.5)",
          overflow: "hidden", fontFamily: sans }}>
        <div className="flex items-center gap-2.5 px-4" style={{ borderBottom: `1px solid ${T.line}`, height: 54 }}>
          <Search size={18} color={T.faint} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search screens and actions…" className="flex-1 bg-transparent outline-none"
            style={{ fontSize: 15, color: T.text }} />
          <kbd style={{ fontFamily: mono, fontSize: 10, color: T.faint, border: `1px solid ${T.line}`,
            borderRadius: 6, padding: "2px 6px" }}>ESC</kbd>
        </div>
        <div ref={listRef} style={{ maxHeight: 360, overflowY: "auto", padding: 6 }}>
          {results.length === 0 && (
            <div style={{ padding: "28px 16px", textAlign: "center", fontFamily: mono, fontSize: 12, color: T.faint }}>
              No matches for “{q}”.</div>
          )}
          {results.map((c, idx) => {
            const Icon = c.icon; const on = idx === i;
            return (
              <button key={c.id} data-idx={idx} onMouseEnter={() => setI(idx)} onClick={() => run(c)}
                className="w-full flex items-center gap-3 text-left focus:outline-none"
                style={{ padding: "10px 12px", borderRadius: 10, background: on ? T.tealSoft : "transparent",
                  cursor: "pointer" }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: "grid", placeItems: "center",
                  background: on ? T.teal : T.paper, color: on ? "#fff" : T.muted }}>
                  <Icon size={16} /></div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{c.label}</div>
                  {c.hint && <div style={{ fontSize: 11.5, color: T.faint }}>{c.hint}</div>}
                </div>
                {c.kind === "action" && <span style={{ fontFamily: mono, fontSize: 9.5, fontWeight: 700,
                  color: T.teal, background: T.tealSofter, borderRadius: 5, padding: "2px 6px" }}>ACTION</span>}
                {on && <CornerDownLeft size={14} color={T.teal} />}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: `1px solid ${T.line}`,
          fontFamily: mono, fontSize: 10, color: T.faint }}>
          <span>↑↓ navigate</span><span>↵ open</span><span style={{ marginLeft: "auto" }}>⌘K anytime</span>
        </div>
      </div>
    </div>
  );
}
