import React, { useState, useEffect } from "react";
import { ChevronDown, TrendingUp, TrendingDown, ArrowUpRight, ArrowRight } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { getDashboard, API_BASE } from "./api.js";
import { T, mono, num, fmt, fmt0, dec2 } from "./theme.js";
import { TREND, BY_CATEGORY, BY_VENDOR, BY_TAX, CAT_COLORS, TAX_COLORS } from "./data.js";
import { Eyebrow, BreakdownList } from "./ui.jsx";

/* ---------------------------------------------------------------------------
   Dashboard — cloned layout from reference 44
--------------------------------------------------------------------------- */
function StatCard({ label, value, cur, sub, action, onAction, accent }) {
  return (
    <div className="rounded-2xl p-4 sm:p-5" style={{ background: T.surface,
      border: `1px solid ${T.line}` }}>
      <div className="flex items-start justify-between">
        <Eyebrow>{label}</Eyebrow>
        {action ? (
          <button onClick={onAction}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 focus:outline-none transition-colors"
            style={{ border: `1px solid ${T.line}`, fontSize: 11.5, color: T.teal, fontWeight: 600 }}>
            {action}</button>
        ) : (
          <ArrowUpRight size={16} color={T.faint} />
        )}
      </div>
      <div className="flex items-end gap-1.5 mt-3">
        <div style={{ ...num, fontSize: "clamp(21px, 4.6vw, 27px)", fontWeight: 650,
          color: accent || T.text, letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
        {cur && <span style={{ fontFamily: mono, fontSize: 11.5, color: T.faint,
          marginBottom: 2 }}>{cur}</span>}
      </div>
      <div style={{ fontSize: 11.5, color: T.muted, marginTop: 8 }}>{sub}</div>
    </div>
  );
}


function DropPill({ children }) {
  return (
    <button className="flex items-center gap-1.5 rounded-lg px-3 py-2 focus:outline-none"
      style={{ border: `1px solid ${T.line}`, background: T.surface, fontSize: 12.5,
        color: T.text, fontWeight: 500 }}>
      {children} <ChevronDown size={14} color={T.faint} />
    </button>
  );
}

/* ---- Live ledger strip — real data from the API, with graceful fallback --- */
function LiveLedgerStrip({ state }) {
  if (state.status === "loading") {
    return (
      <div className="rounded-2xl p-4 mb-4" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <span style={{ fontSize: 12.5, color: T.muted }}>Connecting to your ledger…</span>
      </div>
    );
  }
  if (state.status === "offline") {
    return (
      <div className="rounded-2xl p-4 mb-4 flex items-center gap-2.5 flex-wrap"
        style={{ background: T.warnSoft, border: "1px solid #E7D3A6" }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: T.warn, flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, color: T.warn, fontWeight: 550 }}>
          Live ledger offline — showing sample data below.</span>
        <span style={{ fontFamily: mono, fontSize: 10.5, color: T.faint, marginLeft: "auto" }}>{API_BASE}</span>
      </div>
    );
  }
  const d = state.data;
  const tiles = [
    ["Accounts payable", fmt(d.accountsPayable)],
    ["Cash & bank", fmt(d.cashAndBank)],
    ["Expenses", fmt(d.expenses)],
    ["Revenue (MTD)", fmt(d.revenueThisMonth.grandTotal)],
    ["Out of balance", fmt(d.outOfBalanceBy)],
  ];
  return (
    <div className="rounded-2xl p-4 sm:p-5 mb-4" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="flex items-center gap-2 mb-3.5">
        <span style={{ width: 8, height: 8, borderRadius: 999, background: T.claim,
          boxShadow: `0 0 0 3px ${T.claimSoft}` }} />
        <Eyebrow style={{ color: T.claim }}>Live from your ledger</Eyebrow>
        <span style={{ fontFamily: mono, fontSize: 10.5, color: T.faint, marginLeft: "auto" }}>
          {d.revenueThisMonth.from} – {d.revenueThisMonth.to}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <Eyebrow>{label}</Eyebrow>
            <div style={{ ...num, fontSize: 17, fontWeight: 650, color: T.text, marginTop: 4,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Dashboard({ onNav }) {
  const [state, setState] = useState({ status: "loading", data: null });
  useEffect(() => {
    let alive = true;
    getDashboard()
      .then((d) => alive && setState({ status: "live", data: d }))
      .catch(() => alive && setState({ status: "offline", data: null }));
    return () => { alive = false; };
  }, []);
  const d = state.data;
  const live = state.status === "live" && d;

  const catRows = live && d.spendByCategory?.length
    ? d.spendByCategory.map((r, i) => ({ ...r, color: CAT_COLORS[i % CAT_COLORS.length] }))
    : BY_CATEGORY;
  const vendorRows = live && d.spendByVendor?.length ? d.spendByVendor : BY_VENDOR;
  const taxRows = live && d.spendByTax?.length
    ? d.spendByTax.map((r) => ({ ...r, color: TAX_COLORS[r.name] || T.teal }))
    : BY_TAX;
  const trendData = live && d.spendTrend?.length ? d.spendTrend : TREND;
  const totalSpend = live ? fmt0(d.totalSpend) : "Rf 213,790";
  const billCount = live ? d.billCount : 26;
  const largest = live ? d.largestBill : { vendor: "Altura Pvt Ltd", amt: 98280, date: "05 Jul" };
  const delta = trendData.length >= 2 && trendData[trendData.length - 2].val
    ? Math.round((trendData[trendData.length - 1].val - trendData[trendData.length - 2].val) /
        trendData[trendData.length - 2].val * 100)
    : null;

  return (
    <div className="p-4 sm:p-6 lg:p-8" style={{ background: T.paper }}>
      <LiveLedgerStrip state={state} />
      {/* stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Accounts payable" value={live ? dec2(d.accountsPayable) : "45,230.00"} cur="MVR"
          sub={`${billCount} bills`} action="Review" onAction={() => onNav("bills")} />
        <StatCard label="Awaiting approval" value={live ? String(d.pendingApprovals) : "3"}
          sub="draft or AI-verified" accent={T.teal} />
        <StatCard label="Claimable input tax" value={live ? dec2(d.claimableInputTax) : "8,107.00"} cur="MVR"
          sub="toward MIRA 205" accent={T.claim} />
        <StatCard label="Inventory value" value="312,400" cur="MVR"
          sub="weighted average cost" />
      </div>

      {/* overview band */}
      <div className="flex items-center justify-between mt-7 mb-4 flex-wrap gap-3">
        <div style={{ fontSize: 17, fontWeight: 680, color: T.text }}>Overview</div>
        <div className="flex items-center gap-2">
          <DropPill>All vendors</DropPill>
          <DropPill>This month</DropPill>
        </div>
      </div>

      {/* chart + right rail */}
      <div className="rounded-2xl overflow-hidden" style={{ background: T.surface,
        border: `1px solid ${T.line}` }}>
        <div className="grid grid-cols-1 lg:grid-cols-3">
          <div className="lg:col-span-2 p-4 sm:p-6" style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 650, color: T.text, marginBottom: 14 }}>
              Purchase spending trend</div>
            <ResponsiveContainer width="100%" height={252}>
              <AreaChart data={trendData} margin={{ left: -14, right: 6, top: 4 }}>
                <defs>
                  <linearGradient id="fillTeal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.teal} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={T.teal} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={T.line2} />
                <XAxis dataKey="m" tick={{ fontSize: 10.5, fill: T.faint }}
                  axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={{ fontSize: 10, fill: T.faint, fontFamily: mono }} axisLine={false}
                  tickLine={false} width={40} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip cursor={{ stroke: T.teal, strokeWidth: 1, strokeDasharray: "3 3" }}
                  contentStyle={{ borderRadius: 10, border: `1px solid ${T.line}`,
                    fontFamily: mono, fontSize: 12 }}
                  formatter={(v) => [fmt0(v), "Spend"]} />
                <Area type="monotone" dataKey="val" stroke={T.teal} strokeWidth={2.5}
                  fill="url(#fillTeal)" dot={false}
                  activeDot={{ r: 5, fill: T.teal, stroke: "#fff", strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="p-5 sm:p-6 flex flex-col gap-5"
            style={{ borderLeft: `1px solid ${T.line}` }}>
            <div>
              <Eyebrow>Total spend</Eyebrow>
              <div style={{ ...num, fontSize: 24, fontWeight: 680, color: T.text,
                marginTop: 6, letterSpacing: "-0.02em" }}>{totalSpend}</div>
              <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>
                {billCount} bills{live ? " · all periods" : " · 1–31 Jul 2026"}</div>
              {delta !== null && (
                <div className="flex items-center gap-1 mt-2" style={{ ...num, fontSize: 11.5,
                  color: delta >= 0 ? T.exempt : T.claim, fontWeight: 600 }}>
                  {delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                  {delta >= 0 ? "+" : ""}{delta}% vs prev. month</div>
              )}
            </div>
            <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 18 }}>
              <Eyebrow>Largest bill</Eyebrow>
              <div style={{ ...num, fontSize: 20, fontWeight: 680, color: T.text, marginTop: 6 }}>
                {fmt0(largest.amt)}</div>
              <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>
                {largest.vendor} · {largest.date}</div>
              <button onClick={() => onNav("approval")}
                className="flex items-center gap-1.5 mt-3 focus:outline-none"
                style={{ fontSize: 12, color: T.teal, fontWeight: 600 }}>
                Open in approval queue <ArrowRight size={13} /></button>
            </div>
          </div>
        </div>

        {/* three breakdown columns */}
        <div className="grid grid-cols-1 md:grid-cols-3" style={{ borderTop: `1px solid ${T.line}` }}>
          <div className="p-5 sm:p-6" style={{ borderBottom: `1px solid ${T.line}` }}>
            <BreakdownList title="Spend by category" rows={catRows} variant="cat"
              onMore={() => onNav("reports")} />
          </div>
          <div className="p-5 sm:p-6"
            style={{ borderBottom: `1px solid ${T.line}` }}>
            <div className="md:border-l md:border-r md:px-6 md:-mx-6 md:h-full"
              style={{ borderColor: T.line }}>
              <BreakdownList title="Spend by vendor" rows={vendorRows} variant="avatar"
                onMore={() => onNav("vendors")} />
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <BreakdownList title="Spend by tax class" rows={taxRows} variant="tax"
              onMore={() => onNav("filing")} />
          </div>
        </div>
      </div>
    </div>
  );
}

