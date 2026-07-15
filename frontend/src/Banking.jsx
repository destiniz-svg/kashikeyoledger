import React, { useState, useEffect } from "react";
import { Landmark, Check, X, ArrowUpRight, ArrowDownLeft, Link2, UploadCloud } from "lucide-react";
import { getBanking, confirmBankTxn, excludeBankTxn, unmatchBankTxn, importStatement } from "./api.js";
import { parseStatementCsv } from "./statement.js";
import { T, mono, sans, num, fmt, dec2, fmtDate, useW } from "./theme.js";
import { Eyebrow, KpiTile } from "./ui.jsx";

/* ---------------------------------------------------------------------------
   Banking — bank accounts + statement reconciliation
--------------------------------------------------------------------------- */
const RECON_META = {
  MATCHED: { t: "Matched", bg: T.claimSoft, fg: T.claim },
  SUGGESTED: { t: "Suggested", bg: T.goldSoft, fg: T.warn },
  UNMATCHED: { t: "Unmatched", bg: T.exemptSoft, fg: T.exempt },
  EXCLUDED: { t: "Excluded", bg: "#EEF1EF", fg: T.muted },
};
const ReconChip = ({ s }) => {
  const x = RECON_META[s] || RECON_META.UNMATCHED;
  return <span style={{ background: x.bg, color: x.fg, fontFamily: mono, fontSize: 11,
    padding: "3px 9px", borderRadius: 999, fontWeight: 600, whiteSpace: "nowrap" }}>{x.t}</span>;
};
const BANKING_DEMO = {
  currency: "MVR", mvrBalance: 246048.63,
  summary: { total: 13, unmatched: 4, suggested: 3, matched: 4, excluded: 2, unreconciled: 7 },
  accounts: [
    { id: "ba-mvr", name: "Business Current", bankName: "Bank of Maldives", accountMasked: "•••• 4021", currency: "MVR", linkedAccount: true, balance: 246048.63, txnCount: 11, unreconciled: 5 },
    { id: "ba-usd", name: "USD Settlement", bankName: "Bank of Maldives", accountMasked: "•••• 8837", currency: "USD", linkedAccount: false, balance: 9750, txnCount: 2, unreconciled: 2 },
  ],
  transactions: [
    { id: "bt-1", accountName: "Business Current", date: "12 Jul 2026", type: "TRANSFER", reference: "FT26071240", counterparty: "Card Settlement", narrative: "POS card settlement — BML Merchant", direction: "CREDIT", amount: 27300, currency: "MVR", reconStatus: "SUGGESTED", matchedVendor: null },
    { id: "bt-2", accountName: "Business Current", date: "10 Jul 2026", type: "TRANSFER", reference: "FT26071005", counterparty: "Payroll", narrative: "Staff salary — July", direction: "DEBIT", amount: -12000, currency: "MVR", reconStatus: "EXCLUDED", matchedVendor: null },
    { id: "bt-3", accountName: "Business Current", date: "06 Jul 2026", type: "TRANSFER", reference: "FT26070619", counterparty: "Island Choice LLP", narrative: "Payment IC-7781", direction: "DEBIT", amount: -232.2, currency: "MVR", reconStatus: "MATCHED", matchedVendor: "Island Choice LLP" },
    { id: "bt-4", accountName: "Business Current", date: "02 Jul 2026", type: "TRANSFER", reference: "FT26070211", counterparty: "MTCC", narrative: "Incoming transfer", direction: "CREDIT", amount: 18750, currency: "MVR", reconStatus: "UNMATCHED", matchedVendor: null },
    { id: "bt-5", accountName: "Business Current", date: "28 Jun 2026", type: "TRANSFER", reference: "FT26062830", counterparty: "Beaver Builders", narrative: "Transfer", direction: "DEBIT", amount: -4572.42, currency: "MVR", reconStatus: "UNMATCHED", matchedVendor: null },
    { id: "bt-7", accountName: "Business Current", date: "18 Jun 2026", type: "TRANSFER", reference: "FT26061808", counterparty: "Ives Private Limited", narrative: "Supplier payment", direction: "DEBIT", amount: -6522.75, currency: "MVR", reconStatus: "SUGGESTED", matchedVendor: "Ives Private Limited" },
    { id: "bt-10", accountName: "Business Current", date: "05 Jun 2026", type: "TRANSFER", reference: "FT26060544", counterparty: "Altura Pvt Ltd", narrative: "Payment ALT/INV-000024", direction: "DEBIT", amount: -98280, currency: "MVR", reconStatus: "MATCHED", matchedVendor: "Altura Pvt Ltd" },
    { id: "bt-12", accountName: "USD Settlement", date: "08 Jul 2026", type: "WIRE", reference: "TT26070801", counterparty: "Export Receipt", narrative: "Inbound settlement", direction: "CREDIT", amount: 3200, currency: "USD", reconStatus: "UNMATCHED", matchedVendor: null },
    { id: "bt-13", accountName: "USD Settlement", date: "20 Jun 2026", type: "WIRE", reference: "TT26062001", counterparty: "Overseas Supplier", narrative: "Import wire", direction: "DEBIT", amount: -1450, currency: "USD", reconStatus: "UNMATCHED", matchedVendor: null },
  ],
};
const BANK_FILTERS = [
  ["all", "All"],
  ["review", "Needs review"],
  ["MATCHED", "Matched"],
  ["EXCLUDED", "Excluded"],
];

