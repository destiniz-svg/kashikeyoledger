import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizeRead, authorizeWrite, extractApiKey } from "../src/auth.ts";

const KEY = "sk_test_abc123";
const READ_KEY = "rk_test_read_only";

test("rejects writes with 503 when no key is configured (fail-closed)", () => {
  const r = authorizeWrite({ "x-api-key": KEY }, undefined);
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
});

test("rejects with 401 when no key is presented", () => {
  const r = authorizeWrite({}, KEY);
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});

test("rejects with 403 when the key is wrong", () => {
  const r = authorizeWrite({ "x-api-key": "wrong" }, KEY);
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test("accepts a correct key via X-API-Key", () => {
  const r = authorizeWrite({ "x-api-key": KEY }, KEY);
  assert.equal(r.ok, true);
  assert.equal(r.status, 200);
});

test("accepts a correct key via Authorization: Bearer", () => {
  const r = authorizeWrite({ authorization: `Bearer ${KEY}` }, KEY);
  assert.equal(r.ok, true);
});

test("comparison length-mismatch does not throw and is rejected", () => {
  const r = authorizeWrite({ "x-api-key": "short" }, KEY);
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test("extractApiKey prefers X-API-Key, falls back to Bearer, trims", () => {
  assert.equal(extractApiKey({ "x-api-key": "  k1  " }), "k1");
  assert.equal(extractApiKey({ authorization: "Bearer k2" }), "k2");
  assert.equal(extractApiKey({ authorization: "bearer k3" }), "k3");
  assert.equal(extractApiKey({ authorization: "Basic zzz" }), undefined);
  assert.equal(extractApiKey({}), undefined);
});

test("reads are open when no keys are configured", () => {
  assert.equal(authorizeRead({}, {}).ok, true);
});

test("reads require a key once any key is configured", () => {
  const r = authorizeRead({}, { writeKey: KEY });
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});

test("reads accept the full write key", () => {
  assert.equal(authorizeRead({ "x-api-key": KEY }, { writeKey: KEY, readKey: READ_KEY }).ok, true);
});

test("reads accept the read-only key", () => {
  assert.equal(authorizeRead({ "x-api-key": READ_KEY }, { writeKey: KEY, readKey: READ_KEY }).ok, true);
});

test("the read-only key does NOT authorize writes", () => {
  const r = authorizeWrite({ "x-api-key": READ_KEY }, KEY);
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test("reads reject an unknown key with 403", () => {
  const r = authorizeRead({ "x-api-key": "nope" }, { writeKey: KEY, readKey: READ_KEY });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});
