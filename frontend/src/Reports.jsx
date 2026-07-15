import React, { useState, useEffect } from "react";
import { getReports } from "./api.js";
import { T, mono, num, fmt, fmt0, useW } from "./theme.js";
import { BY_CATEGORY, CAT_COLORS } from "./data.js";
import { Eyebrow, KpiTile, BreakdownList } from "./ui.jsx";

/* ---------------------------------------------------------------------------
   Reports — financial KPIs, AP aging, spend analysis
--------------------------------------------------------------------------- */
const AGING_META = {
  current: ["Current", T.claim],
  "1_30": ["1–30 days", T.warn],
  "31_60": ["31–60 days", T.warn],
  "61_90": ["61–90 days", T.exempt],
  "90_plus": ["90+ days", T.exempt],
};
const REPORT_DEMO = {
  kpis: { totalSpend: 120060.37, billCount: 6, revenueThisMonth: 3561, salesCount: 1,
    expenses: 150, cashAndBank: -150, accountsPayable: 0, claimableInputTax: 8463.07,
    gstNetPosition: -338.7, outOfBalanceBy: 0 },
  apAging: [
    { bucket: "current", amount: 98280, count: 1 },
    { bucket: "1_30", amount: 4572.42, count: 1 },
    { bucket: "31_60", amount: 11398.95, count: 3 },
    { bucket: "61_90", amount: 0, count: 0 },
    { bucket: "90_plus", amount: 5809, count: 1 },
  ],
  spendByCategory: BY_CATEGORY.map((c) => ({ name: c.name, n: c.n, amt: c.amt })),
};


export function Reports() {
  const w = useW(); const wide = w >= 768;
  const [data, setData] = useState(REPORT_DEMO);
  const [live, setLive] = useState(false);
  useEffect(() => {
    let alive = true;
    getReports()
      .then((d) => { if (alive && d?.kpis) { setData(d); setLive(true); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const k = data.kpis;
  const maxAging = Math.max(1, ...data.apAging.map((a) => a.amount));
  const catRows = data.spendByCategory.map((c, i) => ({ ...c, color: CAT_COLORS[i % CAT_COLORS.length] }));
  const gstPayable = k.gstNetPosition > 0;

  const tiles = [
    ["Total spend", fmt0(k.totalSpend), null, T.text],
    ["Revenue (MTD)", fmt0(k.revenueThisMonth), null, T.claim],
    ["Expenses", fmt0(k.expenses), null, T.text],
    ["Cash & bank", fmt0(k.cashAndBank), null, k.cashAndBank < 0 ? T.exempt : T.text],
    ["Accounts payable", fmt0(k.accountsPayable), null, T.warn],
    ["Claimable input tax", fmt0(k.claimableInputTax), null, T.claim],
    [gstPayable ? "GST payable" : "GST credit", fmt0(Math.abs(k.gstNetPosition)), null, gstPayable ? T.warn : T.claim],
    ["Out of balance", fmt(k.outOfBalanceBy), null, k.outOfBalanceBy === 0 ? T.claim : T.exempt],
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8" style={{ background: T.paper }}>
      <div className="flex items-center gap-2 mb-4">
        <Eyebrow>Financial reports</Eyebrow>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: mono,
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", color: live ? T.claim : T.faint }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: live ? T.claim : T.faint }} />
          {live ? "LIVE" : "SAMPLE"}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {tiles.map(([label, value, cur, accent]) => (
          <KpiTile key={label} label={label} value={value} cur={cur} accent={accent} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
        {/* AP aging */}
        <div className="rounded-2xl p-5 sm:p-6" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
          <div style={{ fontSize: 14.5, fontWeight: 650, color: T.text, marginBottom: 16 }}>
            Accounts payable — aging</div>
          <div className="flex flex-col gap-3.5">
            {data.apAging.map((a) => {
              const [label, color] = AGING_META[a.bucket] || ["—", T.muted];
              return (
                <div key={a.bucket}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span style={{ fontSize: 12.5, color: T.text, fontWeight: 500 }}>{label}
                      <span style={{ fontFamily: mono, fontSize: 10.5, color: T.faint }}> · {a.count}</span></span>
                    <span style={{ ...num, fontSize: 12.5, fontWeight: 600, color: T.text }}>{fmt0(a.amount)}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: T.line2, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 999, background: color,
                      width: `${Math.max(a.amount > 0 ? 3 : 0, (a.amount / maxAging) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Spend by category */}
        <div className="rounded-2xl p-5 sm:p-6" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
          <BreakdownList title="Spend by category" rows={catRows} variant="cat" onMore={() => {}} />
        </div>
      </div>
    </div>
  );
}

