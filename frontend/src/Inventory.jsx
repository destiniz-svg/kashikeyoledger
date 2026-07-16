import React, { useState, useEffect, useMemo } from "react";
import { Search, Download, X } from "lucide-react";
import { getInventory } from "./api.js";
import { T, mono, num, fmt, fmt0, useW } from "./theme.js";
import { KpiTile } from "./ui.jsx";
import { downloadCsv } from "./csv.js";

/* ---------------------------------------------------------------------------
   Inventory — perpetual stock with weighted-average cost
--------------------------------------------------------------------------- */
const STOCK_STATUS = {
  in_stock: { t: "In stock", bg: T.claimSoft, fg: T.claim },
  low: { t: "Low", bg: T.goldSoft, fg: T.warn },
  out: { t: "Out", bg: T.exemptSoft, fg: T.exempt },
};
const StockChip = ({ s }) => {
  const x = STOCK_STATUS[s] || STOCK_STATUS.in_stock;
  return <span style={{ background: x.bg, color: x.fg, fontFamily: mono, fontSize: 11,
    padding: "3px 9px", borderRadius: 999, fontWeight: 600, whiteSpace: "nowrap" }}>{x.t}</span>;
};
const INVENTORY_DEMO = {
  items: [
    { id: "1", sku: "MIX-01", name: "Concrete Mixer (50KG)", unit: "unit", qtyOnHand: 3, avgCost: 91000, stockValue: 273000, threshold: 2, status: "in_stock" },
    { id: "2", sku: "CEM-50", name: "Cement (50kg bag)", unit: "bag", qtyOnHand: 120, avgCost: 95, stockValue: 11400, threshold: 40, status: "in_stock" },
    { id: "3", sku: "GRV-M3", name: "Gravel", unit: "m3", qtyOnHand: 15, avgCost: 520, stockValue: 7800, threshold: 8, status: "in_stock" },
    { id: "4", sku: "RBR-12", name: "Steel Rebar 12mm", unit: "length", qtyOnHand: 30, avgCost: 180, stockValue: 5400, threshold: 50, status: "low" },
    { id: "5", sku: "PVC-04", name: 'PVC Pipe 4"', unit: "length", qtyOnHand: 8, avgCost: 120, stockValue: 960, threshold: 20, status: "low" },
    { id: "6", sku: "SND-M3", name: "Sand", unit: "m3", qtyOnHand: 0, avgCost: 450, stockValue: 0, threshold: 10, status: "out" },
  ],
  totalValue: 304179.96, lowCount: 2, outCount: 1,
};

const FILTERS = [["all", "All"], ["low", "Low"], ["out", "Out"]];

