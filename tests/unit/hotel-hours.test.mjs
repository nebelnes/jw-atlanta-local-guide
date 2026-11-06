// Unit tests for assets/hotel-hours.js (formatting and "open now" status).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

await import("../../assets/hotel-hours.js");
const { formatTime, formatDays, lines, status } = globalThis.hotelHours;
const doc = JSON.parse(readFileSync(new URL("../../data/hotel-hours.json", import.meta.url), "utf8"));
const outlet = (id) => doc.outlets.find((o) => o.id === id);
const TZ = doc.timeZone;
// Times below are Atlanta local; November 2026 is EST (UTC-5). Nov 6 2026 is a Friday.
const at = (iso) => new Date(`${iso}-05:00`);

test("times read like the sheet", () => {
  assert.equal(formatTime("06:30"), "6:30 AM");
  assert.equal(formatTime("12:00"), "12:00 PM");
  assert.equal(formatTime("17:30"), "5:30 PM");
  assert.equal(formatTime("24:00"), "12:00 AM");
});

test("day groups", () => {
  assert.equal(formatDays(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), "Daily");
  assert.equal(formatDays(["mon", "tue", "wed", "thu", "fri"]), "Mon–Fri");
  assert.equal(formatDays(["sat", "sun"]), "Sat & Sun");
  assert.equal(formatDays(["sun", "mon", "tue", "wed", "thu"]), "Sun–Thu");
  assert.equal(formatDays(["mon", "wed"]), "Mon, Wed");
});

test("display rows", () => {
  assert.deepEqual(lines(outlet("fitness-center")), [{ label: null, days: "Daily", time: "Open 24 hours" }]);
  assert.deepEqual(lines(outlet("the-ledger")).map((l) => `${l.days} ${l.time}`), ["Sun–Thu 12:00 PM – 11:00 PM", "Fri & Sat 12:00 PM – 12:00 AM"]);
});

test("open now / closed, in hotel time", () => {
  assert.deepEqual(status(outlet("fiora"), at("2026-11-06T09:00"), TZ), { open: true, text: "Open now · until 11:00 AM" });
  assert.deepEqual(status(outlet("fiora"), at("2026-11-06T11:00"), TZ), { open: false, text: "Closed · opens tomorrow 8:00 AM" });
  assert.deepEqual(status(outlet("executive-lounge"), at("2026-11-06T12:00"), TZ), { open: false, text: "Closed · opens 5:30 PM" });
  assert.deepEqual(status(outlet("the-ledger"), at("2026-11-06T23:30"), TZ), { open: true, text: "Open now · until 12:00 AM" }); // Friday
  assert.deepEqual(status(outlet("the-ledger"), at("2026-11-08T23:30"), TZ), { open: false, text: "Closed · opens tomorrow 12:00 PM" }); // Sunday
  assert.deepEqual(status(outlet("in-room-dining"), at("2026-11-06T13:00"), TZ), { open: false, text: "Closed · opens 5:00 PM (dinner)" });
  assert.deepEqual(status(outlet("in-room-dining"), at("2026-11-06T08:00"), TZ), { open: true, text: "Open now · Breakfast until 11:00 AM" });
  assert.deepEqual(status(outlet("fitness-center"), at("2026-11-06T03:00"), TZ), { open: true, text: "Open 24 hours" });
});

test("a viewer in another time zone still sees hotel time", () => {
  // 14:00 UTC = 9:00 AM in Atlanta, regardless of the device's zone
  assert.equal(status(outlet("fiora"), new Date("2026-11-06T14:00:00Z"), TZ).open, true);
});
