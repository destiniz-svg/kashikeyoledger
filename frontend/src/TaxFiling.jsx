import React, { useState, useEffect } from "react";
import { CalendarClock, Download } from "lucide-react";
import { getTaxFiling } from "./api.js";
import { exportFilingPdf } from "./mira205.js";
import { exportFilingPdf206 } from "./mira206.js";
import { T, mono, num, fmt, fmtDate, monthLabel, useW } from "./theme.js";
import { Eyebrow } from "./ui.jsx";

/* ---------------------------------------------------------------------------
   Tax filing — MIRA 205 (GGST) return
--------------------------------------------------------------------------- */
const FILING_STATUS = {
  FILED: { t: "Filed", bg: T.claimSoft, fg: T.claim },
  DUE_SOON: { t: "Due soon", bg: T.goldSoft, fg: T.warn },
  UPCOMING: { t: "Upcoming", bg: "#EEF1EF", fg: T.muted },
  OVERDUE: { t: "Overdue", bg: T.exemptSoft, fg: T.exempt },
  EXPORTED: { t: "Exported", bg: T.tealSoft, fg: T.teal },
};
const FilingChip = ({ s }) => {
  const x = FILING_STATUS[s] || FILING_STATUS.UPCOMING;
  return <span style={{ background: x.bg, color: x.fg, fontFamily: mono, fontSize: 11,
    padding: "3px 9px", borderRadius: 999, fontWeight: 600, whiteSpace: "nowrap" }}>{x.t}</span>;
};
const F0 = { sales8: 0, salesZero: 0, salesExempt: 0, salesOos: 0 };
// Sample calendars for both returns — replaced by live data when available.
const FORMS_DEMO = [
  { form: "MIRA_205_GGST", tax: "GGST", mira: "MIRA 205", rate: 8, filings: [
    { id: "f-3", form: "MIRA_205_GGST", periodStart: "2026-05-01", periodEnd: "2026-05-31", dueDate: "2026-06-28", status: "FILED", ...F0, outputTax: 0, inputTax: 844.37, netPayable: -844.37 },
    { id: "f-4", form: "MIRA_205_GGST", periodStart: "2026-06-01", periodEnd: "2026-06-30", dueDate: "2026-07-28", status: "DUE_SOON", ...F0, outputTax: 0, inputTax: 338.7, netPayable: -338.7 },
    { id: "f-5", form: "MIRA_205_GGST", periodStart: "2026-07-01", periodEnd: "2026-07-31", dueDate: "2026-08-28", status: "UPCOMING", ...F0, sales8: 81, outputTax: 6, inputTax: 7280, netPayable: -7274 },
    { id: "f-6", form: "MIRA_205_GGST", periodStart: "2026-08-01", periodEnd: "2026-08-31", dueDate: "2026-09-28", status: "UPCOMING", ...F0, outputTax: 0, inputTax: 0, netPayable: 0 },
  ] },
  { form: "MIRA_206_TGST", tax: "TGST", mira: "MIRA 206", rate: 17, filings: [
    { id: "t-4", form: "MIRA_206_TGST", periodStart: "2026-05-01", periodEnd: "2026-05-31", dueDate: "2026-06-28", status: "FILED", ...F0, outputTax: 0, inputTax: 0, netPayable: 0 },
    { id: "t-5", form: "MIRA_206_TGST", periodStart: "2026-06-01", periodEnd: "2026-06-30", dueDate: "2026-07-28", status: "DUE_SOON", ...F0, outputTax: 0, inputTax: 0, netPayable: 0 },
    { id: "t-6", form: "MIRA_206_TGST", periodStart: "2026-07-01", periodEnd: "2026-07-31", dueDate: "2026-08-28", status: "UPCOMING", ...F0, sales8: 3480, outputTax: 480, inputTax: 0, netPayable: 480 },
    { id: "t-7", form: "MIRA_206_TGST", periodStart: "2026-08-01", periodEnd: "2026-08-31", dueDate: "2026-09-28", status: "UPCOMING", ...F0, outputTax: 0, inputTax: 0, netPayable: 0 },
  ] },
];

