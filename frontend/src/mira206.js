// Generate a filled MIRA 206 (TGST) return as a PDF, entirely in the browser,
// and trigger a download.
//
// Unlike the MIRA 205 export — which fills the official blank AcroForm — MIRA
// does not publish a fillable 206 we bundle here, so this draws a clean,
// print-ready TGST return worksheet from scratch with the period's figures.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getDeclaration, dataUrlToBytes, isPng } from "./declaration.js";

const INK = rgb(0.059, 0.129, 0.141);
const TEAL = rgb(0.165, 0.435, 0.467);
const MUTED = rgb(0.357, 0.42, 0.412);
const FAINT = rgb(0.541, 0.596, 0.588);
const LINE = rgb(0.878, 0.894, 0.878);
const PAPER = rgb(0.969, 0.973, 0.965);
const WARN = rgb(0.612, 0.416, 0.082);
const WARN_SOFT = rgb(0.965, 0.922, 0.839);
const CLAIM = rgb(0.071, 0.478, 0.353);
const CLAIM_SOFT = rgb(0.878, 0.941, 0.909);

const money = (n) => Math.round(n).toLocaleString("en-US");
const ddmonyyyy = (iso) => {
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [y, m, d] = (iso || "").split("-").map(Number);
  return y ? `${String(d).padStart(2, "0")} ${M[m - 1]} ${y}` : "—";
};

function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// Return boxes for the TGST return (mirrors the on-screen miraBoxes at 17%).
function tgstBoxes(f) {
  const total = f.sales8 + f.salesZero + f.salesExempt + f.salesOos;
  const liability = f.outputTax - f.inputTax;
  return [
    ["1", "Value of supplies subject to TGST at 17% (inclusive of TGST)", f.sales8],
    ["2", "Value of zero-rated supplies", f.salesZero],
    ["3", "Value of exempt supplies", f.salesExempt],
    ["4", "Value of supplies out of scope of TGST", f.salesOos],
    ["5", "Total value of supplies (Boxes 1 to 4)", total],
    ["6", "Output tax", f.outputTax],
    ["7", "Input tax", f.inputTax],
    ["8", "TGST re irrecoverable debts / rate-change credit notes", 0],
    ["9", "TGST collected in excess", 0],
    ["10", "TGST liability for the period (Box 6 - Box 7 - Box 8 + Box 9)", liability],
    ["11", "Amount of TGST being paid", Math.max(0, liability)],
  ];
}

