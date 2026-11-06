#!/usr/bin/env node
// Generate walking routes from the hotel to each venue, using free OpenStreetMap services:
//   - Nominatim (nominatim.openstreetmap.org): venue coordinates and street names
//   - OSRM foot profile (routing.openstreetmap.de): the walking route itself
// Results are written to data/routes/<venue-id>.json and venue coordinates to data/venues.json.
// OpenStreetMap data may be stored and reused with attribution ("© OpenStreetMap contributors").
//
// Usage:
//   npm run routes                 # compute routes that are missing
//   npm run routes -- --only catch-12,polaris
//   npm run routes -- --force      # recompute every route (venue pins are kept)
//   npm run routes -- --force --regeocode   # also re-look-up every venue pin from its address
//
// Network access is required, so this is NOT part of `npm test` or CI. Lookups are cached in
// .cache/ (git-ignored) and throttled to 1 request per second per service, as the services ask.

import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { haversine, cumulative, pointAt, inRing, bearing } from "./lib/geo.mjs";
import { buildSteps } from "./lib/route-steps.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "jw-atlanta-local-guide/0.1 (+https://github.com/nebelnes/jw-atlanta-local-guide)";
const NOMINATIM = "https://nominatim.openstreetmap.org";
const OSRM = "https://routing.openstreetmap.de/routed-foot/route/v1/foot";
const OSRM_NEAREST = "https://routing.openstreetmap.de/routed-foot/nearest/v1/foot";
const SAMPLE_EVERY_M = 40;
const SAME_BUILDING_M = 60;
const WALK_LIMIT_M = 2400;   // straight-line pre-check: farther than this is never offered as a walk
const WALK_LIMIT_MIN = 30;   // and a walk longer than this is too long to recommend: drive time instead
const LONG_WALK_MIN = 15;    // walks longer than this are labelled "Longer walk" and also get a drive time
const OSRM_CAR = "https://routing.openstreetmap.de/routed-car/route/v1/driving";

const args = process.argv.slice(2);
const force = args.includes("--force");          // recompute routes
const regeocode = args.includes("--regeocode");  // also re-look-up venue pins (normally kept once set)
const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;

const readJson = async (rel) => JSON.parse(await readFile(join(root, rel), "utf8"));
const writeJson = (rel, data) => writeFile(join(root, rel), JSON.stringify(data, null, 2) + "\n");
const today = new Date().toISOString().slice(0, 10);
const round6 = ([lng, lat]) => [Math.round(lng * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6];

// ---------- throttled, cached HTTP ----------
await mkdir(join(root, ".cache"), { recursive: true });
const cacheFile = join(root, ".cache", "osm-lookups.json");
const cache = existsSync(cacheFile) ? JSON.parse(await readFile(cacheFile, "utf8")) : {};
const lastCall = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, service) {
  if (cache[url]) return cache[url];
  for (let attempt = 1; attempt <= 4; attempt++) {
    const wait = (lastCall[service] ?? 0) + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall[service] = Date.now();
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      cache[url] = data;
      await writeFile(cacheFile, JSON.stringify(cache));
      return data;
    } catch (err) {
      if (attempt === 4) throw new Error(`${service} request failed after 4 attempts: ${err.message} (${url})`);
      await sleep(4000 * attempt);
    }
  }
}

/**
 * Street name at a point. When `walkBearing` is given, also says whether that street runs
 * alongside the walk (within 35°) — near intersections the nearest street is often the cross street.
 */
const reverse = async ([lng, lat], walkBearing = null) => {
  const url = `${NOMINATIM}/reverse?format=jsonv2&zoom=17&layer=address&polygon_geojson=1&polygon_threshold=0.00002&lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}`;
  const j = await getJson(url, "nominatim");
  let parallel = null, streetDistance = null;
  const g = j.geojson;
  const lines = g?.type === "LineString" ? [g.coordinates] : g?.type === "MultiLineString" ? g.coordinates : [];
  if (walkBearing !== null && lines.length) {
    let best = { d: Infinity, b: 0 };
    for (const line of lines) for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      const d = Math.hypot((a[0] + b[0]) / 2 - lng, (a[1] + b[1]) / 2 - lat);
      if (d < best.d) best = { d, b: bearing(a, b) };
    }
    const diff = Math.abs(((walkBearing - best.b + 540) % 360) - 180);
    // alongside = same direction AND close to the street's centre line (a sidewalk, not the middle of a plaza)
    const near = closestOnLines([lng, lat], lines);
    streetDistance = near ? Math.round(near.d) : null;
    parallel = Math.min(diff, 180 - diff) < 35 && (!near || near.d <= 30);
  }
  return { road: j.address?.road ?? null, type: j.type ?? null, parallel, streetDistance, lines };
};

