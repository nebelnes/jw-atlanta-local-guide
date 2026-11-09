// Fetch the next few days of events at the guide's event venues from Ticketmaster's
// Discovery API and write data/events.json. Run by .github/workflows/events.yml on a schedule.
//
//   TICKETMASTER_API_KEY=... node scripts/fetch-events.mjs
//
// Without a key it exits quietly and changes nothing, so the site keeps working.
// Terms: https://developer.ticketmaster.com/support/terms-of-use/ (event data may be kept
// "for reasonable periods" to provide the service; we refresh several times a day).

import { readFile, writeFile } from "node:fs/promises";
import { pickVenue, toEvents, sortEvents, excludeEvents } from "./lib/events.mjs";

const KEY = process.env.TICKETMASTER_API_KEY;
const API = "https://app.ticketmaster.com/discovery/v2";

if (!KEY) {
  console.log("TICKETMASTER_API_KEY is not set; skipping (data/events.json left as is).");
  process.exit(0);
}

const config = JSON.parse(await readFile(new URL("../data/event-venues.json", import.meta.url), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path, params) {
  const url = `${API}/${path}?${new URLSearchParams({ ...params, apikey: KEY })}`;
  const res = await fetch(url);
  await sleep(600); // stay well under the 2 requests/second limit
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

const start = new Date();
const end = new Date(start.getTime() + config.days * 24 * 3600 * 1000);
const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

let events = [];
let failures = 0;
for (const v of config.venues) {
  try {
    const tmId = v.ticketmasterVenueId ?? pickVenue(await get("venues.json", { keyword: v.search, stateCode: "GA", city: "Atlanta", size: "20" }), v.search);
    if (!tmId) { console.log(`⚠ ${v.venueId}: no Ticketmaster venue found for "${v.search}"`); continue; }
    const found = toEvents(await get("events.json", { venueId: tmId, startDateTime: iso(start), endDateTime: iso(end), size: "50", sort: "date,asc" }), v.venueId);
    console.log(`✓ ${v.venueId} (${tmId}): ${found.length} events`);
    events.push(...found);
  } catch (err) {
    failures++;
    console.log(`⚠ ${v.venueId}: ${err.message}`);
  }
}

if (failures === config.venues.length) {
  console.log("Every venue failed; keeping the previous data/events.json.");
  process.exit(1);
}

const doc = {
  source: "Ticketmaster",
  sourceUrl: "https://www.ticketmaster.com",
  timeZone: "America/New_York",
  generatedAt: new Date().toISOString(),
  days: config.days,
  events: sortEvents(excludeEvents(events, config.exclude)),
};
await writeFile(new URL("../data/events.json", import.meta.url), JSON.stringify(doc, null, 2) + "\n");
console.log(`Wrote data/events.json: ${doc.events.length} events.`);
