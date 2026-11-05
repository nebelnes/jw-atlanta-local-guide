// Tests for turning raw OpenStreetMap routes into guest-friendly steps (scripts/lib/route-steps.mjs).
// The fixture is real data for the hotel → Mercedes-Benz Stadium walk, the route reviewed on 2026-11-05.
// Step 4 crosses a pedestrian area (the walkway by the MAA Centennial Park apartments) before Centennial Olympic Park Dr.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSteps, shortStreet, distanceText, classify } from "../../scripts/lib/route-steps.mjs";

const read = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), "utf8"));
const fx = read("tests/fixtures/route-stadium.json");
const landmarks = read("data/landmarks.json").landmarks.map((l) => ({ ...l, ring: l.outline }));

const stadium = () =>
  buildSteps({
    route: fx.route,
    legLookups: fx.legLookups,
    samples: fx.samples,
    landmarks,
    destinationName: "Mercedes-Benz Stadium",
    arrivalNote: "Follow posted event signage to your gate.",
    destinationLandmarkId: "mercedes-benz-stadium",
  });

test("stadium walk: the reviewed directions, every real turn included", () => {
  const { steps } = stadium();
  assert.deepEqual(
    steps.map((s) => s.instruction),
    [
      "Leave the hotel and head west on Ivan Allen Jr Blvd.",
      "Turn left onto Williams St NW, heading south.",
      "Turn right onto West Peachtree Pl NW, heading west.",
      "Turn left and continue south across the pedestrian plaza.",
      "Continue south on Centennial Olympic Park Dr NW.",
      "Enter Centennial Olympic Park. Follow PATH Parkway, Garden Walk and Centennial Plaza southwest through the park.",
      "Bear right onto Andrew Young International Blvd, heading west.",
      "Continue southwest across the pedestrian plaza toward Mercedes-Benz Stadium.",
      "Arrive at Mercedes-Benz Stadium. Follow posted event signage to your gate.",
    ],
  );
});

test("stadium walk: step distances add up to the route", () => {
  const { steps } = stadium();
  const total = steps.reduce((sum, s) => sum + s.distanceMeters, 0);
  assert.ok(Math.abs(total - fx.route.distance) <= 2, `steps total ${total} m vs route ${fx.route.distance} m`);
  assert.deepEqual(steps.map((s) => distanceText(s.distanceMeters)).slice(0, 8), ["300 ft", "250 ft", "450 ft", "300 ft", "500 ft", "0.3 mi", "0.3 mi", "0.3 mi"]);
});

test("stadium walk: landmarks are noted on the correct side, and only when really passed", () => {
  const { steps, landmarks: passed } = stadium();
  assert.deepEqual(steps[4].passing, [{ landmarkId: "world-of-coca-cola", side: "right" }]);
  assert.deepEqual(steps[6].passing, [
    { landmarkId: "georgia-world-congress-center", side: "right" },
    { landmarkId: "state-farm-arena", side: "left" },
  ]);
  const ids = passed.map((l) => l.landmarkId);
  assert.ok(ids.includes("centennial-olympic-park"));
  assert.ok(!ids.includes("georgia-aquarium"), "the aquarium is ~180 m off the route and must not be claimed");
  assert.ok(!ids.includes("mercedes-benz-stadium"), "the destination is not a landmark you pass");
});

test("street names are abbreviated the way addresses are written", () => {
  assert.equal(shortStreet("Andrew Young International Boulevard Northwest"), "Andrew Young International Blvd NW");
  assert.equal(shortStreet("Ivan Allen Junior Boulevard"), "Ivan Allen Jr Blvd");
  assert.equal(shortStreet("Peachtree Street Northeast"), "Peachtree St NE");
});

test("distances: feet for short stretches, miles beyond ~1,000 ft", () => {
  assert.equal(distanceText(10), "50 ft");
  assert.equal(distanceText(92), "300 ft");
  assert.equal(distanceText(305), "0.2 mi");
});

test("classification: streets, plazas and crossings", () => {
  const pt = [-84.39, 33.77];
  assert.equal(classify({ road: "Luckie Street Northwest", type: "tertiary", pt }, []), "street:Luckie Street Northwest");
  assert.equal(classify({ road: null, type: "pedestrian", pt }, []), "plaza");
  assert.equal(classify({ road: "PATH Parkway", type: "cycleway", pt }, []), "walkway");
  assert.equal(classify({ road: null, type: "crossing", pt }, []), null);
});
