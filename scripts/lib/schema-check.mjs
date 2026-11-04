// Minimal JSON Schema checker for this project's schemas.
//
// Supports the subset of draft 2020-12 used in schema/*.json:
// type (incl. type arrays), enum, required, properties,
// additionalProperties: false, items, uniqueItems, minLength, pattern,
// minimum, maximum, format ("uri", "date"), and local "$ref" ("#/$defs/...").
//
// Kept dependency-free on purpose so `npm run validate` works with only Node
// installed. If a schema needs a keyword not listed here, add it here and add
// a unit test in tests/unit/schema-check.test.mjs.

const SUPPORTED = new Set([
  "$schema", "$id", "$defs", "$ref", "title", "description",
  "type", "enum", "required", "properties", "additionalProperties",
  "items", "uniqueItems", "minLength", "pattern", "minimum", "maximum", "format",
]);

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value; // "string" | "number" | "boolean" | "object"
}

function matchesType(value, type) {
  const actual = typeOf(value);
  if (type === "number") return actual === "number" || actual === "integer";
  return actual === type;
}

function isValidUri(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function resolveRef(root, ref) {
  if (!ref.startsWith("#/")) throw new Error(`Unsupported $ref: ${ref}`);
  let node = root;
  for (const part of ref.slice(2).split("/")) {
    node = node?.[part];
    if (node === undefined) throw new Error(`Unresolvable $ref: ${ref}`);
  }
  return node;
}

/**
 * Check `value` against `schema`.
 * @returns {{path: string, message: string}[]} empty when valid
 */
export function checkSchema(value, schema, root = schema, path = "") {
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED.has(key)) throw new Error(`Unsupported schema keyword "${key}" at ${path || "(root)"}`);
  }
  if (schema.$ref) return checkSchema(value, resolveRef(root, schema.$ref), root, path);

  const errors = [];
  const at = path || "(root)";
  const fail = (message) => errors.push({ path: at, message });

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      fail(`expected ${types.join(" or ")}, got ${typeOf(value)}`);
      return errors; // further checks would only add noise
    }
  }

  if (schema.enum && !schema.enum.some((v) => v === value)) {
    fail(`must be one of: ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}`);
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) fail(`must not be empty`);
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) fail(`does not match pattern ${schema.pattern}`);
    if (schema.format === "uri" && !isValidUri(value)) fail(`must be a full http(s) URL`);
    if (schema.format === "date" && !isValidDate(value)) fail(`must be a real date in YYYY-MM-DD form`);
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`must be ≥ ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`must be ≤ ${schema.maximum}`);
  }

  if (Array.isArray(value)) {
    if (schema.uniqueItems) {
      const seen = new Set();
      for (const item of value) {
        const k = JSON.stringify(item);
        if (seen.has(k)) fail(`contains duplicate item ${k}`);
        seen.add(k);
      }
    }
    if (schema.items) {
      value.forEach((item, i) => errors.push(...checkSchema(item, schema.items, root, `${path}[${i}]`)));
    }
  }

  if (typeOf(value) === "object") {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push({ path: path ? `${path}.${key}` : key, message: "is required" });
    }
    const props = schema.properties ?? {};
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (props[key]) errors.push(...checkSchema(child, props[key], root, childPath));
      else if (schema.additionalProperties === false) errors.push({ path: childPath, message: "is not a known field" });
    }
  }

  return errors;
}
