// Unit tests for scripts/lib/events.mjs (Ticketmaster responses → data/events.json records).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickVenue, toEvents, sortEvents, excludeEvents } from "../../scripts/lib/events.mjs";
import { readFileSync } from "node:fs";

const venues = { _embedded: { venues: [
  { id: "KovZ-elsewhere", name: "State Farm Arena", city: { name: "Somewhere" }, state: { stateCode: "TX" } },
  { id: "KovZ-sfa", name: "State Farm Arena", city: { name: "Atlanta" }, state: { stateCode: "GA" } },
] } };

test("pickVenue chooses the Atlanta, GA venue", () => {
  assert.equal(pickVenue(venues, "State Farm Arena"), "KovZ-sfa");
  assert.equal(pickVenue({}, "Nowhere"), null);
});

test("toEvents keeps date, time, status and link; drops cancelled events", () => {
  const res = { _embedded: { events: [
    { name: "Atlanta Hawks vs. Boston Celtics", url: "https://www.ticketmaster.com/event/1", dates: { start: { localDate: "2026-11-09", localTime: "19:30:00" }, status: { code: "onsale" } } },
    { name: "Cancelled Show", url: "https://www.ticketmaster.com/event/2", dates: { start: { localDate: "2026-11-10", localTime: "20:00:00" }, status: { code: "cancelled" } } },
    { name: "Time TBA Show", url: "javascript:alert(1)", dates: { start: { localDate: "2026-11-11", timeTBA: true }, status: { code: "rescheduled" } } },
  ] } };
  assert.deepEqual(toEvents(res, "state-farm-arena"), [
    { venueId: "state-farm-arena", name: "Atlanta Hawks vs. Boston Celtics", date: "2026-11-09", time: "19:30", status: "scheduled", url: "https://www.ticketmaster.com/event/1" },
    { venueId: "state-farm-arena", name: "Time TBA Show", date: "2026-11-11", time: null, status: "rescheduled", url: null },
  ]);
});

test("sortEvents orders by date, then time, with TBA last", () => {
  const s = sortEvents([
    { name: "B", date: "2026-11-10", time: null }, { name: "C", date: "2026-11-09", time: "20:00" },
    { name: "A", date: "2026-11-10", time: "13:00" }, { name: "D", date: "2026-11-09", time: "12:00" },
  ]);
  assert.deepEqual(s.map((e) => e.name), ["D", "C", "A", "B"]);
});

test("tours, club add-ons and parking are filtered out using the patterns in data/event-venues.json", () => {
  const { exclude } = JSON.parse(readFileSync(new URL("../../data/event-venues.json", import.meta.url), "utf8"));
  const names = ["Tours: Truist Park", "Delta Sky360 Club Experience: Olivia Rodrigo", "Parking: Falcons vs. Saints",
    "Olivia Rodrigo: The Unraveled Tour", "Atlanta Hawks vs. Los Angeles Lakers", "The R&B Tour - Starring Usher Raymond & Chris Brown"];
  const kept = excludeEvents(names.map((name) => ({ name })), exclude).map((e) => e.name);
  assert.deepEqual(kept, ["Olivia Rodrigo: The Unraveled Tour", "Atlanta Hawks vs. Los Angeles Lakers", "The R&B Tour - Starring Usher Raymond & Chris Brown"]);
});
