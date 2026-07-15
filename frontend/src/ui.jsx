import React from "react";
import { T, mono, num, fmt0 } from "./theme.js";

/* ---------------------------------------------------------------------------
   Shared bits
--------------------------------------------------------------------------- */
export const Eyebrow = ({ children, style }) => (
  <div style={{ fontFamily: mono, letterSpacing: "0.14em", fontSize: 10.5,
    textTransform: "uppercase", color: T.faint, ...style }}>{children}</div>
);

// Prettify an unmapped enum value ("AI_VERIFIED" -> "Ai verified") so an
// unexpected status/category degrades to a readable chip instead of crashing.
export const prettyEnum = (v) => String(v ?? "—").toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
export const NEUTRAL_CHIP = { bg: "#EEF1EF", fg: T.muted };
export const STATUS = {
  DRAFT: { t: "Draft", bg: "#EEF1EF", fg: T.muted },
  AI_VERIFIED: { t: "AI verified", bg: T.tealSoft, fg: T.teal },
  ACCOUNTANT_APPROVED: { t: "Approved", bg: T.claimSoft, fg: T.claim },
  REJECTED: { t: "Rejected", bg: T.exemptSoft, fg: T.exempt },
  SYNCED: { t: "Synced", bg: T.goldSoft, fg: T.warn },
};
export const StatusPill = ({ s }) => {
  const x = STATUS[s] || { ...NEUTRAL_CHIP, t: prettyEnum(s) };
  return <span style={{ background: x.bg, color: x.fg, fontFamily: mono, fontSize: 11,
    padding: "3px 9px", borderRadius: 999, fontWeight: 600, whiteSpace: "nowrap" }}>{x.t}</span>;
};

export const TAXCAT = {
  GGST: { t: "GGST 8%", bg: T.tealSoft, fg: T.teal },
  TGST: { t: "TGST 17%", bg: T.goldSoft, fg: T.warn },
  ZERO_RATED: { t: "Zero-rated", bg: T.claimSoft, fg: T.claim },
  EXEMPT: { t: "Exempt", bg: T.exemptSoft, fg: T.exempt },
  OUT_OF_SCOPE: { t: "Out of scope", bg: "#EEF1EF", fg: T.muted },
};
export const TaxChip = ({ c }) => {
  const x = TAXCAT[c] || { ...NEUTRAL_CHIP, t: prettyEnum(c) };
  return <span style={{ background: x.bg, color: x.fg, fontFamily: mono, fontSize: 11,
    padding: "3px 8px", borderRadius: 6, fontWeight: 600, whiteSpace: "nowrap" }}>{x.t}</span>;
};

export function BreakdownList({ title, rows, variant, onMore }) {
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
export function KpiTile({ label, value, cur, accent }) {
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