export async function exportFilingPdf206(f, taxpayer) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4 portrait
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const M = 50;
  const right = width - M;

  const text = (s, x, y, size, fnt = font, color = INK) =>
    page.drawText(String(s), { x, y, size, font: fnt, color });
  const rtext = (s, x, y, size, fnt = font, color = INK) =>
    page.drawText(String(s), { x: x - fnt.widthOfTextAtSize(String(s), size), y, size, font: fnt, color });

  // Header band
  page.drawRectangle({ x: 0, y: height - 96, width, height: 96, color: INK });
  text("Tourism Goods & Services Tax Return", M, height - 46, 17, bold, rgb(1, 1, 1));
  text("Maldives Inland Revenue Authority", M, height - 66, 10, font, rgb(0.8, 0.85, 0.84));
  rtext("MIRA 206", right, height - 44, 15, bold, rgb(1, 1, 1));
  rtext("GST Act (Law No. 10/2011)", right, height - 64, 9, font, rgb(0.8, 0.85, 0.84));

  // Taxpayer + period block
  let y = height - 128;
  const label = (s, x) => text(s.toUpperCase(), x, y, 7.5, bold, FAINT);
  const value = (s, x, yy) => text(s, x, yy, 12, font, INK);
  const colR = M + 300;
  label("Taxpayer", M);
  label("Taxable period", colR);
  value(taxpayer?.name || "—", M, y - 16);
  value(`${ddmonyyyy(f.periodStart)}  -  ${ddmonyyyy(f.periodEnd)}`, colR, y - 16);
  y -= 40;
  label("GST TIN", M);
  label("Return status", colR);
  value(taxpayer?.tin || "—", M, y - 16);
  value((f.status || "").replace(/_/g, " ") || "—", colR, y - 16);
  y -= 40;

  // Boxes table
  const rows = tgstBoxes(f);
  const rowH = 27;
  const numW = 30;
  const amtW = 110;
  const descX = M + numW + 8;

  // Header row
  page.drawRectangle({ x: M, y: y - rowH, width: width - 2 * M, height: rowH, color: PAPER,
    borderColor: LINE, borderWidth: 0.6 });
  text("BOX", M + 8, y - 17, 8, bold, FAINT);
  text("DESCRIPTION", descX, y - 17, 8, bold, FAINT);
  rtext("AMOUNT (MVR)", right - 8, y - 17, 8, bold, FAINT);
  y -= rowH;

  for (const [n, desc, amt] of rows) {
    const highlight = n === "10";
    const rowColor = highlight ? (amt > 0 ? WARN_SOFT : CLAIM_SOFT) : rgb(1, 1, 1);
    page.drawRectangle({ x: M, y: y - rowH, width: width - 2 * M, height: rowH, color: rowColor,
      borderColor: LINE, borderWidth: 0.6 });
    // box number chip
    const nColor = highlight ? (amt > 0 ? WARN : CLAIM) : MUTED;
    text(n, M + 8, y - 17.5, 10, bold, nColor);
    text(desc, descX, y - 17.5, highlight ? 9.5 : 9, highlight ? bold : font, INK);
    const amtColor = highlight ? (amt > 0 ? WARN : CLAIM) : INK;
    rtext(money(amt), right - 8, y - 17.5, highlight ? 11 : 10, highlight ? bold : font, amtColor);
    y -= rowH;
  }

  // Net position note
  y -= 14;
  const liability = f.outputTax - f.inputTax;
  const noteColor = liability > 0 ? WARN : CLAIM;
  const note = liability > 0
    ? `TGST payable this period: MVR ${money(liability)}.`
    : liability < 0
      ? `Net input-tax credit of MVR ${money(-liability)} carried to the next period.`
      : "No TGST payable this period.";
  text(note, M, y, 10, bold, noteColor);
  y -= 26;

  // Declaration + signature
  const decl = getDeclaration();
  page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 0.6, color: LINE });
  y -= 18;
  const declLines = [
    "I declare that the information given in this return is true, correct and complete.",
    "Amounts are stated in Maldivian Rufiyaa (MVR), rounded to the nearest Rufiyaa.",
  ];
  for (const l of declLines) { text(l, M, y, 9, font, MUTED); y -= 14; }
  y -= 26;
  // The signature image (if provided) and the signing date sit above their lines.
  if (decl.signature) {
    try {
      const bytes = dataUrlToBytes(decl.signature);
      const img = isPng(decl.signature) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const s = Math.min(190 / img.width, 34 / img.height);
      page.drawImage(img, { x: M, y: y + 4, width: img.width * s, height: img.height * s });
    } catch { /* skip an unreadable image */ }
  }
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (decl.name || decl.designation) text(ddmonyyyy(todayIso), colR, y + 6, 10, font, INK);
  page.drawLine({ start: { x: M, y }, end: { x: M + 200, y }, thickness: 0.8, color: INK });
  page.drawLine({ start: { x: colR, y }, end: { x: colR + 160, y }, thickness: 0.8, color: INK });
  text("Authorised signature", M, y - 12, 8, font, FAINT);
  text("Date", colR, y - 12, 8, font, FAINT);
  const declName = [decl.title, decl.name].filter(Boolean).join(" ");
  if (declName) text(declName, M, y - 26, 10, bold, INK);
  if (decl.designation) text(decl.designation, M, y - 38, 8.5, font, MUTED);

  // Footer
  text("Prepared with Kashikeyo Ledger", M, 40, 8, font, FAINT);
  rtext("This is a prepared worksheet, not an official MIRA-issued form.", right, 40, 8, font, FAINT);

  download(await pdf.save(), `MIRA206-${f.periodStart}.pdf`);
}