async function geocode(venue) {
  // 1) the street address; 2) the name, if the address isn't matched
  const street = venue.address.split(",")[0].trim();
  const number = street.match(/^\d+/)?.[0];
  for (const [how, q] of [["address", venue.address], ["name", `${venue.name}, Atlanta, GA`]]) {
    const url = `${NOMINATIM}/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`;
    const [hit] = await getJson(url, "nominatim");
    if (!hit) continue;
    const a = hit.address ?? {};
    const confident = how === "address" ? !!number && a.house_number === number : true;
    return {
      coordinates: { lat: Math.round(+hit.lat * 1e6) / 1e6, lng: Math.round(+hit.lon * 1e6) / 1e6 },
      matchedBy: how,
      confident,
      osm: `${hit.osm_type}/${hit.osm_id}`,
      label: hit.display_name.split(",").slice(0, 3).join(",").trim(),
    };
  }
  return null;
}

// ---------- arrival point: the sidewalk on the venue's own street ----------
const EXPAND = [[/\bW\b/g, "West"], [/\bE\b/g, "East"], [/\bN\b/g, "North"], [/\bS\b/g, "South"],
  [/\bNW\b/g, "Northwest"], [/\bNE\b/g, "Northeast"], [/\bSW\b/g, "Southwest"], [/\bSE\b/g, "Southeast"],
  [/\bSt\b/g, "Street"], [/\bBlvd\b/g, "Boulevard"], [/\bDr\b/g, "Drive"], [/\bPl\b/g, "Place"], [/\bAve\b/g, "Avenue"],
  [/\bRd\b/g, "Road"], [/\bJr\b/g, "Junior"], [/\bIntl\b/g, "International"]];
// Atlanta quadrant suffixes (NW/NE…) are dropped for matching: OpenStreetMap is inconsistent about them,
// while a prefix such as "West" Peachtree is a different street and is kept.
const normStreet = (s) => EXPAND.reduce((x, [re, to]) => x.replace(re, to), s.replace(/\./g, "")).toLowerCase()
  .replace(/\s+(northwest|northeast|southwest|southeast)$/, "").replace(/\s+/g, " ").trim();
const addressStreet = (address) => address.split(",")[0].replace(/^\d+[A-Za-z-]*\s+/, "").trim();

/** Closest point on a set of polylines to p (planar approximation, fine at city scale). */
function closestOnLines(p, lines) {
  const kx = Math.cos((p[1] * Math.PI) / 180);
  let best = null;
  for (const line of lines) for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const dx = (b[0] - a[0]) * kx, dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, (((p[0] - a[0]) * kx) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const d = haversine(p, q);
    if (!best || d < best.d) best = { q, d };
  }
  return best;
}

/**
 * Where a guest arrives: the point on the venue's own street directly in front of the building.
 * Finds that street among nearby walkable points (OSRM "nearest" + street names), then projects
 * the building pin onto the street's line. Routing to the building's centre instead can send
 * guests around the back of the block.
 */
async function frontDoor(venue, dest) {
  const want = normStreet(addressStreet(venue.address));
  const near = await getJson(`${OSRM_NEAREST}/${dest[0]},${dest[1]}?number=25`, "osrm");
  if (near.code !== "Ok") return null;
  for (const w of [...near.waypoints].sort((a, b) => a.distance - b.distance)) {
    if (w.distance > 220) break;
    const { road, lines } = await reverse(w.location);
    if (!road || normStreet(road) !== want) continue;
    const curb = lines?.length ? closestOnLines(dest, lines) : null;
    if (curb && curb.d <= 220) return { point: curb.q, street: road, meters: curb.d };
    return { point: w.location, street: road, meters: w.distance };
  }
  return null;
}

// ---------- main ----------
const hotel = await readJson("data/hotel.json");
const venuesDoc = await readJson("data/venues.json");
const landmarksDoc = await readJson("data/landmarks.json");
const landmarks = landmarksDoc.landmarks.map((l) => ({ ...l, ring: l.outline }));
await mkdir(join(root, "data/routes"), { recursive: true });
const existing = new Set((await readdir(join(root, "data/routes"))).map((f) => f.replace(/\.json$/, "")));

