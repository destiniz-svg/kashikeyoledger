import React, { useState, useEffect, useRef } from "react";
import { Landmark, Check, ShieldCheck, Settings as SettingsIcon, Users, Pencil, PenLine, Upload } from "lucide-react";
import { getSettings, updateSettings, API_BASE } from "./api.js";
import { getDeclaration, saveDeclaration } from "./declaration.js";
import { T, mono, sans, dec2, MON_LONG, useW } from "./theme.js";
import { Eyebrow } from "./ui.jsx";

/* ---------------------------------------------------------------------------
   Settings — organization profile, tax registration, team, workspace
--------------------------------------------------------------------------- */
const SETTINGS_DEMO = {
  organization: null, backend: "memory", readAuth: "open", writeAuth: "not configured",
  profile: { name: "Kashikeyo Demo Co", tin: "", sector: "GENERAL", industryCode: "",
    baseCurrency: "MVR", reportingCurrency: "MVR", timezone: "Indian/Maldives" },
  tax: { gstRegistered: true, gstFilingFrequency: "MONTHLY", fiscalYearStartMonth: 1,
    greenTaxEnabled: false, greenTaxRateUsd: 12 },
  members: [
    { name: "", email: "owner@kashikeyo.local", role: "OWNER", ini: "OW" },
    { name: "", email: "accountant@kashikeyo.local", role: "ACCOUNTANT", ini: "AC" },
  ],
};
const ROLE_META = {
  OWNER: { bg: T.goldSoft, fg: T.warn },
  ADMIN: { bg: T.tealSoft, fg: T.teal },
  ACCOUNTANT: { bg: T.tealSoft, fg: T.teal },
  MEMBER: { bg: "#EEF1EF", fg: T.muted },
  VIEWER: { bg: "#EEF1EF", fg: T.muted },
};
const titleCase = (s) => String(s || "").toLowerCase().replace(/(^|[\s_])\w/g, (m) => m.toUpperCase()).replace(/_/g, " ");

