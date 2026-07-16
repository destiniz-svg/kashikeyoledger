import React, { useState, useEffect } from "react";
import { Download } from "lucide-react";
import { getBills } from "./api.js";
import { T, mono, num, fmt, useW } from "./theme.js";
import { BILLS } from "./data.js";
import { Eyebrow, StatusPill, TaxChip } from "./ui.jsx";

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

// Escape a CSV cell (quote when it contains a comma, quote or newline).
const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function Bills() {
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

  // Export the bills as a CSV of input-tax lines, ready to reconcile against MIRA 205.
  function exportCsv() {
    const cols = ["Vendor", "TIN", "Invoice", "Date", "Due", "Currency", "Subtotal", "GST", "Total", "Category", "TaxCategory", "Status"];
    const rows = bills.map((b) => [b.vendor, b.tin, b.invoice, b.date, b.due, b.cur,
      b.subtotal, b.gst, b.total, b.cat, b.taxCat, b.status]);
    const csv = [cols, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `kashikeyo-bills-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
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
          <button onClick={exportCsv}
            className="flex items-center gap-2 rounded-lg px-3 sm:px-3.5 focus:outline-none shrink-0 k-press"
            style={{ border: `1px solid ${T.line}`, fontSize: 12.5, color: T.muted, minHeight: 40,
              transition: "border-color .18s, color .18s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.teal; e.currentTarget.style.color = T.teal; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.muted; }}>
            <Download size={14} /> <span className="hidden sm:inline">Export CSV</span>
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
              {bills.map((b, i) => (
                <tr key={b.id} className="k-in" style={{ borderBottom: `1px solid ${T.line2}`, animationDelay: `${Math.min(i, 12) * 26}ms` }}>
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

