/**
 * Money is represented as an integer number of minor units (e.g. cents) to
 * avoid floating-point rounding errors. A `Money` value carries no currency
 * tag on its own; currency is tracked at the account level in the ledger.
 */
export type Money = number;

/** Number of minor units in one major unit (e.g. 100 cents per dollar). */
export const MINOR_UNITS_PER_MAJOR = 100;

/**
 * Convert a major-unit amount (e.g. `12.34` dollars) into integer minor units
 * (`1234` cents). Rejects values that cannot be represented exactly.
 */
export function fromMajor(major: number): Money {
  if (!Number.isFinite(major)) {
    throw new RangeError(`Amount must be a finite number, got ${major}`);
  }
  // Round to the nearest minor unit. This absorbs the tiny binary
  // floating-point error in inputs like `12.34` (stored as `12.340000…`).
  // `assertMoney` still rejects results that overflow the safe integer range.
  const minor = Math.round(major * MINOR_UNITS_PER_MAJOR);
  return assertMoney(minor);
}

/** Convert integer minor units back to a major-unit number. */
export function toMajor(minor: Money): number {
  return assertMoney(minor) / MINOR_UNITS_PER_MAJOR;
}

/**
 * Validate that a value is a safe, integer amount of minor units.
 * Returns the value unchanged so it can be used inline.
 */
export function assertMoney(value: number): Money {
  if (!Number.isInteger(value)) {
    throw new RangeError(`Money must be an integer minor-unit amount, got ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Money ${value} exceeds the safe integer range`);
  }
  return value;
}

/** Format minor units as a fixed-decimal string, e.g. `1234` -> `"12.34"`. */
export function formatMoney(minor: Money): string {
  assertMoney(minor);
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const major = Math.floor(abs / MINOR_UNITS_PER_MAJOR);
  const rem = abs % MINOR_UNITS_PER_MAJOR;
  return `${sign}${major}.${rem.toString().padStart(2, "0")}`;
}
