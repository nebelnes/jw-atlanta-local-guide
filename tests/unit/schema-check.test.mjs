// Unit tests for the minimal JSON Schema checker (scripts/lib/schema-check.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSchema } from "../../scripts/lib/schema-check.mjs";

test("type arrays allow null", () => {
  assert.deepEqual(checkSchema(null, { type: ["string", "null"] }), []);
  assert.equal(checkSchema(3, { type: ["string", "null"] }).length, 1);
});

test("integer vs number", () => {
  assert.deepEqual(checkSchema(4, { type: "number" }), []);
  assert.equal(checkSchema(4.5, { type: "integer" }).length, 1);
});

test("local $ref resolves", () => {
  const schema = { $defs: { id: { type: "string", pattern: "^[a-z]+$" } }, $ref: "#/$defs/id" };
  assert.deepEqual(checkSchema("abc", schema), []);
  assert.equal(checkSchema("ABC", schema).length, 1);
});

test("uniqueItems catches duplicates", () => {
  assert.equal(checkSchema(["a", "a"], { type: "array", uniqueItems: true }).length, 1);
});

test("formats: uri and date", () => {
  assert.deepEqual(checkSchema("https://example.com/x", { type: "string", format: "uri" }), []);
  assert.equal(checkSchema("example.com", { type: "string", format: "uri" }).length, 1);
  assert.deepEqual(checkSchema("2026-02-28", { type: "string", format: "date" }), []);
  assert.equal(checkSchema("2026-02-30", { type: "string", format: "date" }).length, 1);
});

test("unsupported keywords fail loudly instead of being ignored", () => {
  assert.throws(() => checkSchema("x", { type: "string", maxLength: 3 }), /Unsupported schema keyword "maxLength"/);
});