const SettingsCard = ({ icon: Icon, title, children }) => (
  <div className="rounded-2xl p-5 sm:p-6" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
    <div className="flex items-center gap-2.5 mb-4">
      <div style={{ width: 32, height: 32, borderRadius: 9, background: T.tealSofter,
        display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={16} color={T.teal} /></div>
      <div style={{ fontSize: 14.5, fontWeight: 650, color: T.text }}>{title}</div>
    </div>
    {children}
  </div>
);
const Field = ({ label, value, mono: isMono, children }) => (
  <div className="flex items-center justify-between gap-3 py-2" style={{ borderTop: `1px solid ${T.line2}`, minHeight: 40 }}>
    <span style={{ fontSize: 12.5, color: T.muted, flexShrink: 0 }}>{label}</span>
    {children ?? (
      <span style={{ fontSize: 12.5, fontWeight: 550, color: T.text, textAlign: "right",
        ...(isMono ? { fontFamily: mono, fontSize: 11.5 } : {}) }}>{value || "—"}</span>
    )}
  </div>
);
const editInput = { border: `1px solid ${T.line}`, borderRadius: 8, padding: "6px 10px", fontSize: 12.5,
  color: T.text, background: T.surface, fontFamily: sans, width: 200, textAlign: "right" };
const EditText = ({ v, on, ph, mono: m }) => (
  <input value={v ?? ""} onChange={(e) => on(e.target.value)} placeholder={ph}
    style={{ ...editInput, ...(m ? { fontFamily: mono, fontSize: 11.5 } : {}) }} />
);
const EditSelect = ({ v, on, options }) => (
  <select value={v} onChange={(e) => on(e.target.value)} style={{ ...editInput }}>
    {options.map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}
  </select>
);
const Toggle = ({ on: isOn, onChange }) => (
  <button onClick={() => onChange(!isOn)} aria-pressed={isOn}
    style={{ width: 40, height: 23, borderRadius: 999, border: "none", cursor: "pointer",
      background: isOn ? T.claim : T.line, position: "relative", flexShrink: 0 }}>
    <span style={{ position: "absolute", top: 2, left: isOn ? 19 : 2, width: 19, height: 19,
      borderRadius: 999, background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.25)", transition: "left .15s" }} />
  </button>
);
const SECTOR_OPTS = [["GENERAL", "General"], ["TOURISM", "Tourism"]];
const FREQ_OPTS = [["MONTHLY", "Monthly"], ["QUARTERLY", "Quarterly"]];
const MONTH_OPTS = MON_LONG.map((m, i) => [String(i + 1), m]);

// The declarant name, designation, contact and signature that get stamped onto
// every MIRA 205 / 206 PDF export. Persisted on the device (localStorage).
function DeclarationCard() {
  const [decl, setDecl] = useState(() => getDeclaration());
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);
  const update = (patch) => { const d = { ...decl, ...patch }; setDecl(d); saveDeclaration(d); };
  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) { setErr("Use a PNG or JPG image."); return; }
    if (file.size > 400 * 1024) { setErr("Image too large — keep it under 400 KB."); return; }
    setErr(null);
    const r = new FileReader();
    r.onload = () => update({ signature: r.result });
    r.readAsDataURL(file);
  }
  const inp = { ...editInput, textAlign: "right" };
  return (
    <SettingsCard icon={PenLine} title="MIRA filing declaration">
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 4 }}>
        Signed onto every MIRA 205 / 206 export. Stored on this device.</div>
      <Field label="Title">
        <input value={decl.title || ""} onChange={(e) => update({ title: e.target.value })}
          placeholder="e.g. Mr / Ms / Dr" style={inp} /></Field>
      <Field label="Declarant name">
        <input value={decl.name || ""} onChange={(e) => update({ name: e.target.value })}
          placeholder="First &amp; other names" style={inp} /></Field>
      <Field label="Designation">
        <input value={decl.designation || ""} onChange={(e) => update({ designation: e.target.value })}
          placeholder="e.g. Accountant" style={inp} /></Field>
      <Field label="Contact number">
        <input value={decl.contact || ""} onChange={(e) => update({ contact: e.target.value })}
          placeholder="e.g. 7712345" style={inp} /></Field>
      <div className="flex items-center justify-between gap-3 py-2"
        style={{ borderTop: `1px solid ${T.line2}`, minHeight: 44 }}>
        <span style={{ fontSize: 12.5, color: T.muted, flexShrink: 0 }}>Digital signature</span>
        <div className="flex items-center gap-2">
          {decl.signature ? (
            <>
              <img src={decl.signature} alt="signature" style={{ height: 34, maxWidth: 150,
                objectFit: "contain", background: "#fff", border: `1px solid ${T.line}`, borderRadius: 6, padding: 2 }} />
              <button onClick={() => update({ signature: null })}
                style={{ border: `1px solid ${T.line}`, borderRadius: 8, padding: "6px 10px", fontSize: 11.5,
                  color: T.exempt, background: T.surface, cursor: "pointer" }}>Remove</button>
            </>
          ) : (
            <button onClick={() => fileRef.current?.click()}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${T.line}`,
                borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 600, color: T.text,
                background: T.surface, cursor: "pointer" }}><Upload size={13} /> Upload signature</button>
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={onFile} style={{ display: "none" }} />
        </div>
      </div>
      {err && <div style={{ fontSize: 11.5, color: T.exempt, marginTop: 4 }}>{err}</div>}
    </SettingsCard>
  );
}

export function Settings({ session, onRequireLogin }) {
  const w = useW(); const wide = w >= 768;
  const [data, setData] = useState(SETTINGS_DEMO);
  const [live, setLive] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let alive = true;
    getSettings()
      .then((d) => { if (alive && d?.profile) { setData(d); setLive(true); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const { profile: p, tax: t, members } = data;
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  function startEdit() {
    setErr(null);
    setDraft({
      name: p.name, tin: p.tin, sector: p.sector || "GENERAL", industryCode: p.industryCode,
      timezone: p.timezone, gstRegistered: t.gstRegistered,
      gstFilingFrequency: t.gstFilingFrequency || "MONTHLY",
      fiscalYearStartMonth: String(t.fiscalYearStartMonth || 1),
      greenTaxEnabled: t.greenTaxEnabled, greenTaxRateUsd: t.greenTaxRateUsd,
    });
    setEditing(true);
  }
  async function save() {
    if (busy) return;
    if (live && !session) { onRequireLogin(); return; }
    const patch = {
      name: draft.name, tin: draft.tin, sector: draft.sector, industryCode: draft.industryCode,
      timezone: draft.timezone, gstRegistered: draft.gstRegistered,
      gstFilingFrequency: draft.gstFilingFrequency,
      fiscalYearStartMonth: Number(draft.fiscalYearStartMonth),
      greenTaxEnabled: draft.greenTaxEnabled, greenTaxRateUsd: Number(draft.greenTaxRateUsd),
    };
    setBusy(true); setErr(null);
    try {
      if (live) {
        const res = await updateSettings(patch);
        setData((d) => ({ ...d, profile: res.profile, tax: res.tax }));
      } else {
        // Offline: apply the patch locally so the preview reflects the edit.
        setData((d) => ({
          ...d,
          profile: { ...d.profile, name: patch.name, tin: patch.tin, sector: patch.sector,
            industryCode: patch.industryCode, timezone: patch.timezone },
          tax: { gstRegistered: patch.gstRegistered, gstFilingFrequency: patch.gstFilingFrequency,
            fiscalYearStartMonth: patch.fiscalYearStartMonth, greenTaxEnabled: patch.greenTaxEnabled,
            greenTaxRateUsd: patch.greenTaxRateUsd },
        }));
      }
      setEditing(false);
    } catch {
      setErr("Couldn't save — check the values, or sign in again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8" style={{ background: T.paper }}>
      <div className="flex items-center gap-2 mb-4">
        <Eyebrow>Workspace settings</Eyebrow>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: mono,
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", color: live ? T.claim : T.faint }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: live ? T.claim : T.faint }} />
          {live ? "LIVE" : "SAMPLE"}</span>
        <div className="flex items-center gap-2" style={{ marginLeft: "auto" }}>
          {editing ? (
            <>
              <button onClick={() => { setEditing(false); setErr(null); }} disabled={busy}
                style={{ border: `1px solid ${T.line}`, borderRadius: 9, padding: "7px 14px",
                  fontSize: 12.5, fontWeight: 600, color: T.muted, background: T.surface, cursor: "pointer" }}>
                Cancel</button>
              <button onClick={save} disabled={busy}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, background: T.ink, color: "#fff",
                  borderRadius: 9, padding: "7px 15px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  opacity: busy ? 0.7 : 1 }}>
                <Check size={14} /> {busy ? "Saving…" : "Save changes"}</button>
            </>
          ) : (
            <button onClick={startEdit}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${T.line}`,
                borderRadius: 9, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, color: T.text,
                background: T.surface, cursor: "pointer" }}>
              <Pencil size={13} /> Edit</button>
          )}
        </div>
      </div>
      {err && (
        <div className="mb-4 rounded-lg px-4 py-2.5" style={{ background: T.exemptSoft, color: T.exempt,
          fontSize: 12.5, fontWeight: 500 }}>{err}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Organization profile */}
        <SettingsCard icon={Landmark} title="Organization profile">
          {editing ? (
            <div className="pb-1">
              <Eyebrow>Legal name</Eyebrow>
              <input value={draft.name ?? ""} onChange={(e) => set("name", e.target.value)}
                style={{ ...editInput, width: "100%", textAlign: "left", marginTop: 4, fontSize: 15, fontWeight: 600 }} />
            </div>
          ) : (
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 6 }}>{p.name || "—"}</div>
          )}
          <Field label="Taxpayer TIN" value={p.tin} mono>
            {editing && <EditText v={draft.tin} on={(v) => set("tin", v)} ph="e.g. 1234567" mono />}
          </Field>
          <Field label="Business sector" value={titleCase(p.sector)}>
            {editing && <EditSelect v={draft.sector} on={(v) => set("sector", v)} options={SECTOR_OPTS} />}
          </Field>
          <Field label="MIRA industry code" value={p.industryCode} mono>
            {editing && <EditText v={draft.industryCode} on={(v) => set("industryCode", v)} ph="e.g. 55101" mono />}
          </Field>
          <Field label="Base currency" value={p.baseCurrency} mono />
          <Field label="Reporting currency" value={p.reportingCurrency} mono />
          <Field label="Timezone" value={p.timezone}>
            {editing && <EditText v={draft.timezone} on={(v) => set("timezone", v)} ph="Indian/Maldives" />}
          </Field>
        </SettingsCard>

        {/* Tax registration */}
        <SettingsCard icon={ShieldCheck} title="Tax registration">
          {editing ? (
            <Field label="GST registered">
              <Toggle on={draft.gstRegistered} onChange={(v) => set("gstRegistered", v)} />
            </Field>
          ) : (
            <div className="flex items-center gap-2 pb-3">
              <span style={{ background: t.gstRegistered ? T.claimSoft : "#EEF1EF",
                color: t.gstRegistered ? T.claim : T.muted, fontFamily: mono, fontSize: 11, fontWeight: 600,
                padding: "3px 10px", borderRadius: 999 }}>
                {t.gstRegistered ? "GST registered" : "Not GST registered"}</span>
            </div>
          )}
          <Field label="GGST filing frequency" value={titleCase(t.gstFilingFrequency)}>
            {editing && <EditSelect v={draft.gstFilingFrequency} on={(v) => set("gstFilingFrequency", v)} options={FREQ_OPTS} />}
          </Field>
          <Field label="Fiscal year starts" value={MON_LONG[(t.fiscalYearStartMonth || 1) - 1]}>
            {editing && <EditSelect v={draft.fiscalYearStartMonth} on={(v) => set("fiscalYearStartMonth", v)} options={MONTH_OPTS} />}
          </Field>
          <Field label="Green tax" value={t.greenTaxEnabled ? "Enabled" : "Not enabled"}>
            {editing && <Toggle on={draft.greenTaxEnabled} onChange={(v) => set("greenTaxEnabled", v)} />}
          </Field>
          <Field label="Green tax rate" value={`$${dec2(t.greenTaxRateUsd)} / night`} mono>
            {editing && <input type="number" min="0" step="0.5" value={draft.greenTaxRateUsd}
              onChange={(e) => set("greenTaxRateUsd", e.target.value)} style={{ ...editInput, width: 120 }} />}
          </Field>
        </SettingsCard>

        {/* MIRA filing declaration + digital signature */}
        <DeclarationCard />

        {/* Team members */}
        <SettingsCard icon={Users} title={`Team${members.length ? ` · ${members.length}` : ""}`}>
          <div className="flex flex-col">
            {members.map((m, i) => {
              const rm = ROLE_META[m.role] || ROLE_META.MEMBER;
              return (
                <div key={i} className="flex items-center gap-3 py-2.5"
                  style={{ borderTop: i ? `1px solid ${T.line2}` : "none" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 999, background: T.ink, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono,
                    fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{m.ini}</div>
                  <div className="min-w-0 flex-1">
                    <div style={{ fontSize: 13, fontWeight: 550, color: T.text, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name || m.email}</div>
                    {m.name && <div style={{ fontFamily: mono, fontSize: 10.5, color: T.faint }}>{m.email}</div>}
                  </div>
                  <span style={{ background: rm.bg, color: rm.fg, fontFamily: mono, fontSize: 10,
                    fontWeight: 600, letterSpacing: "0.04em", padding: "3px 9px", borderRadius: 999 }}>
                    {titleCase(m.role)}</span>
                </div>
              );
            })}
          </div>
        </SettingsCard>

        {/* Workspace / system */}
        <SettingsCard icon={SettingsIcon} title="Workspace">
          <Field label="Backend" value={data.backend === "supabase" ? "Supabase (live)" : "In-memory (demo)"} />
          <Field label="Organization ID" value={data.organization || "—"} mono />
          <Field label="API endpoint" value={API_BASE.replace(/^https?:\/\//, "")} mono />
          <Field label="Read access" value={titleCase(data.readAuth)} />
          <Field label="Write access" value={data.writeAuth === "required" ? "Required" : "Not configured"} />
        </SettingsCard>
      </div>
    </div>
  );
}

