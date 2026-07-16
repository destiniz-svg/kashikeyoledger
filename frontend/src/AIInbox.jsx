import React, { useState, useEffect, useRef } from "react";
import { ScanLine, UploadCloud, FileText, Image as ImageIcon, Check, AlertTriangle,
  Sparkles, ChevronDown, X } from "lucide-react";
import { getDocuments, uploadDocument } from "./api.js";
import { T, mono, num, fmt, fmtDate, useW } from "./theme.js";
import { Eyebrow, KpiTile, TaxChip } from "./ui.jsx";

/* ---------------------------------------------------------------------------
   AI Inbox — upload a receipt / invoice / bill and let Claude read it. The file
   is stored, extracted into structured fields, categorised for MIRA (GGST 8% /
   TGST 17% / zero-rated / exempt / out-of-scope) and flagged for review.
--------------------------------------------------------------------------- */
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";
const MAX_FILE = 10 * 1024 * 1024; // 10 MB — matches the storage bucket limit

// Human-readable copy for the compliance / sanity flags the server derives.
const FLAG_LABEL = {
  MISSING_VENDOR_NAME: "No vendor name",
  MISSING_VENDOR_TIN: "No vendor TIN",
  MISSING_INVOICE_NUMBER: "No invoice number",
  MISSING_DATE: "No date",
  NO_LINE_ITEMS: "No line items",
  FOREIGN_CURRENCY_NO_FX: "FX rate missing",
  TOTALS_MISMATCH: "Totals don't add up",
  LINE_ITEMS_SUM_MISMATCH: "Lines ≠ subtotal",
  MIXED_TAX_CATEGORIES: "Mixed tax rates",
  LOW_CONFIDENCE: "Low confidence",
};
const flagText = (f) => FLAG_LABEL[f] || String(f).toLowerCase().replace(/_/g, " ");

// A canned document so the screen tells its story before you sign in / upload.
const SAMPLE_DOCS = [
  {
    id: "doc-sample-1",
    fileName: "island-mark-hardware-IMH-4471.jpg",
    mimeType: "image/jpeg",
    byteSize: 384_210,
    status: "EXTRACTED",
    captureSource: "MANUAL_UPLOAD",
    createdAt: "2026-07-14T09:20:00.000Z",
    model: "claude-opus-4-8",
    extraction: {
      documentType: "INVOICE",
      vendorName: "Island Mark Hardware Pvt Ltd",
      vendorTin: null,
      invoiceNumber: "IMH-4471",
      documentDate: "2026-05-11",
      dueDate: "2026-05-26",
      currency: "MVR",
      fxRateToMvr: null,
      lines: [
        { description: "Assorted fixings & tools", quantity: 12, unitPrice: 358.33, amount: 4300,
          taxCategory: "GGST", taxRatePercent: 8, accountingCategory: "Hardware" },
      ],
      subtotal: 4300, taxTotal: 344, grandTotal: 4644,
      accountingCategory: "Hardware",
      predictedTaxCategory: "GGST",
      confidenceScore: 0.82,
      aiReasoning:
        "General hardware supplies at the 8% GGST rate — no tourism indicators. " +
        "The vendor's TIN isn't printed, so confirm it before claiming input tax.",
      fieldConfidence: { vendor_name: 0.9, grand_total: 0.88, predicted_tax_category: 0.8 },
      validationFlags: ["MISSING_VENDOR_TIN"],
    },
  },
  {
    id: "doc-sample-2",
    fileName: "reef-divers-receipt.pdf",
    mimeType: "application/pdf",
    byteSize: 118_004,
    status: "EXTRACTED",
    captureSource: "MANUAL_UPLOAD",
    createdAt: "2026-07-13T14:02:00.000Z",
    model: "claude-opus-4-8",
    extraction: {
      documentType: "RECEIPT",
      vendorName: "Reef Divers Maldives",
      vendorTin: "1032117GST001",
      invoiceNumber: "RD-2026-8841",
      documentDate: "2026-07-09",
      dueDate: null,
      currency: "USD",
      fxRateToMvr: 15.42,
      lines: [
        { description: "Guided dive excursion (2 pax)", quantity: 2, unitPrice: 95, amount: 190,
          taxCategory: "TGST", taxRatePercent: 17, accountingCategory: "Tourism activities" },
      ],
      subtotal: 190, taxTotal: 32.3, grandTotal: 222.3,
      accountingCategory: "Tourism activities",
      predictedTaxCategory: "TGST",
      confidenceScore: 0.91,
      aiReasoning:
        "Dive excursion billed by a tourism operator — the 17% TGST rate applies. " +
        "Invoiced in USD with a stated rate of 15.42 to MVR.",
      fieldConfidence: { vendor_name: 0.95, vendor_tin: 0.9, grand_total: 0.93, predicted_tax_category: 0.92 },
      validationFlags: [],
    },
  },
];

const readAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.readAsDataURL(file);
  });

function ConfidenceBar({ score }) {
  const pct = Math.round((score ?? 0) * 100);
  const color = pct >= 80 ? T.claim : pct >= 60 ? T.warn : T.exempt;
  return (
    <div className="flex items-center gap-2" style={{ minWidth: 96 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 999, background: T.line2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999 }} />
      </div>
      <span style={{ fontFamily: mono, fontSize: 10.5, fontWeight: 700, color }}>{pct}%</span>
    </div>
  );
}

function DocRow({ doc }) {
  const [open, setOpen] = useState(false);
  const e = doc.extraction;
  const isPdf = doc.mimeType === "application/pdf";
  const flags = e?.validationFlags || [];
  const failed = doc.status === "EXTRACTION_FAILED";
  const pending = doc.status === "UPLOADED" || doc.status === "EXTRACTING";

  return (
    <div style={{ borderTop: `1px solid ${T.line2}` }}>
      <button onClick={() => e && setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 sm:px-6 py-3.5 text-left focus:outline-none"
        style={{ cursor: e ? "pointer" : "default", background: "transparent" }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: isPdf ? T.exemptSoft : T.tealSoft, display: "grid", placeItems: "center" }}>
          {isPdf ? <FileText size={17} color={T.exempt} /> : <ImageIcon size={17} color={T.teal} />}
        </div>
        <div className="min-w-0 flex-1">
          <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {e?.vendorName || doc.fileName}</div>
          <div style={{ fontFamily: mono, fontSize: 10.5, color: T.faint, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {e ? `${e.invoiceNumber || "—"} · ${fmtDate(e.documentDate)}` : doc.fileName}
            {e?.vendorTin ? ` · TIN ${e.vendorTin}` : ""}</div>
        </div>
        {e && <TaxChip c={e.predictedTaxCategory} />}
        <div className="hidden sm:block" style={{ textAlign: "right", minWidth: 96 }}>
          {e?.grandTotal != null && (
            <div style={{ ...num, fontSize: 13, fontWeight: 650, color: T.text }}>
              {fmt(e.grandTotal, e.currency)}</div>
          )}
          {e && <div style={{ marginTop: 3 }}><ConfidenceBar score={e.confidenceScore} /></div>}
        </div>
        {failed ? (
          <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: T.exempt,
            background: T.exemptSoft, padding: "3px 8px", borderRadius: 999 }}>FAILED</span>
        ) : pending ? (
          <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: T.warn,
            background: T.warnSoft, padding: "3px 8px", borderRadius: 999 }}>PENDING</span>
        ) : (
          <ChevronDown size={16} color={T.faint}
            style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
        )}
      </button>

      {open && e && (
        <div className="px-4 sm:px-6 pb-5" style={{ background: T.paper }}>
          {flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1 pb-3">
              {flags.map((f) => (
                <span key={f} style={{ display: "inline-flex", alignItems: "center", gap: 4,
                  fontFamily: mono, fontSize: 10.5, fontWeight: 600, color: T.warn,
                  background: T.warnSoft, padding: "3px 9px", borderRadius: 999 }}>
                  <AlertTriangle size={11} />{flagText(f)}</span>
              ))}
            </div>
          )}

          {/* AI reasoning */}
          <div className="rounded-xl p-3.5 mb-3" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles size={13} color={T.teal} />
              <Eyebrow>Why this categorisation</Eyebrow>
            </div>
            <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>{e.aiReasoning || "—"}</div>
          </div>

          {/* Line items */}
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.line}`, background: T.surface }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: T.paper }}>
                {["Item", "Qty", "Unit", "Amount", "Tax"].map((h, i) => (
                  <th key={i} style={{ textAlign: i >= 1 && i <= 3 ? "right" : "left", padding: "9px 12px",
                    fontFamily: mono, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase",
                    color: T.faint, fontWeight: 600, borderBottom: `1px solid ${T.line}` }}>{h}</th>
                ))}</tr></thead>
              <tbody>
                {e.lines.map((l, i) => (
                  <tr key={i} style={{ borderTop: i ? `1px solid ${T.line2}` : "none" }}>
                    <td style={{ padding: "9px 12px", fontSize: 12.5, color: T.text }}>
                      {l.description || "—"}
                      {l.accountingCategory && (
                        <span style={{ fontFamily: mono, fontSize: 10, color: T.faint, marginLeft: 6 }}>
                          {l.accountingCategory}</span>
                      )}</td>
                    <td style={{ ...num, padding: "9px 12px", fontSize: 12, color: T.muted, textAlign: "right" }}>{l.quantity}</td>
                    <td style={{ ...num, padding: "9px 12px", fontSize: 12, color: T.muted, textAlign: "right" }}>{fmt(l.unitPrice, e.currency)}</td>
                    <td style={{ ...num, padding: "9px 12px", fontSize: 12, fontWeight: 600, color: T.text, textAlign: "right" }}>{fmt(l.amount, e.currency)}</td>
                    <td style={{ padding: "9px 12px", textAlign: "left" }}><TaxChip c={l.taxCategory} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-3 py-2.5"
              style={{ borderTop: `1px solid ${T.line}`, background: T.paper }}>
              {e.subtotal != null && <Total label="Subtotal" v={fmt(e.subtotal, e.currency)} />}
              {e.taxTotal != null && <Total label="Tax" v={fmt(e.taxTotal, e.currency)} />}
              {e.grandTotal != null && <Total label="Total" v={fmt(e.grandTotal, e.currency)} strong />}
              {e.currency !== "MVR" && e.fxRateToMvr && (
                <Total label={`FX → MVR`} v={String(e.fxRateToMvr)} />
              )}
              <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 10, color: T.faint }}>
                {doc.model || "—"}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
const Total = ({ label, v, strong }) => (
  <span className="inline-flex items-baseline gap-1.5">
    <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: T.faint }}>{label}</span>
    <span style={{ ...num, fontSize: strong ? 13 : 12, fontWeight: strong ? 700 : 600, color: T.text }}>{v}</span>
  </span>
);

export function AIInbox({ session, onRequireLogin }) {
  const w = useW(); const wide = w >= 768;
  const [docs, setDocs] = useState(SAMPLE_DOCS);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  async function load() {
    try {
      const d = await getDocuments();
      if (d?.documents) { setDocs(d.documents); setLive(true); }
    } catch { /* keep sample */ }
  }
  useEffect(() => { load(); }, []);

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length || busy) return;
    if (live && !session) { onRequireLogin(); return; }
    setErr(null); setNote(null);
    for (const f of files) {
      if (f.size > MAX_FILE) { setErr(`"${f.name}" is larger than 10 MB.`); continue; }
      if (!ACCEPT.split(",").includes(f.type)) {
        setErr(`"${f.name}" isn't a supported type (PNG, JPG, WEBP, GIF or PDF).`); continue;
      }
      setBusy(true);
      try {
        if (live) {
          const b64 = await readAsBase64(f);
          const res = await uploadDocument(f.name, f.type, b64);
          await load();
          if (res?.error) setNote(res.error);
          else if (res?.duplicate) setNote(`"${f.name}" was already uploaded — showing the saved extraction.`);
        } else {
          // Offline: show what an upload would produce, nothing persists.
          setNote("Sample mode — sign in to store the file and run a live extraction.");
        }
      } catch (ex) {
        const m = String(ex?.message || "");
        setErr(m.includes("413") ? "That file is too large to upload."
          : m.includes("401") || m.includes("403") ? "Please sign in to upload."
            : "Upload failed. Please try again.");
      } finally { setBusy(false); }
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  const extracted = docs.filter((d) => d.status === "EXTRACTED").length;
  const needsReview = docs.filter((d) => (d.extraction?.validationFlags?.length ?? 0) > 0).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8" style={{ background: T.paper }}>
      <div className="flex items-center gap-2 mb-4">
        <Eyebrow>AI Inbox &middot; document ingestion</Eyebrow>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: mono,
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", color: live ? T.claim : T.faint }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: live ? T.claim : T.faint }} />
          {live ? "LIVE" : "SAMPLE"}</span>
      </div>

      {/* Dropzone */}
      <label
        onDragOver={(ev) => { ev.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(ev) => { ev.preventDefault(); setDrag(false); handleFiles(ev.dataTransfer.files); }}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 9,
          border: `1.5px dashed ${drag ? T.teal : T.line}`, borderRadius: 16, padding: "30px 18px",
          background: drag ? T.tealSofter : T.surface, cursor: busy ? "default" : "pointer",
          textAlign: "center", transition: "background .15s, border-color .15s" }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: T.tealSoft,
          display: "grid", placeItems: "center" }}>
          {busy ? <ScanLine size={24} color={T.teal} style={{ animation: "kpulse 1s ease-in-out infinite" }} />
            : <UploadCloud size={24} color={T.teal} />}
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 650, color: T.text }}>
          {busy ? "Reading your document…" : "Drop a receipt, invoice or bill"}</div>
        <div style={{ fontFamily: mono, fontSize: 11, color: T.faint }}>
          PNG · JPG · WEBP · GIF · PDF, up to 10 MB — Claude extracts and categorises it for MIRA</div>
        <span style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 6, background: T.ink,
          color: "#fff", borderRadius: 10, padding: "8px 16px", fontSize: 12.5, fontWeight: 600 }}>
          <UploadCloud size={15} /> Choose file</span>
        <input ref={inputRef} type="file" accept={ACCEPT} multiple onChange={(ev) => handleFiles(ev.target.files)}
          style={{ display: "none" }} disabled={busy} />
      </label>

      {err && (
        <div className="mt-3 flex items-center gap-2" style={{ background: T.exemptSoft, color: T.exempt,
          borderRadius: 10, padding: "10px 12px", fontSize: 12.5 }}>
          <X size={15} />{err}</div>
      )}
      {note && !err && (
        <div className="mt-3 flex items-center gap-2" style={{ background: T.tealSoft, color: T.teal,
          borderRadius: 10, padding: "10px 12px", fontSize: 12.5 }}>
          <Check size={15} />{note}</div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 my-5">
        <KpiTile label="Documents" value={String(docs.length)} accent={T.text} />
        <KpiTile label="Extracted" value={String(extracted)} accent={extracted ? T.claim : T.text} />
        <KpiTile label="Needs review" value={String(needsReview)} accent={needsReview ? T.warn : T.claim} />
      </div>

      {/* Documents list */}
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${T.line}`, background: T.surface }}>
        <div className="flex items-center gap-2 px-4 sm:px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <ScanLine size={16} color={T.teal} />
          <div style={{ fontSize: 14.5, fontWeight: 650, color: T.text }}>Processed documents</div>
          {!wide && <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 10.5, color: T.faint }}>{docs.length}</span>}
        </div>
        {docs.length === 0 ? (
          <div style={{ padding: "34px 16px", textAlign: "center", fontFamily: mono, fontSize: 12, color: T.faint }}>
            No documents yet — upload one above to get started.</div>
        ) : (
          docs.map((d) => <DocRow key={d.id} doc={d} />)
        )}
      </div>
    </div>
  );
}
