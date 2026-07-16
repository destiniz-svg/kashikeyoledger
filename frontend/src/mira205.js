// Fill the official MIRA 205 (GGST) PDF form with a filing period's figures,
// entirely in the browser, and trigger a download.
//
// Field map (page 1, from the form's AcroForm):
//   TextField1  = GST TIN            TextField2  = Taxpayer name
//   DateTimeField1/2 = period From / To (DDMMYYYY)
//   NumericField1..13 = Boxes 1..13 (values, rounded to the nearest Rufiyaa)
import { PDFDocument, PDFName, PDFBool } from "pdf-lib";
import { getDeclaration, dataUrlToBytes, isPng } from "./declaration.js";

const PREFIX = "topmostSubform[0].Page1[0].";
const ddmmyyyy = (iso) => {
  const [y, m, d] = (iso || "").split("-");
  return y ? `${d}${m}${y}` : "";
};
const todayDDMMYYYY = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}${String(d.getMonth() + 1).padStart(2, "0")}${d.getFullYear()}`;
};

function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export async function exportFilingPdf(f, taxpayer) {
  const bytes = await fetch("/mira205.pdf").then((r) => {
    if (!r.ok) throw new Error("form not found");
    return r.arrayBuffer();
  });
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();
  const r0 = (n) => String(Math.round(n));
  const set = (field, value) => {
    try { form.getTextField(PREFIX + field).setText(String(value)); } catch { /* skip */ }
  };

  const total = f.sales8 + f.salesZero + f.salesExempt + f.salesOos;
  const liability = f.outputTax - f.inputTax; // Box 6 − Box 7 (Box 8 = Box 9 = 0)

  set("TextField1[0]", taxpayer?.tin || "");
  set("TextField2[0]", taxpayer?.name || "");
  set("DateTimeField1[0]", ddmmyyyy(f.periodStart));
  set("DateTimeField2[0]", ddmmyyyy(f.periodEnd));

  set("NumericField1[0]", r0(f.sales8));
  set("NumericField2[0]", r0(f.salesZero));
  set("NumericField3[0]", r0(f.salesExempt));
  set("NumericField4[0]", r0(f.salesOos));
  set("NumericField5[0]", r0(total));
  set("NumericField6[0]", r0(f.outputTax));
  set("NumericField7[0]", r0(f.inputTax));
  set("NumericField8[0]", "0");
  set("NumericField9[0]", "0");
  set("NumericField10[0]", r0(liability));
  set("NumericField11[0]", r0(Math.max(0, liability)));
  set("NumericField12[0]", "0");
  set("NumericField13[0]", "0");

  // Declaration block: split the declarant name into first / other names to
  // match the form, and fill designation, contact and the signing date.
  const decl = getDeclaration();
  const name = (decl.name || "").trim();
  const gap = name.indexOf(" ");
  set("TextField16[0]", decl.title || "");
  set("TextField17[0]", gap === -1 ? name : name.slice(0, gap)); // First name
  set("TextField18[0]", gap === -1 ? "" : name.slice(gap + 1)); // Other names
  set("TextField19[0]", decl.contact || "");
  set("TextField20[0]", decl.designation || "");
  if (name || decl.designation) set("DateTimeField3[0]", todayDDMMYYYY());

  // Stamp the signature image into the "Signature & Seal" area (no form field).
  if (decl.signature) {
    try {
      const bytes = dataUrlToBytes(decl.signature);
      const img = isPng(decl.signature) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const maxW = 125, maxH = 30;
      const s = Math.min(maxW / img.width, maxH / img.height);
      doc.getPage(0).drawImage(img, { x: 430, y: 90, width: img.width * s, height: img.height * s });
    } catch { /* skip an unreadable image */ }
  }

  // This is an XFA-hybrid form. Drop the XFA and ask viewers to regenerate
  // appearances so our AcroForm values are what shows.
  try {
    const acro = form.acroForm;
    acro.dict.set(PDFName.of("NeedAppearances"), PDFBool.True);
    acro.dict.delete(PDFName.of("XFA"));
  } catch { /* ignore */ }

  download(await doc.save(), `MIRA205-${f.periodStart}.pdf`);
}