// Recompute the summary counts from the current transaction list (keeps the
// SAMPLE view honest after optimistic edits, without a refetch).
function reconSummary(transactions) {
  const s = { total: transactions.length, unmatched: 0, suggested: 0, matched: 0, excluded: 0 };
  for (const t of transactions) {
    if (t.reconStatus === "UNMATCHED") s.unmatched++;
    else if (t.reconStatus === "SUGGESTED") s.suggested++;
    else if (t.reconStatus === "MATCHED") s.matched++;
    else if (t.reconStatus === "EXCLUDED") s.excluded++;
  }
  s.unreconciled = s.unmatched + s.suggested;
  return s;
}

// Modal: pick an account, drop a BML CSV, preview the parse, then import.
function ImportModal({ accounts, live, session, onRequireLogin, onClose, onImported }) {
  const [acctId, setAcctId] = useState(accounts[0]?.id || "");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(null); // { lines, skipped, period, error }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(null); // { imported, duplicates, total }

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name); setErr(null); setDone(null);
    const reader = new FileReader();
    reader.onload = () => {
      try { setParsed(parseStatementCsv(String(reader.result || ""))); }
      catch { setParsed({ lines: [], skipped: 0, period: null, error: "Couldn't read that file." }); }
    };
    reader.readAsText(f);
  }

  async function doImport() {
    if (busy || !parsed?.lines?.length) return;
    if (live && !session) { onRequireLogin(); return; }
    setBusy(true); setErr(null);
    try {
      if (live) {
        const res = await importStatement(acctId, parsed.lines);
        setDone(res);
        onImported();
      } else {
        // Offline preview: report what would import, nothing persists.
        setDone({ imported: parsed.lines.length, duplicates: 0, total: parsed.lines.length, sample: true });
      }
    } catch {
      setErr("Import failed — please sign in again.");
    } finally { setBusy(false); }
  }

  const lines = parsed?.lines || [];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,42,46,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-2xl w-full"
        style={{ background: T.surface, border: `1px solid ${T.line}`, maxWidth: 560, maxHeight: "88vh",
          overflow: "auto", boxShadow: "0 24px 60px rgba(11,42,46,0.28)" }}>
        <div className="flex items-center justify-between px-5 sm:px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontSize: 15, fontWeight: 680, color: T.text }}>Import bank statement</div>
          <button onClick={onClose} style={{ color: T.faint, cursor: "pointer" }}><X size={18} /></button>
        </div>

        <div className="px-5 sm:px-6 py-5 flex flex-col gap-4">
          {done ? (
            <div className="flex flex-col items-center text-center py-4 gap-2">
              <div style={{ width: 46, height: 46, borderRadius: 999, background: T.claimSoft,
                display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Check size={22} color={T.claim} strokeWidth={2.5} /></div>
              <div style={{ fontSize: 15, fontWeight: 650, color: T.text }}>
                {done.imported} line{done.imported === 1 ? "" : "s"} imported</div>
              <div style={{ fontSize: 12.5, color: T.muted }}>
                {done.duplicates} duplicate{done.duplicates === 1 ? "" : "s"} skipped · {done.total} in file
                {done.sample && " · sample only (sign in to persist)"}</div>
              <button onClick={onClose} className="mt-3" style={{ background: T.ink, color: "#fff",
                borderRadius: 10, padding: "9px 20px", fontSize: 13, fontWeight: 550, cursor: "pointer" }}>Done</button>
            </div>
          ) : (
            <>
              <div>
                <Eyebrow>Account</Eyebrow>
                <select value={acctId} onChange={(e) => setAcctId(e.target.value)}
                  className="w-full mt-1.5" style={{ border: `1px solid ${T.line}`, borderRadius: 10,
                    padding: "9px 11px", fontSize: 13, color: T.text, background: T.surface,
                    fontFamily: sans }}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} · {a.currency} · {a.accountMasked}</option>
                  ))}
                </select>
              </div>

              <label style={{ border: `1.5px dashed ${T.line}`, borderRadius: 12, padding: "22px 16px",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 7, cursor: "pointer",
                background: T.paper, textAlign: "center" }}>
                <UploadCloud size={26} color={T.teal} />
                <div style={{ fontSize: 13, fontWeight: 550, color: T.text }}>
                  {fileName || "Choose a CSV file"}</div>
                <div style={{ fontFamily: mono, fontSize: 10.5, color: T.faint }}>
                  BML statement export · Date, Description, Debit/Credit, Balance</div>
                <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: "none" }} />
              </label>

              {parsed?.error && (
                <div style={{ background: T.exemptSoft, color: T.exempt, borderRadius: 10,
                  padding: "10px 12px", fontSize: 12.5 }}>{parsed.error}</div>
              )}

              {lines.length > 0 && (
                <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
                  <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: T.paper,
                    borderBottom: `1px solid ${T.line}` }}>
                    <span style={{ ...num, fontSize: 12.5, fontWeight: 650, color: T.text }}>
                      {lines.length} line{lines.length === 1 ? "" : "s"} ready</span>
                    {parsed.skipped > 0 && <span style={{ fontFamily: mono, fontSize: 10.5, color: T.warn }}>
                      {parsed.skipped} skipped</span>}
                    {parsed.period && <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 10.5, color: T.faint }}>
                      {fmtDate(parsed.period.from)} – {fmtDate(parsed.period.to)}</span>}
                  </div>
                  <div>
                    {lines.slice(0, 4).map((l, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2"
                        style={{ borderTop: i ? `1px solid ${T.line2}` : "none" }}>
                        <span style={{ ...num, fontSize: 11, color: T.faint, width: 78 }}>{fmtDate(l.date)}</span>
                        <span style={{ fontSize: 12, color: T.text, flex: 1, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {l.narrative || l.counterparty || l.reference || "—"}</span>
                        <span style={{ ...num, fontSize: 12, fontWeight: 600,
                          color: l.direction === "CREDIT" ? T.claim : T.text }}>
                          {l.direction === "CREDIT" ? "+" : "−"}{dec2(l.amount)}</span>
                      </div>
                    ))}
                    {lines.length > 4 && (
                      <div className="px-3 py-2" style={{ borderTop: `1px solid ${T.line2}`,
                        fontFamily: mono, fontSize: 10.5, color: T.faint }}>
                        +{lines.length - 4} more</div>
                    )}
                  </div>
                </div>
              )}

              {err && <div style={{ color: T.exempt, fontSize: 12.5 }}>{err}</div>}

              <div className="flex items-center gap-2 justify-end">
                <button onClick={onClose} style={{ border: `1px solid ${T.line}`, borderRadius: 10,
                  padding: "9px 16px", fontSize: 13, fontWeight: 550, color: T.muted, background: T.surface,
                  cursor: "pointer" }}>Cancel</button>
                <button onClick={doImport} disabled={busy || !lines.length}
                  style={{ background: lines.length ? T.ink : T.line, color: "#fff", borderRadius: 10,
                    padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: lines.length ? "pointer" : "default",
                    display: "inline-flex", alignItems: "center", gap: 6, opacity: busy ? 0.7 : 1 }}>
                  <UploadCloud size={15} />{busy ? "Importing…" : `Import ${lines.length || ""}`.trim()}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function Banking({ session, onRequireLogin }) {
  const w = useW(); const wide = w >= 768;
  const [data, setData] = useState(BANKING_DEMO);
  const [live, setLive] = useState(false);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(null); // id (or "bulk") currently being acted on
  const [err, setErr] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  async function load() {
    try {
      const d = await getBanking();
      if (d?.accounts) { setData(d); setLive(true); }
    } catch { /* keep current data */ }
  }
  useEffect(() => { load(); }, []);

  const ACTIONS = {
    confirm: { status: "MATCHED", call: confirmBankTxn },
    exclude: { status: "EXCLUDED", call: excludeBankTxn },
    unmatch: { status: "UNMATCHED", call: unmatchBankTxn },
  };
  // Apply a reconciliation transition to one line — live via the API (refetch
  // after), or optimistically against the SAMPLE data when offline.
  async function act(id, action) {
    if (busy) return;
    if (live && !session) { onRequireLogin(); return; }
    setBusy(id); setErr(null);
    try {
      if (live) {
        await ACTIONS[action].call(id);
        await load();
      } else {
        const status = ACTIONS[action].status;
        setData((prev) => ({ ...prev, transactions: prev.transactions.map((t) =>
          t.id === id ? { ...t, reconStatus: status,
            matchedVendor: status === "UNMATCHED" ? null : t.matchedVendor } : t) }));
      }
    } catch {
      setErr("Action failed — please sign in again.");
    } finally { setBusy(null); }
  }
  // Bulk-confirm every SUGGESTED line in one review pass.
  async function confirmAllSuggested() {
    if (busy) return;
    if (live && !session) { onRequireLogin(); return; }
    const ids = data.transactions.filter((t) => t.reconStatus === "SUGGESTED").map((t) => t.id);
    if (!ids.length) return;
    setBusy("bulk"); setErr(null);
    try {
      if (live) {
        for (const id of ids) await confirmBankTxn(id);
        await load();
      } else {
        setData((prev) => ({ ...prev, transactions: prev.transactions.map((t) =>
          t.reconStatus === "SUGGESTED" ? { ...t, reconStatus: "MATCHED" } : t) }));
      }
    } catch {
      setErr("Bulk confirm failed — please sign in again.");
    } finally { setBusy(null); }
  }

  const s = live ? (data.summary || reconSummary(data.transactions)) : reconSummary(data.transactions);
  const suggestedCount = data.transactions.filter((t) => t.reconStatus === "SUGGESTED").length;

  // Buttons offered per line depend on its current reconciliation state.
  const ActBtn = ({ onClick, tone, children }) => (
    <button onClick={onClick} disabled={!!busy}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: mono, fontSize: 10.5,
        fontWeight: 600, letterSpacing: "0.02em", padding: "4px 9px", borderRadius: 7, cursor: busy ? "default" : "pointer",
        border: `1px solid ${tone === "confirm" ? T.claim : tone === "exclude" ? T.line : T.line}`,
        background: tone === "confirm" ? T.claimSoft : T.surface,
        color: tone === "confirm" ? T.claim : T.muted, opacity: busy ? 0.55 : 1, whiteSpace: "nowrap" }}>
      {children}</button>
  );
  const rowActions = (t) => {
    const b = busy === t.id;
    if (t.reconStatus === "MATCHED" || t.reconStatus === "EXCLUDED")
      return <ActBtn onClick={() => act(t.id, "unmatch")} tone="undo">{b ? "…" : "Undo"}</ActBtn>;
    return (
      <div className="flex items-center gap-1.5">
        <ActBtn onClick={() => act(t.id, "confirm")} tone="confirm">
          <Check size={11} strokeWidth={2.5} />{b ? "…" : "Confirm"}</ActBtn>
        <ActBtn onClick={() => act(t.id, "exclude")} tone="exclude">Exclude</ActBtn>
      </div>
    );
  };
  const txns = data.transactions.filter((t) =>
    filter === "all" ? true
      : filter === "review" ? ["UNMATCHED", "SUGGESTED"].includes(t.reconStatus)
        : t.reconStatus === filter);

  return (
    <div className="p-4 sm:p-6 lg:p-8" style={{ background: T.paper }}>
      <div className="flex items-center gap-2 mb-4">
        <Eyebrow>Banking &amp; reconciliation</Eyebrow>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: mono,
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", color: live ? T.claim : T.faint }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: live ? T.claim : T.faint }} />
          {live ? "LIVE" : "SAMPLE"}</span>
        <button onClick={() => setImportOpen(true)} style={{ marginLeft: "auto",
          display: "inline-flex", alignItems: "center", gap: 6, background: T.ink, color: "#fff",
          borderRadius: 10, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          <UploadCloud size={15} /> Import statement</button>
      </div>
      {importOpen && (
        <ImportModal accounts={data.accounts} live={live} session={session}
          onRequireLogin={onRequireLogin} onClose={() => setImportOpen(false)} onImported={load} />
      )}

      {/* Account cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
        {data.accounts.map((a) => (
          <div key={a.id} className="rounded-2xl p-5" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div style={{ width: 38, height: 38, borderRadius: 11, background: T.tealSoft,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Landmark size={18} color={T.teal} />
                </div>
                <div className="min-w-0">
                  <div style={{ fontSize: 14, fontWeight: 650, color: T.text }}>{a.name}</div>
                  <div style={{ fontFamily: mono, fontSize: 11, color: T.faint }}>
                    {a.bankName} · {a.accountMasked}</div>
                </div>
              </div>
              <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
                color: a.linkedAccount ? T.claim : T.faint, display: "inline-flex", alignItems: "center", gap: 3,
                whiteSpace: "nowrap" }}>
                <Link2 size={11} />{a.linkedAccount ? "Linked" : "Unlinked"}</span>
            </div>
            <div className="flex items-end justify-between mt-4">
              <div>
                <Eyebrow>Balance</Eyebrow>
                <div style={{ ...num, fontSize: 22, fontWeight: 680, color: T.text,
                  letterSpacing: "-0.02em", marginTop: 3 }}>
                  {fmt(a.balance, a.currency)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ ...num, fontSize: 12.5, color: T.muted }}>{a.txnCount} lines</div>
                <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 600,
                  color: a.unreconciled ? T.warn : T.claim, marginTop: 2 }}>
                  {a.unreconciled ? `${a.unreconciled} to review` : "reconciled"}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Reconciliation summary */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-5">
        <KpiTile label="Statement lines" value={String(s.total)} accent={T.text} />
        <KpiTile label="Matched" value={String(s.matched)} accent={s.matched ? T.claim : T.text} />
        <KpiTile label="To reconcile" value={String(s.unreconciled)} accent={s.unreconciled ? T.warn : T.claim} />
      </div>

      {/* Transactions */}
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${T.line}`, background: T.surface }}>
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontSize: 14.5, fontWeight: 650, color: T.text }}>Bank statement</div>
          {suggestedCount > 0 && (
            <button onClick={confirmAllSuggested} disabled={busy === "bulk"}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: mono,
                fontSize: 10.5, fontWeight: 600, letterSpacing: "0.03em", padding: "5px 11px",
                borderRadius: 999, cursor: busy ? "default" : "pointer", border: `1px solid ${T.claim}`,
                background: T.claimSoft, color: T.claim, opacity: busy === "bulk" ? 0.6 : 1 }}>
              <Check size={12} strokeWidth={2.5} />
              {busy === "bulk" ? "Confirming…" : `Confirm ${suggestedCount} suggested`}</button>
          )}
          <div className="flex items-center gap-1.5" style={{ marginLeft: "auto" }}>
            {BANK_FILTERS.map(([id, label]) => {
              const on = filter === id;
              return (
                <button key={id} onClick={() => setFilter(id)}
                  style={{ fontFamily: mono, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.03em",
                    padding: "5px 11px", borderRadius: 999, cursor: "pointer",
                    border: `1px solid ${on ? T.teal : T.line}`,
                    background: on ? T.teal : T.surface, color: on ? "#fff" : T.muted }}>
                  {label}</button>
              );
            })}
          </div>
        </div>
        {err && (
          <div className="px-4 sm:px-6 py-2.5" style={{ background: T.exemptSoft, color: T.exempt,
            fontSize: 12, fontWeight: 500, borderBottom: `1px solid ${T.line}` }}>{err}</div>
        )}
        {wide ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: T.paper }}>
              {["Date", "Description", "Match", "Amount", "Status", ""].map((h, i) => (
                <th key={i} style={{ textAlign: i === 3 ? "right" : "left", padding: "11px 16px",
                  fontFamily: mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
                  color: T.faint, fontWeight: 600, borderBottom: `1px solid ${T.line}` }}>{h}</th>
              ))}</tr></thead>
            <tbody>
              {txns.map((t) => {
                const inflow = t.amount >= 0;
                return (
                  <tr key={t.id} style={{ borderBottom: `1px solid ${T.line2}` }}>
                    <td style={{ padding: "13px 16px", whiteSpace: "nowrap" }}>
                      <div style={{ ...num, fontSize: 12, color: T.text }}>{t.date}</div>
                      <div style={{ fontFamily: mono, fontSize: 10, color: T.faint }}>{t.accountName}</div></td>
                    <td style={{ padding: "13px 16px" }}>
                      <div style={{ fontSize: 13, fontWeight: 550, color: T.text }}>{t.counterparty}</div>
                      <div style={{ fontFamily: mono, fontSize: 10.5, color: T.faint }}>
                        {t.reference} · {t.narrative}</div></td>
                    <td style={{ padding: "13px 16px" }}>
                      {t.matchedVendor
                        ? <span style={{ fontSize: 12, color: T.muted }}>{t.matchedVendor}</span>
                        : <span style={{ fontFamily: mono, fontSize: 11, color: T.faint }}>—</span>}</td>
                    <td style={{ padding: "13px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, ...num,
                        fontSize: 13, fontWeight: 650, color: inflow ? T.claim : T.text }}>
                        {inflow ? <ArrowDownLeft size={13} color={T.claim} /> : <ArrowUpRight size={13} color={T.faint} />}
                        {inflow ? "+" : "−"}{fmt(Math.abs(t.amount), t.currency)}</span></td>
                    <td style={{ padding: "13px 16px" }}><ReconChip s={t.reconStatus} /></td>
                    <td style={{ padding: "13px 16px", textAlign: "right" }}>{rowActions(t)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div>
            {txns.map((t, i) => {
              const inflow = t.amount >= 0;
              return (
                <div key={t.id} className="px-4 py-3.5" style={{ borderTop: i ? `1px solid ${T.line2}` : "none" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{t.counterparty}</div>
                      <div style={{ fontFamily: mono, fontSize: 10.5, color: T.faint, marginTop: 1 }}>
                        {t.date} · {t.accountName}</div></div>
                    <div style={{ ...num, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap",
                      color: inflow ? T.claim : T.text }}>
                      {inflow ? "+" : "−"}{fmt(Math.abs(t.amount), t.currency)}</div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <ReconChip s={t.reconStatus} />
                    {t.matchedVendor && <span style={{ fontSize: 11.5, color: T.muted }}>{t.matchedVendor}</span>}
                    <span style={{ marginLeft: "auto" }}>{rowActions(t)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {txns.length === 0 && (
          <div style={{ padding: "28px 16px", textAlign: "center", fontFamily: mono, fontSize: 12, color: T.faint }}>
            No lines in this view.</div>
        )}
      </div>
    </div>
  );
}

