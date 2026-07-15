import { T } from "./theme.js";

/* ---------------------------------------------------------------------------
   Seed data (Altura invoices + BML statement vendors)
--------------------------------------------------------------------------- */
export const BILLS = [
  { id: "b1", vendor: "Altura Pvt Ltd", tin: "1145053", invoice: "ALT/INV-000024",
    po: "PO-RDC-2026-003845", date: "05 Jul 2026", due: "20 Jul 2026", cur: "MVR",
    subtotal: 91000, rate: 8, gst: 7280, total: 98280, cat: "Equipment",
    taxCat: "GGST", status: "AI_VERIFIED", aging: "current",
    line: "Concrete Mixer (50KG – 1 Bag)", qty: 1, unit: 91000 },
  { id: "b2", vendor: "Island Mark Hardware Pvt Ltd", tin: "—", invoice: "IMH-4471",
    po: "—", date: "11 May 2026", due: "26 May 2026", cur: "MVR",
    subtotal: 4300, rate: 8, gst: 344, total: 4644, cat: "Hardware",
    taxCat: "GGST", status: "DRAFT", aging: "current",
    line: "Assorted fixings & tools", qty: 12, unit: 358.33 },
  { id: "b3", vendor: "Ives Private Limited", tin: "—", invoice: "IVS-2026-118",
    po: "—", date: "11 May 2026", due: "25 May 2026", cur: "MVR",
    subtotal: 6039.58, rate: 8, gst: 483.17, total: 6522.75, cat: "Supplies",
    taxCat: "GGST", status: "AI_VERIFIED", aging: "1_30",
    line: "Packaging & consumables", qty: 1, unit: 6039.58 },
  { id: "b4", vendor: "Tree Top Health Pvt Ltd", tin: "—", invoice: "TTH-9930",
    po: "—", date: "05 Feb 2026", due: "20 Feb 2026", cur: "MVR",
    subtotal: 5809, rate: 0, gst: 0, total: 5809, cat: "Health",
    taxCat: "EXEMPT", status: "AI_VERIFIED", aging: "90_plus",
    line: "Staff medical services", qty: 1, unit: 5809 },
  { id: "b5", vendor: "Beaver Builders Private Limited", tin: "—", invoice: "BB-3382",
    po: "—", date: "14 Jun 2026", due: "29 Jun 2026", cur: "MVR",
    subtotal: 4233.72, rate: 8, gst: 338.70, total: 4572.42, cat: "Construction",
    taxCat: "GGST", status: "DRAFT", aging: "1_30",
    line: "Site labour & materials", qty: 1, unit: 4233.72 },
  { id: "b6", vendor: "Island Choice LLP", tin: "—", invoice: "IC-7781",
    po: "—", date: "12 May 2026", due: "27 May 2026", cur: "MVR",
    subtotal: 215, rate: 8, gst: 17.20, total: 232.20, cat: "F&B",
    taxCat: "GGST", status: "ACCOUNTANT_APPROVED", aging: "current",
    line: "Café supplies", qty: 1, unit: 215 },
];

export const TREND = [
  { m: "Jan", val: 42513 }, { m: "Feb", val: 55120 }, { m: "Mar", val: 48300 },
  { m: "Apr", val: 61240 }, { m: "May", val: 72110 }, { m: "Jun", val: 95400 },
  { m: "Jul", val: 120830 }, { m: "Aug", val: 88900 }, { m: "Sep", val: 101200 },
  { m: "Oct", val: 93400 }, { m: "Nov", val: 86750 }, { m: "Dec", val: 118200 },
];

export const BY_CATEGORY = [
  { name: "Construction", n: 14, amt: 102513, color: T.teal },
  { name: "Equipment", n: 1, amt: 91000, color: T.ink },
  { name: "Supplies", n: 3, amt: 6040, color: T.gold },
  { name: "Health", n: 1, amt: 5809, color: T.exempt },
  { name: "Hardware", n: 2, amt: 4300, color: T.warn },
  { name: "F&B", n: 5, amt: 4128, color: T.claim },
];
export const BY_VENDOR = [
  { name: "Altura Pvt Ltd", n: 1, amt: 98280, ini: "AL" },
  { name: "Beaver Builders", n: 6, amt: 42300, ini: "BB" },
  { name: "Island Mark Hardware", n: 4, amt: 12644, ini: "IM" },
  { name: "Ives Private Ltd", n: 1, amt: 6523, ini: "IV" },
  { name: "Tree Top Health", n: 1, amt: 5809, ini: "TT" },
  { name: "Island Choice LLP", n: 8, amt: 3232, ini: "IC" },
];
export const BY_TAX = [
  { name: "GGST 8%", n: 28, amt: 198281, color: T.teal, claim: true },
  { name: "Zero-rated", n: 6, amt: 9700, color: T.claim, claim: true },
  { name: "Exempt · Sec 20", n: 1, amt: 5809, color: T.exempt, claim: false },
];
// Colors applied to live breakdown rows (which arrive without colors).
export const CAT_COLORS = [T.teal, T.ink, T.gold, T.exempt, T.warn, T.claim];
export const TAX_COLORS = { "GGST 8%": T.teal, "TGST 17%": T.gold, "Zero-rated": T.claim,
  "Exempt · Sec 20": T.exempt, "Out of scope": T.muted };
