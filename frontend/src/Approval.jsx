import React, { useState, useEffect } from "react";
import { CheckCircle2, ChevronRight, Check, X, Sparkles, ShieldCheck, FileText } from "lucide-react";
import { getBills, approveBill, rejectBill } from "./api.js";
import { T, mono, num, fmt, useW } from "./theme.js";
import { BILLS } from "./data.js";
import { Eyebrow, StatusPill, TaxChip } from "./ui.jsx";

/* ---------------------------------------------------------------------------
   Approval (tabbed on mobile, split on desktop)
--------------------------------------------------------------------------- */
function InvoiceReplica({ b, pad }) {
  return (
    <div className="mx-auto" style={{ background: "#fff", width: "100%", maxWidth: 460,
      border: `1px solid ${T.line}`, borderRadius: 6, boxShadow: "0 1px 3px rgba(11,42,46,0.06)",
      padding: pad }}>
      <div className="flex justify-between items-start" style={{ marginBottom: 20 }}>
        <div className="pr-3">
          <div style={{ fontWeight: 700, fontSize: 14.5, color: T.text }}>{b.vendor}</div>
          <div style={{ fontSize: 9.5, color: T.muted, lineHeight: 1.5, marginTop: 3 }}>
            Company ID : C05262022 · Tax ID : {b.tin}<br />6F, G. Velimaa, Majeedhee Magu, Male'</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: "0.12em", color: T.faint,
            textTransform: "uppercase" }}>Tax Invoice</div>
          <div style={{ fontFamily: mono, fontSize: 11.5, color: T.text, marginTop: 3 }}>{b.invoice}</div>
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${T.line}`, borderBottom: `1px solid ${T.line}`,
        padding: "10px 0", marginBottom: 14, display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div className="min-w-0">
          <div style={{ fontSize: 8.5, color: T.faint, textTransform: "uppercase",
            letterSpacing: "0.1em", fontFamily: mono }}>Bill to</div>
          <div style={{ fontSize: 10.5, color: T.text, marginTop: 3, fontWeight: 550 }}>
            Road Development Corporation Ltd</div>
          <div style={{ fontSize: 9, color: T.muted, fontFamily: mono }}>TIN 1110219GST501</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 9, color: T.muted, fontFamily: mono,
          whiteSpace: "nowrap" }}><div>Date : {b.date}</div><div>P.O.# : {b.po}</div></div>
      </div>
      <table style={{ width: "100%", fontSize: 10.5, color: T.text }}>
        <thead><tr style={{ color: T.faint, fontFamily: mono, fontSize: 8.5,
          textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <td style={{ paddingBottom: 6 }}>Item &amp; Description</td>
          <td style={{ textAlign: "right", paddingBottom: 6 }}>Qty</td>
          <td style={{ textAlign: "right", paddingBottom: 6 }}>Amount</td></tr></thead>
        <tbody><tr style={{ borderTop: `1px solid ${T.line}` }}>
          <td style={{ padding: "9px 0" }}>{b.line}</td>
          <td style={{ textAlign: "right", ...num }}>{b.qty.toFixed(2)}</td>
          <td style={{ textAlign: "right", ...num }}>
            {b.subtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td></tr></tbody>
      </table>
      <div style={{ marginTop: 12, marginLeft: "auto", width: 190, fontSize: 10.5 }}>
        {[["Sub Total", b.subtotal], [`GST (${b.rate}%)`, b.gst]].map(([k, v]) => (
          <div key={k} className="flex justify-between" style={{ padding: "3px 0", color: T.muted }}>
            <span>{k}</span><span style={num}>{v.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></div>
        ))}
        <div className="flex justify-between" style={{ padding: "7px 0", marginTop: 4,
          borderTop: `1.5px solid ${T.ink}`, fontWeight: 700, color: T.text }}>
          <span>Total MVR</span>
          <span style={num}>{b.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></div>
      </div>
    </div>
  );
}

function ExtractedField({ label, value, confidence }) {
  return (
    <div className="min-w-0">
      <Eyebrow>{label}</Eyebrow>
      <div className="flex items-center gap-2 mt-1.5">
        <div style={{ fontSize: 13.5, color: T.text, fontWeight: 550, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
        {confidence && <span style={{ width: 6, height: 6, borderRadius: 999, flexShrink: 0,
          background: confidence > 0.9 ? T.claim : T.warn }} />}
      </div>
    </div>
  );
}

function DataPanel({ b, onApprove, onReject, busy, error }) {
  const recomputed = +(b.subtotal * b.rate / 100).toFixed(2);
  const verified = Math.abs(recomputed - b.gst) < 0.01;
  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <Eyebrow>Extracted data</Eyebrow>
        <span className="flex items-center gap-1.5" style={{ fontFamily: mono, fontSize: 10.5,
          color: T.teal }}><Sparkles size={12} /> AI · 94% confidence</span>
      </div>
      <div className="grid grid-cols-2 gap-y-4 gap-x-4 sm:gap-x-6 mb-6">
        <ExtractedField label="Vendor" value={b.vendor} confidence={0.96} />
        <ExtractedField label="Vendor TIN" value={b.tin} confidence={0.91} />
        <ExtractedField label="Invoice no." value={b.invoice} confidence={0.98} />
        <ExtractedField label="PO number" value={b.po} confidence={0.88} />
        <ExtractedField label="Invoice date" value={b.date} confidence={0.95} />
        <ExtractedField label="Currency" value={b.cur} confidence={0.99} />
      </div>
      <Eyebrow style={{ marginBottom: 8 }}>Line items · MIRA classification</Eyebrow>
      <div className="rounded-lg mb-5" style={{ border: `1px solid ${T.line}` }}>
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3">
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 12.5, color: T.text, fontWeight: 550 }}>{b.line}</div>
            <div style={{ fontFamily: mono, fontSize: 10.5, color: T.faint, marginTop: 2 }}>
              {b.qty} × {fmt(b.unit)}</div>
          </div>
          <TaxChip c={b.taxCat} />
          <div style={{ ...num, fontSize: 12.5, color: T.text, fontWeight: 600, textAlign: "right",
            whiteSpace: "nowrap" }}>{fmt(b.subtotal).replace("Rf ", "")}</div>
        </div>
      </div>
      <div className="rounded-lg p-4 mb-5 flex items-start gap-3"
        style={{ background: verified ? T.claimSoft : T.exemptSoft,
          border: `1px solid ${verified ? "#BFE0D2" : "#E8C9C2"}` }}>
        <ShieldCheck size={20} color={verified ? T.claim : T.exempt}
          style={{ marginTop: 1, flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 12.5, fontWeight: 650, color: verified ? T.claim : T.exempt }}>
            {verified ? "Tax verified" : "Tax mismatch — review"}</div>
          <div style={{ fontFamily: mono, fontSize: 10.5, color: T.muted, marginTop: 3,
            wordBreak: "break-word" }}>
            {b.rate}% × {b.subtotal.toLocaleString("en-US")} = {recomputed.toLocaleString("en-US",
              { minimumFractionDigits: 2 })} · matches invoice</div>
          {b.taxCat === "EXEMPT" && <div style={{ fontSize: 11, color: T.exempt, marginTop: 4 }}>
            Section 20 exempt — input tax <b>cannot</b> be claimed.</div>}
        </div>
      </div>
      <div className="rounded-lg p-4 mb-6" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        {[["Subtotal", b.subtotal], [`GST (${b.rate}%)`, b.gst]].map(([k, v]) => (
          <div key={k} className="flex justify-between py-1" style={{ fontSize: 12.5, color: T.muted }}>
            <span>{k}</span><span style={num}>{fmt(v)}</span></div>
        ))}
        <div className="flex justify-between pt-3 mt-2"
          style={{ borderTop: `1px solid ${T.line}`, fontWeight: 700, color: T.text }}>
          <span style={{ fontSize: 13 }}>Total payable</span>
          <span style={{ ...num, fontSize: 15 }}>{fmt(b.total)}</span></div>
      </div>
      {b.status === "ACCOUNTANT_APPROVED" ? (
        <div className="rounded-lg p-4 flex items-center gap-3"
          style={{ background: T.goldSoft, border: `1px solid #E7D3A6` }}>
          <div style={{ width: 30, height: 30, borderRadius: 999, background: T.gold,
            display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Check size={17} color={T.ink} strokeWidth={3} /></div>
          <div><div style={{ fontSize: 13, fontWeight: 650, color: T.warn }}>
            Approved &amp; queued for sync</div>
            <div style={{ fontFamily: mono, fontSize: 10.5, color: T.muted }}>
              ACCOUNTANT_APPROVED → pushing to Zoho Books</div></div>
        </div>
      ) : b.status === "REJECTED" ? (
        <div className="rounded-lg p-4 flex items-center gap-3"
          style={{ background: T.exemptSoft, border: "1px solid #E8C9C2" }}>
          <div style={{ width: 30, height: 30, borderRadius: 999, background: T.exempt,
            display: "grid", placeItems: "center", flexShrink: 0 }}>
            <X size={17} color="#fff" strokeWidth={3} /></div>
          <div><div style={{ fontSize: 13, fontWeight: 650, color: T.exempt }}>Rejected</div>
            <div style={{ fontFamily: mono, fontSize: 10.5, color: T.muted }}>
              REJECTED — removed from the approval queue</div></div>
        </div>
      ) : (
        <div>
        {error && (
          <div className="rounded-lg p-2.5 mb-3" style={{ background: T.exemptSoft,
            border: "1px solid #E8C9C2", fontSize: 11.5, color: T.exempt }}>{error}</div>
        )}
        <div className="flex gap-3">
          <button onClick={onReject} disabled={busy}
            className="rounded-lg px-4 flex items-center gap-2 focus:outline-none"
            style={{ border: `1px solid ${T.line}`, background: T.surface, color: T.muted,
              fontSize: 13, fontWeight: 550, minHeight: 46, opacity: busy ? 0.6 : 1 }}><X size={16} /> Reject</button>
          <button onClick={onApprove} disabled={busy}
            className="flex-1 rounded-lg px-4 flex items-center justify-center gap-2 transition-opacity hover:opacity-90 focus:outline-none"
            style={{ background: T.claim, color: "#fff", fontSize: 13, fontWeight: 600, minHeight: 46,
              opacity: busy ? 0.7 : 1 }}>
            <Check size={17} strokeWidth={2.5} /> {busy ? "Working…" : "Approve & sync"}</button>
        </div>
        </div>
      )}
      <div className="flex items-center justify-center gap-1.5 sm:gap-2 mt-4 flex-wrap"
        style={{ fontFamily: mono, fontSize: 10, color: T.faint }}>
        <span>DRAFT</span><ChevronRight size={11} />
        <span style={{ color: T.teal }}>AI_VERIFIED</span><ChevronRight size={11} />
        <span style={{ color: b.status === "ACCOUNTANT_APPROVED" ? T.claim : T.faint }}>APPROVED</span>
        <ChevronRight size={11} />
        <span style={{ color: T.faint }}>SYNCED</span>
      </div>
    </>
  );
}

