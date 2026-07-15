import React from "react";
import { ReceiptText, Package, Landmark, CalendarClock, ArrowUpRight, FileText, Settings as SettingsIcon, Users, BarChart3 } from "lucide-react";
import { T } from "./theme.js";

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
  settings: [SettingsIcon, "Settings",
    ["Organization profile, sector and GST registration",
     "Roles & access (Owner, Manager, Accountant)",
     "Connected accounting software and API keys"]],
};

export function Placeholder({ id }) {
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

