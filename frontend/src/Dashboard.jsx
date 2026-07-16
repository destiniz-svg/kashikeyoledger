import React, { useState, useEffect } from "react";
import { ChevronDown, TrendingUp, TrendingDown, ArrowUpRight, ArrowRight,
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { getDashboard, getCompliance, API_BASE } from "./api.js";
import { T, mono, num, fmt, fmt0, dec2 } from "./theme.js";
import { TREND, BY_CATEGORY, BY_VENDOR, BY_TAX, CAT_COLORS, TAX_COLORS } from "./data.js";
import { Eyebrow, BreakdownList } from "./ui.jsx";

// USD from MVR, for the dual-currency labels.
const usd = (n) => `$ ${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SAMPLE_COMPLIANCE = {
  score: 72,
  fx: { base: "MVR", quote: "USD", mvrPerUsd: 15.42 },
  money: {
    cashAndBank: { mvr: 246048.63, usd: 15957.76 },
    expenses: { mvr: 118420, usd: 7679.64 },
    accountsPayable: { mvr: 45230, usd: 2933.2 },
    claimableInputTax: { mvr: 8107, usd: 525.75 },
  },
  missingTin: { bills: 4, vendors: 4, unclaimableInputTax: 1166.07 },
  documentsNeedingReview: 1,
  unreconciledBankLines: 7,
  outOfBalanceBy: 0,
  filing: { form: "MIRA_205_GGST", mira: "MIRA 205", periodEnd: "2026-06-30", dueDate: "2026-07-28", status: "DUE_SOON", daysToDue: 12 },
  checks: [
    { id: "vendor_tin", label: "Vendor TIN completeness", status: "risk", detail: "4 bills without a supplier TIN — input GST can't be claimed.", count: 4, amount: 1166.07 },
    { id: "doc_review", label: "Document review", status: "warn", detail: "1 extracted document flagged for review.", count: 1 },
    { id: "bank_recon", label: "Bank reconciliation", status: "warn", detail: "7 bank lines still to reconcile.", count: 7 },
    { id: "ledger_balance", label: "Ledger balance", status: "ok", detail: "Debits equal credits." },
    { id: "filing_due", label: "GST filing", status: "ok", detail: "Next return (MIRA 205) due 2026-07-28." },
  ],
};

const STATUS_META = {
  ok: { color: T.claim, soft: T.claimSoft, Icon: CheckCircle2 },
  warn: { color: T.warn, soft: T.warnSoft, Icon: AlertTriangle },
  risk: { color: T.exempt, soft: T.exemptSoft, Icon: XCircle },
};
const CHECK_NAV = { vendor_tin: "bills", doc_review: "inbox", bank_recon: "banking", filing_due: "filing", ledger_balance: "reports" };

// Which base-currency figures to show in the dual-currency header.
const DUAL_FIELDS = [
  ["Cash & bank", "cashAndBank"],
  ["Expenses", "expenses"],
  ["Accounts payable", "accountsPayable"],
  ["Claimable input tax", "claimableInputTax"],
];

function DualCurrencyHeader({ c }) {
  return (
    <div className="rounded-2xl p-4 sm:p-5 mb-4" style={{ background: T.ink }}>
      <div className="flex items-center gap-2 mb-3.5 flex-wrap">
        <Eyebrow style={{ color: "rgba(255,255,255,0.66)" }}>Position · base MVR</Eyebrow>
        <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
          color: T.gold, background: "rgba(184,137,43,0.16)", borderRadius: 999, padding: "2px 8px" }}>
          USD @ {c.fx.mvrPerUsd.toFixed(2)}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {DUAL_FIELDS.map(([label, key]) => (
          <div key={key} className="min-w-0">
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase",
              color: "rgba(255,255,255,0.6)" }}>{label}</div>
            <div style={{ ...num, fontSize: 18, fontWeight: 680, color: "#fff", marginTop: 4,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmt(c.money[key].mvr)}</div>
            <div style={{ ...num, fontSize: 11, color: "rgba(255,255,255,0.62)", marginTop: 1 }}>
              {usd(c.money[key].usd)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreRing({ score }) {
  const color = score >= 85 ? T.claim : score >= 60 ? T.warn : T.exempt;
  const r = 26, circ = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: 68, height: 68, flexShrink: 0 }}>
      <svg width="68" height="68" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="34" cy="34" r={r} fill="none" stroke={T.line2} strokeWidth="6" />
        <circle cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - score / 100)} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <span style={{ ...num, fontSize: 18, fontWeight: 700, color }}>{score}</span>
      </div>
    </div>
  );
}

function ComplianceWidget({ c, onNav }) {
  const risks = c.checks.filter((x) => x.status !== "ok").length;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="flex items-center gap-3 p-4 sm:p-5" style={{ borderBottom: `1px solid ${T.line}` }}>
        <ScoreRing score={c.score} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={15} color={T.teal} />
            <div style={{ fontSize: 14.5, fontWeight: 680, color: T.text }}>MIRA readiness</div>
          </div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
            {risks === 0 ? "All checks clear — ready to file." : `${risks} item${risks === 1 ? "" : "s"} need attention before filing.`}</div>
          {c.missingTin.unclaimableInputTax > 0 && (
            <div style={{ ...num, fontSize: 11.5, color: T.exempt, fontWeight: 600, marginTop: 3 }}>
              {fmt(c.missingTin.unclaimableInputTax)} input tax at risk (missing TIN)</div>
          )}
        </div>
      </div>
      <div>
        {c.checks.map((x, i) => {
          const m = STATUS_META[x.status] || STATUS_META.warn;
          const nav = CHECK_NAV[x.id];
          return (
            <button key={x.id} onClick={() => nav && onNav(nav)} disabled={!nav}
              className="w-full flex items-start gap-3 px-4 sm:px-5 py-3 text-left focus:outline-none"
              style={{ borderTop: i ? `1px solid ${T.line2}` : "none", cursor: nav ? "pointer" : "default",
                background: "transparent" }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: m.soft, flexShrink: 0,
                display: "grid", placeItems: "center", marginTop: 1 }}>
                <m.Icon size={15} color={m.color} /></div>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>{x.label}</div>
                <div style={{ fontSize: 11.5, color: T.muted, marginTop: 1 }}>{x.detail}</div>
              </div>
              {nav && <ArrowRight size={14} color={T.faint} style={{ marginTop: 4, flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  const [compliance, setCompliance] = useState(null);
  useEffect(() => {
    let alive = true;
    getDashboard()
      .then((d) => alive && setState({ status: "live", data: d }))
      .catch(() => alive && setState({ status: "offline", data: null }));
    getCompliance()
      .then((c) => alive && c?.checks && setCompliance(c))
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const comp = compliance || SAMPLE_COMPLIANCE;
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
      <DualCurrencyHeader c={comp} />
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

      {/* MIRA compliance widget */}
      <div className="mt-4">
        <ComplianceWidget c={comp} onNav={onNav} />
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

