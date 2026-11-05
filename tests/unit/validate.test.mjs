// Unit tests for the data checker (scripts/lib/validate.mjs).
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { validateData } from "../../scripts/lib/validate.mjs";

const read = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), "utf8"));
const TODAY = new Date().toISOString().slice(0, 10);
const FUTURE = `${Number(TODAY.slice(0, 4)) + 1}-01-01`;

/** Fresh deep copy of the committed data so each test can break one thing. */
function data() {
  return structuredClone({
    venuesDoc: read("data/venues.json"),
    taxonomy: read("data/taxonomy.json"),
    hotel: read("data/hotel.json"),
    schema: read("schema/venue.schema.json"),
    landmarksDoc: read("data/landmarks.json"),
    routeSchema: read("schema/route.schema.json"),
    routes: Object.fromEntries(
      readdirSync(new URL("../../data/routes/", import.meta.url)).filter((f) => f.endsWith(".json")).map((f) => [f, read(`data/routes/${f}`)]),
    ),
  });
}

/** Apply `mutate`, validate, and return the error messages. */
function errorsAfter(mutate) {
  const d = data();
  mutate(d);
  return validateData(d, { today: TODAY });
}

function assertFlags(errors, { id, field, match }) {
  const hit = errors.find(
    (e) => (id === undefined || e.id === id) && (field === undefined || e.field === field) && match.test(e.message),
  );
  assert.ok(hit, `expected an error for ${id ?? ""} ${field ?? ""} matching ${match}; got:\n${JSON.stringify(errors, null, 2)}`);
}

test("committed data is valid", () => {
  assert.deepEqual(validateData(data(), { today: TODAY }), []);
});

test("missing required field is reported", () => {
  const errors = errorsAfter((d) => delete d.venuesDoc.venues[0].name);
  assertFlags(errors, { id: "fiora-cucina-italiana", field: "name", match: /required/ });
});

test("unknown field is reported", () => {
  const errors = errorsAfter((d) => (d.venuesDoc.venues[0].vibe = "cozy"));
  assertFlags(errors, { field: "vibe", match: /not a known field/ });
});

test("duplicate id is reported", () => {
  const errors = errorsAfter((d) => (d.venuesDoc.venues[1].id = d.venuesDoc.venues[0].id));
  assertFlags(errors, { field: "id", match: /duplicate id/ });
});

test("id must be kebab-case", () => {
  const errors = errorsAfter((d) => (d.venuesDoc.venues[0].id = "Fiora Cucina"));
  assertFlags(errors, { field: "id", match: /pattern/ });
});

test("invalid status is reported", () => {
  const errors = errorsAfter((d) => (d.venuesDoc.venues[0].status = "open"));
  assertFlags(errors, { field: "status", match: /one of/ });
});

test("cuisine group not in taxonomy is reported", () => {
  const errors = errorsAfter((d) => (d.venuesDoc.venues[0].cuisineGroup = "Martian"));
  assertFlags(errors, { field: "cuisineGroup", match: /not a cuisine group/ });
});

test("cuisine not listed under its group is reported", () => {
  const errors = errorsAfter((d) => (d.venuesDoc.venues[0].cuisine = "Steakhouse")); // American, not European
  assertFlags(errors, { field: "cuisine", match: /not listed under "European"/ });
});

test("price level not in taxonomy is reported", () => {
  const errors = errorsAfter((d) => (d.venuesDoc.venues[0].priceLevel = "$$$$$"));
  assertFlags(errors, { field: "priceLevel", match: /not a price level/ });
});

test("dining style not in taxonomy is reported", () => {
  const errors = errorsAfter((d) => (d.venuesDoc.venues[0].diningStyle = "Food Truck"));
  assertFlags(errors, { field: "diningStyle", match: /not a dining style/ });
});

test("negative walk time is reported", () => {
  const errors = errorsAfter((d) => (d.venuesDoc.venues[0].walkMinutes = -3));
  assertFlags(errors, { field: "walkMinutes", match: /≥ 0/ });
});

