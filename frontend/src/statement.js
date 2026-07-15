// Dependency-free bank-statement CSV parsing for the import flow. Handles the
// common shapes of a BML (Bank of Maldives) internet-banking CSV export:
// separate Debit/Credit columns or a single signed Amount column, with flexible
// header names and DD/MM/YYYY or ISO dates.

// Split CSV text into rows of fields, honouring quoted fields and escaped quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* ignore */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  // Drop fully blank rows.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const norm = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, "");
const HEADERS = {
  date: ["date", "transactiondate", "txndate", "postingdate", "posteddate", "trandate", "bookingdate"],
  valueDate: ["valuedate", "valuedt", "value"],
  narrative: ["description", "narrative", "details", "particulars", "transactiondetails", "remarks", "narration"],
  reference: ["reference", "ref", "transactionreference", "refno", "referencenumber", "chequeno"],
  debit: ["debit", "withdrawal", "withdrawals", "dr", "paidout", "moneyout", "debitamount"],
  credit: ["credit", "deposit", "deposits", "cr", "paidin", "moneyin", "creditamount"],
  amount: ["amount", "transactionamount", "amt"],
  balance: ["balance", "runningbalance", "closingbalance", "ledgerbalance", "availablebalance"],
  counterparty: ["counterparty", "payee", "beneficiary", "tofrom", "name"],
  type: ["type", "transactiontype", "txntype"],
};

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// Parse a date cell to ISO YYYY-MM-DD, or null if unrecognised.
export function parseDate(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD/MM/YYYY or DD-MM-YYYY (BML default), also 2-digit year.
  if ((m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/))) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // DD MMM YYYY  e.g. "05 Jul 2026"
  if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/))) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo) return `${m[3]}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

// Parse a money cell to a Number; supports "1,234.56", "(1,234.56)" negatives,
// currency prefixes, and trailing CR/DR markers. Returns null if not numeric.
export function parseAmount(raw) {
  let s = String(raw || "").trim();
  if (!s) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1); }
  if (/(^-)|(\bdr\b)/i.test(s)) sign = -1;
  s = s.replace(/[^0-9.]/g, "");
  if (s === "" || s === ".") return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? sign * n : null;
}

function indexMap(header) {
  const cells = header.map(norm);
  const idx = {};
  for (const [key, names] of Object.entries(HEADERS)) {
    idx[key] = cells.findIndex((c) => names.includes(c));
  }
  return idx;
}

// Turn parsed CSV rows into normalized import lines. Returns the lines plus how
// many rows were skipped (unparseable date/amount) and the detected period.
export function rowsToLines(rows) {
  if (!rows.length) return { lines: [], skipped: 0, period: null, error: "The file is empty." };
  const idx = indexMap(rows[0]);
  const at = (row, key) => (idx[key] >= 0 ? row[idx[key]] : "");
  if (idx.date < 0 || (idx.amount < 0 && idx.debit < 0 && idx.credit < 0)) {
    return { lines: [], skipped: 0, period: null,
      error: "Couldn't find a Date column and an Amount (or Debit/Credit) column." };
  }
  const lines = [];
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const date = parseDate(at(row, "date"));
    if (!date) { skipped++; continue; }
    let direction = null;
    let amount = null;
    const dr = parseAmount(at(row, "debit"));
    const cr = parseAmount(at(row, "credit"));
    if (dr && Math.abs(dr) > 0) { direction = "DEBIT"; amount = Math.abs(dr); }
    else if (cr && Math.abs(cr) > 0) { direction = "CREDIT"; amount = Math.abs(cr); }
    else {
      const amt = parseAmount(at(row, "amount"));
      if (amt != null && amt !== 0) { direction = amt < 0 ? "DEBIT" : "CREDIT"; amount = Math.abs(amt); }
    }
    if (!direction || amount == null) { skipped++; continue; }
    lines.push({
      date,
      valueDate: parseDate(at(row, "valueDate")) || null,
      type: String(at(row, "type") || "").trim() || null,
      reference: String(at(row, "reference") || "").trim() || null,
      counterparty: String(at(row, "counterparty") || "").trim() || null,
      narrative: String(at(row, "narrative") || "").trim() || null,
      direction,
      amount: Math.round(amount * 100) / 100,
      balance: parseAmount(at(row, "balance")),
    });
  }
  const dates = lines.map((l) => l.date).sort();
  const period = dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
  return { lines, skipped, period, error: null };
}

// Full pipeline: CSV text -> normalized import lines.
export function parseStatementCsv(text) {
  return rowsToLines(parseCsv(text));
}
