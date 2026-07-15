import React, { useState, useEffect } from "react";
import { getVendors } from "./api.js";
import { T, mono, num, fmt, fmt0, useW } from "./theme.js";
import { BY_VENDOR } from "./data.js";
import { Eyebrow } from "./ui.jsx";

/* ---------------------------------------------------------------------------
   Vendors — directory with spend rollups
--------------------------------------------------------------------------- */
const VENDOR_DEMO = BY_VENDOR.map((v) => ({
  id: v.name, name: v.name, ini: v.ini, tin: "—", gstRegistered: true,
  currency: "MVR", billCount: v.n, totalSpend: v.amt, lastBillDate: "—",
}));

export function Vendors() {
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

