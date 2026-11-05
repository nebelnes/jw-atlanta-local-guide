#!/usr/bin/env node
// Validate the guide's data files. Exits 1 and lists every problem if any are found.
// Usage: npm run validate

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateData } from "./lib/validate.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  venuesDoc: "data/venues.json",
  taxonomy: "data/taxonomy.json",
  hotel: "data/hotel.json",
  schema: "schema/venue.schema.json",
  landmarksDoc: "data/landmarks.json",
  routeSchema: "schema/route.schema.json",
};

const data = {};
const readErrors = [];
for (const [key, rel] of Object.entries(files)) {
  try {
    data[key] = JSON.parse(await readFile(join(root, rel), "utf8"));
  } catch (err) {
    readErrors.push(`${rel}: ${err.code === "ENOENT" ? "file not found" : `not valid JSON (${err.message})`}`);
  }
}

data.routes = {};
try {
  for (const f of (await readdir(join(root, "data/routes"))).filter((f) => f.endsWith(".json")).sort()) {
    try { data.routes[f] = JSON.parse(await readFile(join(root, "data/routes", f), "utf8")); }
    catch (err) { readErrors.push(`data/routes/${f}: not valid JSON (${err.message})`); }
  }
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}

if (readErrors.length) {
  console.error("✗ Could not read data files:\n" + readErrors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}

const errors = validateData(data);
if (errors.length) {
  console.error(`✗ ${errors.length} problem${errors.length === 1 ? "" : "s"} found:`);
  for (const e of errors) {
    const where = [e.file, e.id && `venue "${e.id}"`, e.field].filter(Boolean).join(" › ");
    console.error(`  - ${where}: ${e.message}`);
  }
  process.exit(1);
}

const count = data.venuesDoc.venues.length;
const routeCount = Object.keys(data.routes).length;
console.log(`✓ Data is valid: ${count} venue${count === 1 ? "" : "s"}, ${data.taxonomy.cuisineGroups.length} cuisine groups, ${data.landmarksDoc.landmarks.length} landmarks, ${routeCount} walking route${routeCount === 1 ? "" : "s"}.`);
