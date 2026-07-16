/**
 * Explainable AI (Phase 3). A human can correct an extraction's tax / accounting
 * category; that correction is saved as a **categorization rule** and applied to
 * future documents from the same vendor (matched by TIN or name) or matching a
 * keyword — so the system learns from people and can explain *why* it categorised
 * something ("applied your rule").
 *
 * This module is pure and testable: no network, no DB. The stores persist the
 * rules and call these helpers.
 */
import { StoreError, TAX_CATEGORIES } from "./store.ts";
import { deriveValidationFlags, type Extraction } from "./aiExtract.ts";

const TAX_ENUM = TAX_CATEGORIES as readonly string[];

/** A saved categorization rule (org-scoped). Matchers + the outcome to apply. */
export interface CategorizationRule {
  id: string;
  matchVendorTin: string | null;
  matchVendorPattern: string | null;
  matchKeyword: string | null;
  setTaxCategory: string | null;
  setAccountingCategory: string | null;
  note: string | null;
  priority: number;
  timesApplied: number;
  source: string;
  isActive?: boolean;
  createdAt?: string;
  /** A short human summary, filled in by the store for the client. */
  label?: string;
}

/** The editable shape when creating/persisting a rule. */
export interface RuleInput {
  matchVendorTin?: string | null;
  matchVendorPattern?: string | null;
  matchKeyword?: string | null;
  setTaxCategory?: string | null;
  setAccountingCategory?: string | null;
  note?: string | null;
  priority?: number;
}

/** A human correction to an extraction, and whether to learn a rule from it. */
export interface OverrideInput {
  taxCategory?: string | null;
  accountingCategory?: string | null;
  vendorTin?: string | null;
  /** Persist a categorization rule from this correction (default true). */
  createRule?: boolean;
  /** How to scope the learned rule: by vendor (default) or by a keyword. */
  ruleScope?: "vendor" | "keyword";
}

const trimOrNull = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
};

/** Validate a tax category against the enum, or throw. Empty/null passes through. */
function assertTaxCategory(v: unknown): string | null {
  const s = trimOrNull(v);
  if (s == null) return null;
  const up = s.toUpperCase();
  if (!TAX_ENUM.includes(up)) {
    throw new StoreError(`taxCategory must be one of ${TAX_ENUM.join(", ")}`);
  }
  return up;
}

/**
 * Validate and normalize a rule: needs at least one matcher and one outcome.
 * Throws StoreError on bad input.
 */
export function normalizeRuleInput(input: unknown): Required<Pick<RuleInput,
  "matchVendorTin" | "matchVendorPattern" | "matchKeyword" | "setTaxCategory" |
  "setAccountingCategory" | "note">> & { priority: number } {
  const src = (input ?? {}) as Record<string, unknown>;
  const rule = {
    matchVendorTin: trimOrNull(src.matchVendorTin),
    matchVendorPattern: trimOrNull(src.matchVendorPattern),
    matchKeyword: trimOrNull(src.matchKeyword),
    setTaxCategory: assertTaxCategory(src.setTaxCategory),
    setAccountingCategory: trimOrNull(src.setAccountingCategory),
    note: trimOrNull(src.note),
    priority: Number.isFinite(Number(src.priority)) ? Math.trunc(Number(src.priority)) : 100,
  };
  if (!rule.matchVendorTin && !rule.matchVendorPattern && !rule.matchKeyword) {
    throw new StoreError("A rule needs at least one matcher (vendor TIN, vendor name or keyword)");
  }
  if (!rule.setTaxCategory && !rule.setAccountingCategory) {
    throw new StoreError("A rule needs an outcome (a tax category and/or an accounting category)");
  }
  return rule;
}

const ci = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Test whether a rule matches an extraction; returns how it matched, or null. */
export function ruleMatches(rule: CategorizationRule, e: Extraction): string | null {
  if (rule.matchVendorTin && e.vendorTin && ci(rule.matchVendorTin) === ci(e.vendorTin)) {
    return "vendor TIN";
  }
  if (rule.matchVendorPattern && e.vendorName && ci(e.vendorName).includes(ci(rule.matchVendorPattern))) {
    return "vendor name";
  }
  if (rule.matchKeyword) {
    const kw = ci(rule.matchKeyword);
    const hit =
      ci(e.accountingCategory).includes(kw) ||
      e.lines.some((l) => ci(l.description).includes(kw) || ci(l.accountingCategory).includes(kw));
    if (hit) return "keyword";
  }
  return null;
}

/**
 * Find the best matching active rule for an extraction: lowest `priority` first,
 * then oldest. Returns the rule and how it matched, or null.
 */
