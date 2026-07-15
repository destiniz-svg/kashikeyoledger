import React, { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { getTransactions } from "./api.js";
import { T, mono, sans, num, fmt, fmt0, useW } from "./theme.js";
import { Eyebrow, prettyEnum, NEUTRAL_CHIP, StatusPill, TaxChip, KpiTile } from "./ui.jsx";

/* ---------------------------------------------------------------------------
   All transactions — unified log of bills, expenses and POS sales
--------------------------------------------------------------------------- */
const KIND_META = {
  BILL: { t: "Bill", bg: T.warnSoft, fg: T.warn },
  SALE: { t: "Sale", bg: T.claimSoft, fg: T.claim },
};
const KindChip = ({ k }) => {
  const x = KIND_META[k] || { t: prettyEnum(k), ...NEUTRAL_CHIP };
  return <span style={{ background: x.bg, color: x.fg, fontFamily: mono, fontSize: 10.5,
    fontWeight: 700, letterSpacing: "0.04em", padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap" }}>{x.t}</span>;
};
const TXNS_DEMO = {
  currency: "MVR",
  summary: { count: 8, bills: 6, sales: 2, moneyIn: 3561, moneyOut: 120060.37, net: -116499.37 },
  transactions: [
    { id: "s2", kind: "SALE", isoDate: "2026-07-12", date: "12 Jul 2026", party: "POS sale", reference: "SALE-0912", category: "Sales", taxCat: "TGST", direction: "in", amount: 2100, currency: "MVR", status: "DRAFT" },
    { id: "b1", kind: "BILL", isoDate: "2026-07-05", date: "05 Jul 2026", party: "Altura Pvt Ltd", reference: "ALT/INV-000024", category: "Equipment", taxCat: "GGST", direction: "out", amount: 98280, currency: "MVR", status: "AI_VERIFIED" },
    { id: "s1", kind: "SALE", isoDate: "2026-07-10", date: "10 Jul 2026", party: "POS sale", reference: "SALE-0910", category: "Sales", taxCat: "GGST", direction: "in", amount: 1461, currency: "MVR", status: "DRAFT" },
    { id: "b5", kind: "BILL", isoDate: "2026-06-14", date: "14 Jun 2026", party: "Beaver Builders Private Limited", reference: "BB-3382", category: "Construction", taxCat: "GGST", direction: "out", amount: 4572.42, currency: "MVR", status: "DRAFT" },
    { id: "b6", kind: "BILL", isoDate: "2026-05-12", date: "12 May 2026", party: "Island Choice LLP", reference: "IC-7781", category: "F&B", taxCat: "GGST", direction: "out", amount: 232.2, currency: "MVR", status: "ACCOUNTANT_APPROVED" },
    { id: "b2", kind: "BILL", isoDate: "2026-05-11", date: "11 May 2026", party: "Island Mark Hardware Pvt Ltd", reference: "IMH-4471", category: "Hardware", taxCat: "GGST", direction: "out", amount: 4644, currency: "MVR", status: "REJECTED" },
    { id: "b3", kind: "BILL", isoDate: "2026-05-11", date: "11 May 2026", party: "Ives Private Limited", reference: "IVS-2026-118", category: "Supplies", taxCat: "GGST", direction: "out", amount: 6522.75, currency: "MVR", status: "AI_VERIFIED" },
    { id: "b4", kind: "BILL", isoDate: "2026-02-05", date: "05 Feb 2026", party: "Tree Top Health Pvt Ltd", reference: "TTH-9930", category: "Health", taxCat: "EXEMPT", direction: "out", amount: 5809, currency: "MVR", status: "AI_VERIFIED" },
  ],
};
const TXN_FILTERS = [["all", "All"], ["BILL", "Bills"], ["SALE", "Sales"]];

export function Transactions() {
  const w = useW(); const wide = w >= 768;
  const [data, setData] = useState(TXNS_DEMO);
  const [live, setLive] = useState(false);
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  useEffect(() => {
    let alive = true;
    getTransactions()
      .then((d) => { if (alive && d?.transactions) { setData(d); setLive(true); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const s = data.summary || { count: 0, moneyIn: 0, moneyOut: 0, net: 0 };
  const needle = q.trim().toLowerCase();
  const rows = data.transactions.filter((t) => {
    if (kind !== "all" && t.kind !== kind) return false;
    if (!needle) return true;
    return [t.party, t.reference, t.category].some((f) => String(f || "").toLowerCase().includes(needle));
  });
  const signed = (t) => `${t.direction === "in" ? "+" : "−"}${fmt(t.amount, t.currency)}`;

  return (
    <div className="p-4 sm:p-6 lg:p-8" style={{ background: T.paper }}>
      <div className="flex items-center gap-2 mb-4">
        <Eyebrow>All transactions</Eyebrow>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: mono,
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", color: live ? T.claim : T.faint }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: live ? T.claim : T.faint }} />
          {live ? "LIVE" : "SAMPLE"}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
        <KpiTile label="Transactions" value={String(s.count)} accent={T.text} />
        <KpiTile label="Money in" value={fmt0(s.moneyIn)} accent={T.claim} />
        <KpiTile label="Money out" value={fmt0(s.moneyOut)} accent={T.warn} />
        <KpiTile label="Net" value={fmt0(s.net)} accent={s.net < 0 ? T.exempt : T.claim} />
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${T.line}`, background: T.surface }}>
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3.5" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="flex items-center gap-1.5">
            {TXN_FILTERS.map(([id, label]) => {
              const on = kind === id;
              return (
                <button key={id} onClick={() => setKind(id)}
                  style={{ fontFamily: mono, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.03em",
                    padding: "5px 11px", borderRadius: 999, cursor: "pointer",
                    border: `1px solid ${on ? T.teal : T.line}`,
                    background: on ? T.teal : T.surface, color: on ? "#fff" : T.muted }}>
                  {label}</button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5" style={{ marginLeft: "auto", border: `1px solid ${T.line}`,
            borderRadius: 9, padding: "5px 10px", background: T.paper }}>
            <Search size={13} color={T.faint} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendor, ref, category"
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 12.5,
                color: T.text, fontFamily: sans, width: wide ? 220 : 140 }} />
          </div>
        </div>

        {wide ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: T.paper }}>
              {["Date", "Type", "Party", "Reference", "Tax", "Status", "Amount"].map((h, i) => (
                <th key={h} style={{ textAlign: i === 6 ? "right" : "left", padding: "11px 16px",
                  fontFamily: mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
                  color: T.faint, fontWeight: 600, borderBottom: `1px solid ${T.line}` }}>{h}</th>
              ))}</tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={`${t.kind}-${t.id}`} style={{ borderBottom: `1px solid ${T.line2}` }}>
                  <td style={{ padding: "12px 16px", ...num, fontSize: 12, color: T.muted, whiteSpace: "nowrap" }}>{t.date}</td>
                  <td style={{ padding: "12px 16px" }}><KindChip k={t.kind} /></td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 550, color: T.text }}>{t.party}</div>
                    <div style={{ fontFamily: mono, fontSize: 10, color: T.faint }}>{t.category}</div></td>
                  <td style={{ padding: "12px 16px", fontFamily: mono, fontSize: 11.5, color: T.muted }}>{t.reference}</td>
                  <td style={{ padding: "12px 16px" }}><TaxChip c={t.taxCat} /></td>
                  <td style={{ padding: "12px 16px" }}><StatusPill s={t.status} /></td>
                  <td style={{ padding: "12px 16px", textAlign: "right", ...num, fontSize: 13, fontWeight: 650,
                    whiteSpace: "nowrap", color: t.direction === "in" ? T.claim : T.text }}>{signed(t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div>
            {rows.map((t, i) => (
              <div key={`${t.kind}-${t.id}`} className="px-4 py-3.5" style={{ borderTop: i ? `1px solid ${T.line2}` : "none" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{t.party}</div>
                    <div style={{ fontFamily: mono, fontSize: 10.5, color: T.faint, marginTop: 1 }}>
                      {t.date} · {t.reference}</div></div>
                  <div style={{ ...num, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap",
                    color: t.direction === "in" ? T.claim : T.text }}>{signed(t)}</div>
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <KindChip k={t.kind} /><TaxChip c={t.taxCat} /><StatusPill s={t.status} />
                </div>
              </div>
            ))}
          </div>
        )}
        {rows.length === 0 && (
          <div style={{ padding: "28px 16px", textAlign: "center", fontFamily: mono, fontSize: 12, color: T.faint }}>
            No transactions in this view.</div>
        )}
      </div>
    </div>
  );
}