// Return boxes for a filing period, parameterized by tax name + rate so the same
// layout serves MIRA 205 (GGST 8%) and MIRA 206 (TGST 17%). Amounts are rounded
// to the nearest Rufiyaa, matching the official return.
function miraBoxes(f, rate = 8, tax = "GST") {
  const r = (n) => Math.round(n);
  const totalSales = f.sales8 + f.salesZero + f.salesExempt + f.salesOos;
  const liability = f.outputTax - f.inputTax; // Box 6 − Box 7 (Box 8 = Box 9 = 0)
  return [
    ["1", `Sales of supplies subject to ${tax} at ${rate}% (inclusive of ${tax})`, r(f.sales8)],
    ["2", "Sales of zero-rated supplies", r(f.salesZero)],
    ["3", "Sales of exempt supplies", r(f.salesExempt)],
    ["4", `Sales of supplies which are out of scope of ${tax}`, r(f.salesOos)],
    ["5", "Total sales (Sum of Boxes 1 to 4)", r(totalSales)],
    ["6", "Output tax", r(f.outputTax)],
    ["7", "Input tax", r(f.inputTax)],
    ["8", `${tax} re irrecoverable debts / rate-change credit notes`, 0],
    ["9", `${tax} collected in excess`, 0],
    ["10", `${tax} LIABILITY FOR THE PERIOD (Box 6 − Box 7 − Box 8 + Box 9)`, r(liability)],
    ["11", `Amount of ${tax} being paid`, r(Math.max(0, liability))],
  ];
}