export function matchRule(
  e: Extraction,
  rules: CategorizationRule[],
): { rule: CategorizationRule; matchedOn: string } | null {
  const ordered = [...rules]
    .filter((r) => r.isActive !== false)
    .sort((a, b) => a.priority - b.priority || String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const rule of ordered) {
    const matchedOn = ruleMatches(rule, e);
    if (matchedOn) return { rule, matchedOn };
  }
  return null;
}

/** Recompute validation flags after a change to the extraction. */
function withFreshFlags(e: Extraction): Extraction {
  return { ...e, validationFlags: deriveValidationFlags(e) };
}

/**
 * Apply a matched rule to an extraction: override the tax and/or accounting
 * category (document- and line-level), record the `appliedRule` provenance, and
 * recompute flags. Does not mutate the input.
 */
export function applyRuleToExtraction(
  e: Extraction,
  rule: CategorizationRule,
  matchedOn: string,
): Extraction {
  const next: Extraction = {
    ...e,
    lines: e.lines.map((l) => ({ ...l })),
    appliedRule: {
      id: rule.id,
      label: ruleLabel(rule),
      matchedOn,
      wasTaxCategory: e.predictedTaxCategory,
      wasAccountingCategory: e.accountingCategory,
    },
  };
  if (rule.setTaxCategory) {
    next.predictedTaxCategory = rule.setTaxCategory;
    next.lines = next.lines.map((l) => ({ ...l, taxCategory: rule.setTaxCategory as string }));
  }
  if (rule.setAccountingCategory) {
    next.accountingCategory = rule.setAccountingCategory;
    next.lines = next.lines.map((l) => ({ ...l, accountingCategory: rule.setAccountingCategory as string }));
  }
  return withFreshFlags(next);
}

/**
 * Apply a human override to an extraction: set the tax and/or accounting category
 * and/or the vendor TIN, mark it `overridden`, and recompute flags. Does not
 * mutate the input.
 */
export function applyOverrideToExtraction(e: Extraction, override: OverrideInput): Extraction {
  const taxCategory = assertTaxCategory(override.taxCategory);
  const accountingCategory = trimOrNull(override.accountingCategory);
  const vendorTin = trimOrNull(override.vendorTin);
  if (!taxCategory && !accountingCategory && vendorTin == null) {
    throw new StoreError("An override must change the tax category, accounting category or vendor TIN");
  }
  const next: Extraction = {
    ...e,
    lines: e.lines.map((l) => ({ ...l })),
    overridden: true,
  };
  if (taxCategory) {
    next.predictedTaxCategory = taxCategory;
    next.lines = next.lines.map((l) => ({ ...l, taxCategory }));
  }
  if (accountingCategory) {
    next.accountingCategory = accountingCategory;
    next.lines = next.lines.map((l) => ({ ...l, accountingCategory }));
  }
  if (vendorTin != null) next.vendorTin = vendorTin;
  return withFreshFlags(next);
}

/** A short human label for a rule, e.g. "vendor TIN 100…GST001 → TGST". */
export function ruleLabel(rule: CategorizationRule): string {
  const matcher = rule.matchVendorTin
    ? `vendor TIN ${rule.matchVendorTin}`
    : rule.matchVendorPattern
      ? `vendor "${rule.matchVendorPattern}"`
      : `keyword "${rule.matchKeyword}"`;
  const outcome = [rule.setTaxCategory, rule.setAccountingCategory].filter(Boolean).join(" · ");
  return `${matcher} → ${outcome}`;
}

/**
 * Derive a rule from a human override + the document it corrected. Scopes to the
 * vendor (TIN preferred, else name) or, when asked, to a keyword from the first
 * line. Returns null when no matcher can be derived (nothing to learn).
 */
export function buildRuleFromOverride(e: Extraction, override: OverrideInput): RuleInput | null {
  const setTaxCategory = assertTaxCategory(override.taxCategory);
  const setAccountingCategory = trimOrNull(override.accountingCategory);
  if (!setTaxCategory && !setAccountingCategory) return null; // nothing to apply next time

  const rule: RuleInput = { setTaxCategory, setAccountingCategory };
  // A TIN correction in the same override should key the rule too, if given.
  const tin = trimOrNull(override.vendorTin) ?? e.vendorTin;
  if (override.ruleScope === "keyword") {
    const kw = trimOrNull(e.lines[0]?.description);
    if (!kw) return null;
    rule.matchKeyword = kw;
  } else if (tin) {
    rule.matchVendorTin = tin;
  } else if (e.vendorName) {
    rule.matchVendorPattern = e.vendorName;
  } else {
    return null;
  }
  return rule;
}