if (!hotel.coordinates) throw new Error("data/hotel.json needs coordinates {lat, lng}");
const origin = [hotel.coordinates.lng, hotel.coordinates.lat];
const report = [];
let venuesChanged = false;

for (const venue of venuesDoc.venues) {
  if (venue.status === "closed") continue;
  if (only && !only.has(venue.id)) continue;
  if (!force && existing.has(venue.id) && venue.coordinates) continue;
  if (!force && venue.walkable === false && venue.driveMinutes != null && venue.coordinates) continue;

  const note = { id: venue.id, flags: [] };
  report.push(note);

  const hotelAddress = `${hotel.address.street}, ${hotel.address.locality}, ${hotel.address.region} ${hotel.address.postalCode}`;
  if ((!venue.coordinates || regeocode) && venue.address === hotelAddress) {
    venue.coordinates = { ...hotel.coordinates }; venuesChanged = true;
    note.geocode = "same address as the hotel";
  } else if (!venue.coordinates || regeocode) {
    const g = await geocode(venue);
    if (!g) { note.flags.push("could not find the address in OpenStreetMap — add coordinates by hand"); continue; }
    venue.coordinates = g.coordinates; venuesChanged = true;
    note.geocode = `${g.matchedBy} → ${g.label} (${g.osm})`;
    if (!g.confident) note.flags.push(`address only approximately matched (${g.label}); check the pin`);
  }
  const dest = [venue.coordinates.lng, venue.coordinates.lat];
  const straight = haversine(origin, dest);
  if (straight > 40000) note.flags.push(`destination is ${(straight / 1000).toFixed(1)} km away; geocode may be wrong`);

  let tooLongWalk = false;
  if (straight <= WALK_LIMIT_M && straight >= SAME_BUILDING_M) {
    const peek = await getJson(`${OSRM}/${origin[0]},${origin[1]};${dest[0]},${dest[1]}?overview=false`, "osrm");
    tooLongWalk = peek.code === "Ok" && peek.routes[0].duration / 60 > WALK_LIMIT_MIN;
  }
  if (straight > WALK_LIMIT_M || tooLongWalk) {
    // too far to recommend walking: store a drive time, and no walking card
    const car = await getJson(`${OSRM_CAR}/${origin[0]},${origin[1]};${dest[0]},${dest[1]}?overview=false`, "osrm");
    if (car.code !== "Ok" || !car.routes?.length) { note.flags.push(`no driving route found (${car.code})`); continue; }
    venue.walkable = false; venue.walkMinutes = null;
    venue.driveMinutes = Math.max(1, Math.round(car.routes[0].duration / 60));
    venuesChanged = true;
    if (existing.has(venue.id)) await rm(join(root, `data/routes/${venue.id}.json`));
    note.result = `${(car.routes[0].distance / 1609.34).toFixed(1)} mi by car, ~${venue.driveMinutes} min without traffic (not walkable)`;
    console.log(`✓ ${venue.id}: ${note.result}${note.flags.length ? `  ⚠ ${note.flags.join("; ")}` : ""}`);
    continue;
  }
  if (venue.walkable !== true) { venue.walkable = true; venuesChanged = true; }

  let routeFile;
  if (straight < SAME_BUILDING_M) {
    routeFile = { venueId: venue.id, sameBuilding: true, distanceMeters: 0, durationMinutes: 0, geometry: [round6(origin)], steps: [
      { instruction: `${venue.name} is inside the hotel building.`, distanceMeters: 0, startMeters: 0, passing: [] }], landmarks: [] };
  } else {
    // parks and trails are listed by name, not a street address: route straight to the pin
    const hasStreetAddress = /^\d/.test(venue.address.trim());
    const door = hasStreetAddress ? await frontDoor(venue, dest) : null;
    if (hasStreetAddress && !door) note.flags.push(`couldn't find the sidewalk on ${addressStreet(venue.address)}; route ends at the building pin`);
    const target = door?.point ?? dest;
    const url = `${OSRM}/${origin[0]},${origin[1]};${target[0]},${target[1]}?overview=full&geometries=geojson&steps=true`;
    const osrm = await getJson(url, "osrm");
    if (osrm.code !== "Ok" || !osrm.routes?.length) { note.flags.push(`no walking route found (${osrm.code})`); continue; }
    const route = osrm.routes[0];
    const snap = osrm.waypoints[1]?.distance ?? 0;
    if (!door && snap > 80) note.flags.push(`route ends ${Math.round(snap)} m from the venue pin; check the last step`);

    const coords = route.geometry.coordinates;
    const cum = cumulative(coords);
    const samples = [];
    for (let d = SAMPLE_EVERY_M / 4; d < route.distance; d += SAMPLE_EVERY_M) {
      const pt = pointAt(coords, cum, d);
      const walk = bearing(pointAt(coords, cum, Math.max(0, d - 6)), pointAt(coords, cum, d + 6));
      const { lines, ...lookup } = await reverse(pt, walk);
      samples.push({ d, pt, ...lookup });
    }
    const legLookups = [];
    for (const s of route.legs[0].steps) {
      const g = s.geometry.coordinates;
      if (s.distance < 8 || s.maneuver.type === "arrive") { legLookups.push({ road: null, type: "crossing" }); continue; }
      const gc = cumulative(g);
      const { lines, ...lookup } = await reverse(pointAt(g, gc, gc[gc.length - 1] / 2), bearing(g[0], g[g.length - 1]));
      legLookups.push(lookup);
    }
    const destinationLandmark = landmarks.find((l) => inRing(dest, l.ring));
    if (process.env.ROUTES_DEBUG) await writeFile(join(root, ".cache", `debug-${venue.id}.json`), JSON.stringify({ route, legLookups, samples }));
    const built = buildSteps({
      route, legLookups, samples, landmarks,
      destinationName: venue.name,
      destinationLandmarkId: destinationLandmark?.id,
    });
    routeFile = {
      venueId: venue.id,
      sameBuilding: false,
      distanceMeters: Math.round(route.distance),
      durationMinutes: Math.max(1, Math.round(route.duration / 60)),
      geometry: coords.map(round6),
      steps: built.steps,
      landmarks: built.landmarks,
    };
    if (built.steps.length > 9) note.flags.push(`${built.steps.length} steps; wording may need a human pass`);
  }

  Object.assign(routeFile, {
    from: hotel.id,
    to: { lat: venue.coordinates.lat, lng: venue.coordinates.lng },
    source: "OpenStreetMap: route by OSRM (routing.openstreetmap.de), street names and coordinates by Nominatim",
    computedAt: today,
    reviewed: false,
  });
  await writeJson(`data/routes/${venue.id}.json`, routeFile);
  // keep the minutes shown in the restaurant list in step with the route
  const minutes = routeFile.sameBuilding ? 0 : routeFile.durationMinutes;
  if (venue.walkMinutes !== minutes) { note.walkMinutes = `${venue.walkMinutes} → ${minutes}`; venue.walkMinutes = minutes; venuesChanged = true; }
  note.result = routeFile.sameBuilding ? "inside the hotel" : `${routeFile.distanceMeters} m, ${routeFile.durationMinutes} min, ${routeFile.steps.length} steps (curated estimate: ${venue.walkMinutes ?? "—"} min)`;
  console.log(`✓ ${venue.id}: ${note.result}${note.flags.length ? `  ⚠ ${note.flags.join("; ")}` : ""}`);
}