test('placeholder text such as "Check current hours" is rejected', () => {
  const errors = errorsAfter((d) => (d.venuesDoc.venues[0].hours = "Check current hours"));
  assertFlags(errors, { field: "hours", match: /placeholder/ });
});

test("malformed URL is reported", () => {
  const errors = errorsAfter((d) => (d.venuesDoc.venues[0].verification.sourceUrls = ["discoveratlanta"]));
  assertFlags(errors, { field: "verification.sourceUrls[0]", match: /URL/ });
});

test("lastVerified in the future is reported", () => {
  const errors = errorsAfter((d) => (d.venuesDoc.venues[0].verification.lastVerified = FUTURE));
  assertFlags(errors, { field: "verification.lastVerified", match: /future/ });
});

test("lastVerified must be a real date", () => {
  const errors = errorsAfter((d) => (d.venuesDoc.venues[0].verification.lastVerified = "2026-02-30"));
  assertFlags(errors, { field: "verification.lastVerified", match: /real date/ });
});

test("route file must belong to a real venue and match its file name", () => {
  const errors = errorsAfter((d) => (d.routes["catch-12.json"].venueId = "polaris"));
  assert.ok(errors.some((e) => e.file === "data/routes/catch-12.json" && e.field === "venueId" && /match the file name/.test(e.message)));
  const orphan = errorsAfter((d) => (d.routes["ghost.json"] = { ...d.routes["catch-12.json"], venueId: "ghost" }));
  assert.ok(orphan.some((e) => e.file === "data/routes/ghost.json" && /no venue "ghost"/.test(e.message)));
});

test("route file: unknown landmark, bad side and future date are reported", () => {
  const errors = errorsAfter((d) => {
    const r = d.routes["catch-12.json"];
    r.landmarks = [{ landmarkId: "eiffel-tower", side: "left", atMeters: 10, metersFromRoute: 5 }];
    r.steps[0].passing = [{ landmarkId: "eiffel-tower", side: "behind" }];
    r.computedAt = FUTURE;
  });
  const f = errors.filter((e) => e.file === "data/routes/catch-12.json");
  assert.ok(f.some((e) => /unknown landmark "eiffel-tower"/.test(e.message)));
  assert.ok(f.some((e) => e.field === "steps[0].passing[0].side" && /one of/.test(e.message)));
  assert.ok(f.some((e) => e.field === "computedAt" && /future/.test(e.message)));
});

test("route file: malformed geometry is reported", () => {
  const errors = errorsAfter((d) => (d.routes["catch-12.json"].geometry[1] = [-84.39]));
  assert.ok(errors.some((e) => e.field === "geometry[1]" && /\[lng, lat\] pair/.test(e.message)));
});

test("landmark without an outline is reported", () => {
  const errors = errorsAfter((d) => (d.landmarksDoc.landmarks[0].outline = [[-84.39, 33.76]]));
  assert.ok(errors.some((e) => e.file === "data/landmarks.json" && /at least 3/.test(e.message)));
});

test("a cuisine listed under two groups is reported", () => {
  const errors = errorsAfter((d) => d.taxonomy.cuisineGroups[1].cuisines.push("Southern"));
  assert.ok(errors.some((e) => e.file === "data/taxonomy.json" && /also listed under "American"/.test(e.message)));
});

test("hotel without a street address is reported", () => {
  const errors = errorsAfter((d) => delete d.hotel.address.street);
  assert.ok(errors.some((e) => e.file === "data/hotel.json" && e.field === "address.street"));
});

test("dining venues need cuisine and price; other categories don't", () => {
  const errors = errorsAfter((d) => {
    delete d.venuesDoc.venues[0].priceLevel; // a restaurant
    const park = d.venuesDoc.venues.find((v) => v.category === "outdoors");
    assert.ok(park && park.cuisine === undefined);
  });
  assertFlags(errors, { id: "fiora-cucina-italiana", field: "priceLevel", match: /required for dining/ });
  assert.equal(errors.filter((e) => /required for dining/.test(e.message)).length, 1);
});

test("unknown category is reported", () => {
  const errors = errorsAfter((d) => (d.venuesDoc.venues[0].category = "nightclubs"));
  assertFlags(errors, { field: "category", match: /one of/ });
});