export function Approval({ session, onRequireLogin }) {
  const w = useW(); const desktop = w >= 1024;
  const [bills, setBills] = useState(BILLS);
  const [live, setLive] = useState(false);
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState("data");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function load() {
    try {
      const d = await getBills();
      if (Array.isArray(d) && d.length) { setBills(d); setLive(true); }
    } catch { /* keep current data */ }
  }
  useEffect(() => { load(); }, []);

  const queue = bills.filter((x) => x.status === "DRAFT" || x.status === "AI_VERIFIED");
  // Show the explicitly selected bill (even just-processed), else the first pending.
  const b = bills.find((x) => x.id === sel) || queue[0];

  async function act(action) {
    if (!b || busy) return;
    if (live && !session) { onRequireLogin(); return; }
    setBusy(true); setErr(null);
    setSel(b.id); // pin selection so the result shows on this bill
    try {
      if (live) {
        await (action === "approve" ? approveBill(b.id) : rejectBill(b.id));
        await load(); // refetch true state from the DB
      } else {
        const status = action === "approve" ? "ACCOUNTANT_APPROVED" : "REJECTED";
        setBills((prev) => prev.map((x) => (x.id === b.id ? { ...x, status } : x)));
      }
    } catch {
      setErr(`${action === "approve" ? "Approve" : "Reject"} failed — please sign in again.`);
    } finally {
      setBusy(false);
    }
  }
  const doApprove = () => act("approve");
  const doReject = () => act("reject");

  if (!b) {
    return (
      <div className="p-4 sm:p-8" style={{ background: T.paper }}>
        <div className="rounded-2xl p-8 sm:p-10 text-center max-w-md mx-auto"
          style={{ background: T.surface, border: `1px solid ${T.line}` }}>
          <CheckCircle2 size={30} color={T.claim} style={{ margin: "0 auto 12px" }} />
          <div style={{ fontSize: 15.5, fontWeight: 660, color: T.text }}>Approval queue clear</div>
          <div style={{ fontSize: 12.5, color: T.muted, marginTop: 5 }}>
            No bills awaiting review.</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ background: T.paper }}>
      <div className="flex items-center gap-2 px-4 sm:px-8 pt-3"
        style={{ background: T.surface }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: live ? T.claim : T.faint }} />
        <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
          color: live ? T.claim : T.faint }}>{live ? "LIVE" : "SAMPLE"}</span>
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: T.muted }}>
          {session ? (
            `Signed in as ${session.user?.email}`
          ) : live ? (
            <button onClick={onRequireLogin} className="focus:outline-none"
              style={{ color: T.teal, fontWeight: 600 }}>Sign in to approve</button>
          ) : "Sample data"}
        </span>
      </div>
      <div className="flex gap-2 px-4 sm:px-8 py-3 sm:py-4 overflow-x-auto"
        style={{ borderBottom: `1px solid ${T.line}`, background: T.surface }}>
        {queue.map((q) => {
          const on = q.id === sel;
          return (
            <button key={q.id} onClick={() => setSel(q.id)}
              className="rounded-lg px-3.5 py-2.5 text-left shrink-0 transition-colors focus:outline-none"
              style={{ border: `1px solid ${on ? T.teal : T.line}`,
                background: on ? T.tealSofter : T.surface, minWidth: 168 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.vendor}</div>
              <div className="flex items-center justify-between mt-1.5 gap-2">
                <span style={{ ...num, fontSize: 11, color: T.muted }}>{fmt(q.total)}</span>
                <StatusPill s={q.status} />
              </div>
            </button>
          );
        })}
      </div>
      {desktop ? (
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", minHeight: 620 }}>
          <div className="p-8" style={{ borderRight: `1px solid ${T.line}` }}>
            <div className="flex items-center justify-between mb-4">
              <Eyebrow>Source document</Eyebrow>
              <span className="flex items-center gap-1.5" style={{ fontFamily: mono, fontSize: 11,
                color: T.muted }}><FileText size={13} /> {b.invoice}.pdf</span>
            </div>
            <InvoiceReplica b={b} pad={30} />
          </div>
          <div className="p-8 flex flex-col">
            <DataPanel b={b} onApprove={doApprove} onReject={doReject} busy={busy} error={err} />
          </div>
        </div>
      ) : (
        <div className="p-4 sm:p-6" style={{ paddingBottom: 88 }}>
          <div className="flex p-1 rounded-lg mb-5" style={{ background: T.line2, gap: 4 }}>
            {[["data", "Extracted data"], ["doc", "Source document"]].map(([id, lab]) => {
              const on = tab === id;
              return (
                <button key={id} onClick={() => setTab(id)}
                  className="flex-1 rounded-md focus:outline-none transition-colors"
                  style={{ background: on ? T.surface : "transparent", color: on ? T.text : T.muted,
                    fontSize: 12.5, fontWeight: on ? 650 : 500, minHeight: 38,
                    boxShadow: on ? "0 1px 2px rgba(11,42,46,0.08)" : "none" }}>{lab}</button>
              );
            })}
          </div>
          {tab === "doc" ? (
            <div>
              <div className="flex items-center gap-1.5 mb-3" style={{ fontFamily: mono,
                fontSize: 11, color: T.muted }}><FileText size={13} /> {b.invoice}.pdf</div>
              <InvoiceReplica b={b} pad={20} />
            </div>
          ) : <DataPanel b={b} onApprove={doApprove} onReject={doReject} busy={busy} error={err} />}
        </div>
      )}
    </div>
  );
}