export function Inventory() {
  const w = useW(); const wide = w >= 768;
  const [data, setData] = useState(INVENTORY_DEMO);
  const [live, setLive] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    let alive = true;
    getInventory()
      .then((d) => { if (alive && d?.items) { setData(d); setLive(true); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.items.filter((it) => {
      if (filter === "low" && it.status !== "low") return false;
      if (filter === "out" && it.status !== "out") return false;
      return !s || (it.name + " " + it.sku).toLowerCase().includes(s);
    });
  }, [data.items, q, filter]);

  const exportCsv = () => downloadCsv(
    `kashikeyo-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
    ["SKU", "Item", "Unit", "On hand", "Avg cost", "Stock value", "Threshold", "Status"],
    items.map((it) => [it.sku, it.name, it.unit, it.qtyOnHand, it.avgCost, it.stockValue, it.threshold ?? "", it.status]),
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8" style={{ background: T.paper }}>
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-5">
        <KpiTile label="Inventory value" value={fmt0(data.totalValue)} accent={T.text} />
        <KpiTile label="Low stock" value={String(data.lowCount)} accent={data.lowCount ? T.warn : T.text} />
        <KpiTile label="Out of stock" value={String(data.outCount)} accent={data.outCount ? T.exempt : T.text} />
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${T.line}`, background: T.surface }}>
        <div className="flex items-center gap-2 px-4 sm:px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontSize: 14.5, fontWeight: 650, color: T.text }}>Stock on hand</div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: mono,
            fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", color: live ? T.claim : T.faint }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: live ? T.claim : T.faint }} />
            {live ? "LIVE" : "SAMPLE"}</span>
        </div>

        {/* Toolbar: search + status filter + export */}
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="flex items-center gap-2 rounded-lg px-3" style={{ background: T.paper,
            border: `1px solid ${T.line}`, minHeight: 38, flex: 1, minWidth: 180, maxWidth: 300 }}>
            <Search size={15} color={T.faint} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items or SKU…"
              className="bg-transparent outline-none w-full" style={{ fontSize: 12.5, color: T.text }} />
            {q && <button onClick={() => setQ("")} className="focus:outline-none"><X size={14} color={T.faint} /></button>}
          </div>
          <div className="flex items-center gap-1" style={{ background: T.paper, border: `1px solid ${T.line}`,
            borderRadius: 9, padding: 3 }}>
            {FILTERS.map(([id, label]) => {
              const on = filter === id;
              return (
                <button key={id} onClick={() => setFilter(id)} className="focus:outline-none k-press"
                  style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, padding: "5px 11px", borderRadius: 6,
                    cursor: "pointer", background: on ? T.ink : "transparent", color: on ? "#fff" : T.muted,
                    transition: "all .16s var(--k-ease)" }}>{label}</button>
              );
            })}
          </div>
          <button onClick={exportCsv} className="flex items-center gap-2 rounded-lg px-3 focus:outline-none k-press"
            style={{ border: `1px solid ${T.line}`, fontSize: 12.5, color: T.muted, minHeight: 38 }}>
            <Download size={14} /> <span className="hidden sm:inline">Export</span></button>
        </div>

        {items.length === 0 ? (
          <div style={{ padding: "34px 16px", textAlign: "center", fontFamily: mono, fontSize: 12, color: T.faint }}>
            No items match this view.</div>
        ) : wide ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: T.paper }}>
              {["Item", "On hand", "Avg cost", "Stock value", "Status"].map((h, i) => (
                <th key={h} style={{ textAlign: i > 0 && i < 4 ? "right" : "left", padding: "11px 16px",
                  fontFamily: mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
                  color: T.faint, fontWeight: 600, borderBottom: `1px solid ${T.line}` }}>{h}</th>
              ))}</tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.id} className="k-in" style={{ borderBottom: `1px solid ${T.line2}`,
                  animationDelay: `${Math.min(i, 12) * 28}ms` }}>
                  <td style={{ padding: "13px 16px" }}>
                    <div style={{ fontSize: 13, fontWeight: 550, color: T.text }}>{it.name}</div>
                    <div style={{ fontFamily: mono, fontSize: 10.5, color: T.faint }}>{it.sku}</div></td>
                  <td style={{ padding: "13px 16px", textAlign: "right", ...num, fontSize: 12.5, color: T.text }}>
                    {it.qtyOnHand} <span style={{ color: T.faint, fontSize: 10.5 }}>{it.unit}</span></td>
                  <td style={{ padding: "13px 16px", textAlign: "right", ...num, fontSize: 12.5, color: T.muted }}>
                    {fmt(it.avgCost).replace("Rf ", "")}</td>
                  <td style={{ padding: "13px 16px", textAlign: "right", ...num, fontSize: 13, fontWeight: 600, color: T.text }}>
                    {fmt(it.stockValue).replace("Rf ", "")}</td>
                  <td style={{ padding: "13px 16px" }}><StockChip s={it.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div>
            {items.map((it, i) => (
              <div key={it.id} className="px-4 py-3.5 k-in" style={{ borderTop: i ? `1px solid ${T.line2}` : "none",
                animationDelay: `${Math.min(i, 12) * 28}ms` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{it.name}</div>
                    <div style={{ fontFamily: mono, fontSize: 10.5, color: T.faint, marginTop: 1 }}>
                      {it.sku} · {it.qtyOnHand} {it.unit}</div></div>
                  <div style={{ ...num, fontSize: 14, fontWeight: 700, color: T.text, whiteSpace: "nowrap" }}>
                    {fmt(it.stockValue)}</div>
                </div>
                <div className="mt-2"><StockChip s={it.status} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