// Longer walks also get a drive time, so the card can offer both; short walks don't need one.
for (const venue of venuesDoc.venues) {
  if (venue.status === "closed" || venue.walkable !== true || !venue.coordinates) continue;
  if (only && !only.has(venue.id)) continue;
  if (!(venue.walkMinutes > LONG_WALK_MIN)) {
    if (venue.driveMinutes !== undefined) { delete venue.driveMinutes; venuesChanged = true; }
    continue;
  }
  if (!force && venue.driveMinutes != null) continue;
  const dest = [venue.coordinates.lng, venue.coordinates.lat];
  const car = await getJson(`${OSRM_CAR}/${origin[0]},${origin[1]};${dest[0]},${dest[1]}?overview=false`, "osrm");
  if (car.code !== "Ok" || !car.routes?.length) { console.log(`⚠ ${venue.id}: no driving route found (${car.code})`); continue; }
  venue.driveMinutes = Math.max(1, Math.round(car.routes[0].duration / 60));
  venuesChanged = true;
  console.log(`✓ ${venue.id}: longer walk (${venue.walkMinutes} min), ~${venue.driveMinutes} min by car without traffic`);
}

if (venuesChanged) await writeJson("data/venues.json", venuesDoc);
await writeFile(join(root, ".cache", "last-routes-report.json"), JSON.stringify(report, null, 2));
const flagged = report.filter((r) => r.flags.length);
console.log(`\nDone: ${report.length} venue(s) processed, ${flagged.length} need a look.`);
for (const r of flagged) console.log(`  ⚠ ${r.id}: ${r.flags.join("; ")}`);
