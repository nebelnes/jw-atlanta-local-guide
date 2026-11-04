// Parity test: the data moved out of index.html must match what the page
// contained before the move (snapshot in tests/fixtures/baseline-restaurants.json,
// taken from the restaurants array in index.html at commit 8342567).
//
// Documented transformations — everything else must be identical:
//   region   → cuisineGroup        price → priceLevel      type → diningStyle
//   walk     → walkMinutes         desc  → summary         verified → verification.sourceLabel
//   "Check current hours" / "Check official site" placeholders → null (the page shows the placeholder)
//   new fields: id, status ("active"), category ("dining"), verification.sourceUrls ([]), verification.lastVerified (null)
//
// Once content editing starts (new venues, rewritten summaries), this test has done its job
// and can be deleted in the same pull request that intentionally changes the data.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), "utf8"));
const baseline = read("tests/fixtures/baseline-restaurants.json");
const venues = read("data/venues.json").venues;
const PLACEHOLDER = /^Check /;

test("same number of restaurants, in the same order", () => {
  assert.equal(venues.length, baseline.length);
  assert.deepEqual(venues.map((v) => v.name), baseline.map((b) => b.name));
});

test("every original value survives the move", () => {
  baseline.forEach((b, i) => {
    const v = venues[i];
    const expected = {
      name: b.name,
      cuisineGroup: b.region,
      cuisine: b.cuisine,
      rating: b.rating,
      priceLevel: b.price,
      diningStyle: b.type,
      walkMinutes: b.walk,
      hours: PLACEHOLDER.test(b.hours) ? null : b.hours,
      phone: PLACEHOLDER.test(b.phone) ? null : b.phone,
      address: b.address,
      summary: b.desc,
      sourceLabel: b.verified,
    };
    const actual = {
      name: v.name,
      cuisineGroup: v.cuisineGroup,
      cuisine: v.cuisine,
      rating: v.rating,
      priceLevel: v.priceLevel,
      diningStyle: v.diningStyle,
      walkMinutes: v.walkMinutes,
      hours: v.hours,
      phone: v.phone,
      address: v.address,
      summary: v.summary,
      sourceLabel: v.verification.sourceLabel,
    };
    assert.deepEqual(actual, expected, `record ${i} (${b.name})`);
  });
});

test("new fields have their documented starting values", () => {
  for (const v of venues) {
    assert.equal(v.status, "active", v.id);
    assert.equal(v.category, "dining", v.id);
    assert.deepEqual(v.verification.sourceUrls, [], v.id);
    assert.equal(v.verification.lastVerified, null, v.id);
  }
});
