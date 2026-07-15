import assert from "node:assert/strict";
import { test } from "node:test";
import { assertMoney, formatMoney, fromMajor, toMajor } from "../src/money.ts";

test("fromMajor converts to integer minor units", () => {
  assert.equal(fromMajor(12.34), 1234);
  assert.equal(fromMajor(0), 0);
  assert.equal(fromMajor(-5), -500);
});

test("fromMajor rounds to the nearest minor unit", () => {
  assert.equal(fromMajor(0.126), 13);
  assert.equal(fromMajor(0.124), 12);
});

test("fromMajor absorbs binary floating-point error", () => {
  // 0.1 + 0.2 === 0.30000000000000004, which must still land on 30 cents.
  assert.equal(fromMajor(0.1 + 0.2), 30);
});

test("fromMajor rejects non-finite amounts", () => {
  assert.throws(() => fromMajor(Number.POSITIVE_INFINITY), RangeError);
  assert.throws(() => fromMajor(Number.NaN), RangeError);
});

test("toMajor is the inverse of fromMajor for exact values", () => {
  assert.equal(toMajor(fromMajor(99.99)), 99.99);
});

test("assertMoney rejects fractional and unsafe integers", () => {
  assert.throws(() => assertMoney(1.5), RangeError);
  assert.throws(() => assertMoney(Number.MAX_SAFE_INTEGER + 2), RangeError);
  assert.equal(assertMoney(42), 42);
});

test("formatMoney renders fixed two-decimal strings", () => {
  assert.equal(formatMoney(1234), "12.34");
  assert.equal(formatMoney(5), "0.05");
  assert.equal(formatMoney(-1234), "-12.34");
  assert.equal(formatMoney(0), "0.00");
});