function exportFilingCsv(f, form) {
  const { tax = "GGST", mira = "MIRA 205", rate = 8 } = form || {};
  const header = [
    [`${mira} — ${tax} Return`],
    ["Taxable period", `${f.periodStart} to ${f.periodEnd}`],
    ["Due date", f.dueDate],
    ["Amounts in Rufiyaa (rounded to the nearest Rufiyaa)"],
    [],
    ["Box", "Description", "Amount (MVR)"],
  ];
  const rows = header.concat(miraBoxes(f, rate, tax));
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${mira.replace(/\s/g, "")}-${f.periodStart}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function TaxFiling() {
  const w = useW(); const wide = w >= 768;
  const [forms, setForms] = useState(FORMS_DEMO);
  const [idx, setIdx] = useState(0);
  const [taxpayer, setTaxpayer] = useState({ name: "Kashikeyo Demo Co", tin: "" });
  const [live, setLive] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    getTaxFiling()
      .then((d) => {
        if (!alive) return;
        // Prefer the new multi-form shape; fall back to the legacy single list.
        if (Array.isArray(d?.forms) && d.forms.length) { setForms(d.forms); setLive(true); }
        else if (d?.filings?.length) {
          setForms([{ form: "MIRA_205_GGST", tax: "GGST", mira: "MIRA 205", rate: 8, filings: d.filings }]);
          setLive(true);
        }
        if (d?.taxpayer) setTaxpayer(d.taxpayer);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const form = forms[Math.min(idx, forms.length - 1)] || forms[0];
  const filings = form.filings;
  const isTgst = form.form === "MIRA_206_TGST";
  async function downloadPdf(f) {
    setPdfBusy(true);
    try {
      // 205 fills the official blank form; 206 is generated from scratch.
      if (isTgst) await exportFilingPdf206(f, taxpayer);
      else await exportFilingPdf(f, taxpayer);
    } catch { exportFilingCsv(f, form); } // fall back to CSV if the PDF can't be built
    finally { setPdfBusy(false); }
  }
  const current = filings.find((f) => f.status !== "FILED") || filings[filings.length - 1];
  const daysToDue = current
    ? Math.ceil((Date.parse(`${current.dueDate}T00:00:00Z`) - Date.now()) / 86_400_000)
    : 0;
  const payable = current && current.netPayable > 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8" style={{ background: T.paper }}>
      <div className="flex items-center gap-2 mb-4">
        <Eyebrow>Tax filing</Eyebrow>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: mono,
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", color: live ? T.claim : T.faint }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: live ? T.claim : T.faint }} />
          {live ? "LIVE" : "SAMPLE"}</span>
      </div>

      {/* Form switcher — MIRA 205 (GGST) vs MIRA 206 (TGST) */}
      <div className="flex items-center gap-1.5 mb-5">
        {forms.map((fm, i) => {
          const on = i === Math.min(idx, forms.length - 1);
          return (
            <button key={fm.form} onClick={() => setIdx(i)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: mono,
                fontSize: 11.5, fontWeight: 600, letterSpacing: "0.02em", padding: "7px 13px",
                borderRadius: 10, cursor: "pointer", border: `1px solid ${on ? T.ink : T.line}`,
                background: on ? T.ink : T.surface, color: on ? "#fff" : T.muted }}>
              <CalendarClock size={13} />{fm.mira} · {fm.tax} {fm.rate}%</button>
          );
        })}
      </div>

      {current && (
        <div className="rounded-2xl p-5 sm:p-6 mb-5" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div style={{ fontSize: 17, fontWeight: 680, color: T.text }}>{monthLabel(current.periodStart)}</div>
              <div className="flex items-center gap-2 mt-1.5">
                <FilingChip s={current.status} />
                <span style={{ fontSize: 12, color: daysToDue < 0 ? T.exempt : T.muted }}>
                  due {fmtDate(current.dueDate)}
                  {daysToDue >= 0 ? ` · in ${daysToDue} days` : ` · ${-daysToDue} days overdue`}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => exportFilingCsv(current, form)}
                className="rounded-lg px-3 focus:outline-none transition-colors"
                style={{ border: `1px solid ${T.line}`, color: T.muted, fontSize: 12.5, fontWeight: 600, minHeight: 42 }}>
                CSV</button>
              <button onClick={() => downloadPdf(current)} disabled={pdfBusy}
                className="flex items-center gap-2 rounded-lg px-3.5 focus:outline-none transition-opacity hover:opacity-90"
                style={{ background: T.ink, color: "#fff", fontSize: 12.5, fontWeight: 600, minHeight: 42,
                  opacity: pdfBusy ? 0.7 : 1 }}>
                <Download size={15} /> {pdfBusy ? (isTgst ? "Building…" : "Filling…") : `Export ${form.mira} (PDF)`}</button>
            </div>
          </div>
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <Eyebrow>{form.mira} · return boxes</Eyebrow>
              <span style={{ fontFamily: mono, fontSize: 10, color: T.faint }}>Rufiyaa (rounded)</span>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
              {miraBoxes(current, form.rate, form.tax).map(([n, label, amt], i) => {
                const hi = n === "10";
                return (
                  <div key={n} className="flex items-center gap-3 px-3 sm:px-4 py-2.5"
                    style={{ borderTop: i ? `1px solid ${T.line2}` : "none",
                      background: hi ? (payable ? T.warnSoft : T.claimSoft) : T.surface }}>
                    <span style={{ width: 20, height: 20, borderRadius: 999, flexShrink: 0,
                      background: hi ? (payable ? T.warn : T.claim) : T.line2,
                      color: hi ? "#fff" : T.muted, display: "grid", placeItems: "center",
                      fontFamily: mono, fontSize: 10, fontWeight: 700 }}>{n}</span>
                    <span style={{ flex: 1, fontSize: 12.5, color: T.text,
                      fontWeight: hi ? 650 : 450 }}>{label}</span>
                    <span style={{ ...num, fontSize: 13, fontWeight: hi ? 700 : 600, whiteSpace: "nowrap",
                      color: hi ? (payable ? T.warn : T.claim) : T.text }}>
                      {Number(amt).toLocaleString("en-US")}</span>
                  </div>
                );
              })}
            </div>
            {!payable && current.netPayable !== 0 && (
              <div style={{ fontSize: 11, color: T.claim, marginTop: 6 }}>
                Box 10 is negative — a net input-tax credit carried to the next period.</div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-2xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div className="px-4 sm:px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontSize: 14.5, fontWeight: 650, color: T.text }}>Filing calendar</div>
        </div>
        {wide ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: T.paper }}>
              {["Period", "Due date", "Status", "Output", "Input", "Net"].map((h, i) => (
                <th key={h} style={{ textAlign: i > 2 ? "right" : "left", padding: "11px 16px",
                  fontFamily: mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
                  color: T.faint, fontWeight: 600, borderBottom: `1px solid ${T.line}` }}>{h}</th>
              ))}</tr></thead>
            <tbody>
              {filings.map((f) => (
                <tr key={f.id} style={{ borderBottom: `1px solid ${T.line2}` }}>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: T.text }}>{monthLabel(f.periodStart)}</td>
                  <td style={{ padding: "12px 16px", fontSize: 12.5, color: T.muted }}>{fmtDate(f.dueDate)}</td>
                  <td style={{ padding: "12px 16px" }}><FilingChip s={f.status} /></td>
                  <td style={{ padding: "12px 16px", textAlign: "right", ...num, fontSize: 12.5, color: T.muted }}>{fmt(f.outputTax).replace("Rf ", "")}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", ...num, fontSize: 12.5, color: T.muted }}>{fmt(f.inputTax).replace("Rf ", "")}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", ...num, fontSize: 13, fontWeight: 600,
                    color: f.netPayable > 0 ? T.warn : T.claim }}>{fmt(f.netPayable).replace("Rf ", "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div>
            {filings.map((f, i) => (
              <div key={f.id} className="px-4 py-3.5" style={{ borderTop: i ? `1px solid ${T.line2}` : "none" }}>
                <div className="flex items-center justify-between gap-2">
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{monthLabel(f.periodStart)}</div>
                  <div style={{ ...num, fontSize: 13.5, fontWeight: 700,
                    color: f.netPayable > 0 ? T.warn : T.claim }}>{fmt(f.netPayable)}</div>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <FilingChip s={f.status} />
                  <span style={{ fontFamily: mono, fontSize: 10.5, color: T.faint, marginLeft: "auto" }}>
                    due {fmtDate(f.dueDate)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

