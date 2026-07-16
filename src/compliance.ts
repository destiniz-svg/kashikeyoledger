/**
 * MIRA-ready compliance report (Phase 4). Turns the ledger's current state into
 * a plain-language readiness score and a set of checks a Maldivian business must
 * pass before filing — plus the base-currency (MVR) money figures with their USD
 * equivalents for the dual-currency dashboard header.
 *
 * Pure and testable: it takes already-fetched data (no store, no network). The
 * server assembles the inputs from the store and returns the result.
 */
import type { BillRow, VendorRow, DocumentRow, GstFilingRow } from "./store.ts";

/** A vendor TIN that reads as "not provided". */
const missingTin = (tin: string | null | undefined): boolean => {
  const t = (tin ?? "").trim();
  return t === "" || t === "—";
};

export type CheckStatus = "ok" | "warn" | "risk";

export interface ComplianceCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  count?: number;
  amount?: number; // MVR, when relevant
}

/** A base-currency (MVR) amount with its USD equivalent. */
export interface DualAmount {
  mvr: number;
  usd: number;
}

export interface ComplianceReport {
  score: number; // 0..100 readiness
  checks: ComplianceCheck[];
  missingTin: { bills: number; vendors: number; unclaimableInputTax: number };
  documentsNeedingReview: number;
  unreconciledBankLines: number;
  outOfBalanceBy: number;
  filing: {
    form: string;
    mira: string;
    periodEnd: string;
    dueDate: string;
    status: string;
    daysToDue: number;
  } | null;
  fx: { base: "MVR"; quote: "USD"; mvrPerUsd: number };
  money: {
    cashAndBank: DualAmount;
    expenses: DualAmount;
    accountsPayable: DualAmount;
    claimableInputTax: DualAmount;
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Whole days from `today` until `dueIso` (negative once overdue). */
function daysUntil(dueIso: string, today: Date): number {
  const due = Date.parse(`${dueIso}T00:00:00Z`);
  const now = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(due) || Number.isNaN(now)) return 0;
  return Math.floor((due - now) / 86_400_000);
}

/** The soonest filing that still needs action (not FILED). */
function nextFiling(filings: GstFilingRow[], mira: string, today: Date) {
  const open = filings
    .filter((f) => (f.status ?? "").toUpperCase() !== "FILED")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const f = open[0];
  if (!f) return null;
  return {
    form: f.form,
    mira,
    periodEnd: f.periodEnd,
    dueDate: f.dueDate,
    status: f.status,
    daysToDue: daysUntil(f.dueDate, today),
  };
}

export interface ComplianceInput {
  bills: BillRow[];
  vendors: VendorRow[];
  documents: DocumentRow[];
  ggstFilings: GstFilingRow[];
  tgstFilings: GstFilingRow[];
  unreconciledBankLines: number;
  outOfBalanceBy: number;
  cashAndBank: number;
  expenses: number;
  accountsPayable: number;
  claimableInputTax: number;
  mvrPerUsd: number;
  today?: Date;
}

/** Build the compliance report from already-fetched ledger data. */
export function buildCompliance(input: ComplianceInput): ComplianceReport {
  const today = input.today ?? new Date();
  const rate = input.mvrPerUsd > 0 ? input.mvrPerUsd : 15.42;
  const dual = (mvr: number): DualAmount => ({ mvr: round2(mvr), usd: round2(mvr / rate) });

  // TIN completeness — input GST can't be claimed without a valid tax invoice
  // carrying the supplier's TIN.
  const billsNoTin = input.bills.filter((b) => missingTin(b.tin));
  const vendorsNoTin = input.vendors.filter((v) => missingTin(v.tin));
  const unclaimable = round2(
    billsNoTin
      .filter((b) => b.taxCat !== "EXEMPT")
      .reduce((s, b) => s + (b.gst || 0), 0),
  );

  const docsNeedingReview = input.documents.filter(
    (d) => (d.extraction?.validationFlags?.length ?? 0) > 0,
  ).length;

  // Soonest filing across both GST returns.
  const filings = [
    nextFiling(input.ggstFilings, "MIRA 205", today),
    nextFiling(input.tgstFilings, "MIRA 206", today),
  ].filter((f): f is NonNullable<typeof f> => f != null)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const filing = filings[0] ?? null;

  const checks: ComplianceCheck[] = [];

  // 1. Vendor TIN completeness
  if (unclaimable > 0) {
    checks.push({
      id: "vendor_tin",
      label: "Vendor TIN completeness",
      status: "risk",
      detail: `${billsNoTin.length} bill${billsNoTin.length === 1 ? "" : "s"} without a supplier TIN — input GST can't be claimed.`,
      count: billsNoTin.length,
      amount: unclaimable,
    });
  } else if (vendorsNoTin.length > 0) {
    checks.push({
      id: "vendor_tin",
      label: "Vendor TIN completeness",
      status: "warn",
      detail: `${vendorsNoTin.length} vendor${vendorsNoTin.length === 1 ? "" : "s"} missing a TIN.`,
      count: vendorsNoTin.length,
    });
  } else {
    checks.push({ id: "vendor_tin", label: "Vendor TIN completeness", status: "ok",
      detail: "Every vendor has a TIN on file." });
  }

  // 2. AI extraction review backlog
  checks.push(
    docsNeedingReview > 0
      ? { id: "doc_review", label: "Document review", status: "warn",
          detail: `${docsNeedingReview} extracted document${docsNeedingReview === 1 ? "" : "s"} flagged for review.`,
          count: docsNeedingReview }
      : { id: "doc_review", label: "Document review", status: "ok",
          detail: "No documents awaiting review." },
  );

  // 3. Bank reconciliation
  checks.push(
    input.unreconciledBankLines > 0
      ? { id: "bank_recon", label: "Bank reconciliation", status: "warn",
          detail: `${input.unreconciledBankLines} bank line${input.unreconciledBankLines === 1 ? "" : "s"} still to reconcile.`,
          count: input.unreconciledBankLines }
      : { id: "bank_recon", label: "Bank reconciliation", status: "ok",
          detail: "All bank lines reconciled." },
  );

  // 4. Ledger balance (double-entry integrity)
  checks.push(
    Math.abs(input.outOfBalanceBy) >= 0.01
      ? { id: "ledger_balance", label: "Ledger balance", status: "risk",
          detail: `Ledger is out of balance by MVR ${round2(Math.abs(input.outOfBalanceBy))}.`,
          amount: round2(input.outOfBalanceBy) }
      : { id: "ledger_balance", label: "Ledger balance", status: "ok",
          detail: "Debits equal credits." },
  );

  // 5. Filing due date
  if (filing) {
    if (filing.daysToDue < 0) {
      checks.push({ id: "filing_due", label: "GST filing", status: "risk",
        detail: `${filing.mira} for period ending ${filing.periodEnd} is overdue (was due ${filing.dueDate}).` });
    } else if (filing.daysToDue <= 7) {
      checks.push({ id: "filing_due", label: "GST filing", status: "warn",
        detail: `${filing.mira} is due in ${filing.daysToDue} day${filing.daysToDue === 1 ? "" : "s"} (${filing.dueDate}).` });
    } else {
      checks.push({ id: "filing_due", label: "GST filing", status: "ok",
        detail: `Next return (${filing.mira}) due ${filing.dueDate}.` });
    }
  }

  // Readiness score: start at 100, dock for each open check.
  const penalty = checks.reduce((s, c) => s + (c.status === "risk" ? 20 : c.status === "warn" ? 8 : 0), 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));

  return {
    score,
    checks,
    missingTin: { bills: billsNoTin.length, vendors: vendorsNoTin.length, unclaimableInputTax: unclaimable },
    documentsNeedingReview: docsNeedingReview,
    unreconciledBankLines: input.unreconciledBankLines,
    outOfBalanceBy: round2(input.outOfBalanceBy),
    filing,
    fx: { base: "MVR", quote: "USD", mvrPerUsd: rate },
    money: {
      cashAndBank: dual(input.cashAndBank),
      expenses: dual(input.expenses),
      accountsPayable: dual(input.accountsPayable),
      claimableInputTax: dual(input.claimableInputTax),
    },
  };
}
