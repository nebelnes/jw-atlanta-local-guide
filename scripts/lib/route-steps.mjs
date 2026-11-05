// Turn a raw OpenStreetMap walking route into a few guest-friendly steps.
//
// Why this exists: in Downtown Atlanta, OpenStreetMap maps sidewalks as separate,
// unnamed footpaths, so the router's own instructions read like
// "turn left onto unnamed path for 6 m" (29 steps for a 25-minute walk).
// We label each turn-to-turn leg with the street it runs along (from reverse
// geocoding), merge legs that share a label, and phrase the result.
//
// Pure functions only (no network) so this can be unit-tested with fixtures.

import { bearing, compass, turnAngle, cumulative, pointAt, inRing, closestApproach } from "./geo.mjs";

const STREET_TYPES = new Set(["primary", "secondary", "tertiary", "residential", "unclassified", "living_street"]);
const PATH_TYPES = new Set(["footway", "cycleway", "pedestrian", "path", "steps"]);
const STREET_SUFFIX = /\b(Boulevard|Street|Drive|Place|Avenue|Road|Way|Lane|Parkway|Circle|Court|Terrace|Trail)\b/;
const PASS_WITHIN_M = 40; // a landmark counts as "passed" if the route comes this close

const ABBR = [
  [/\bNorthwest\b/g, "NW"], [/\bNortheast\b/g, "NE"], [/\bSouthwest\b/g, "SW"], [/\bSoutheast\b/g, "SE"],
  [/\bJunior\b/g, "Jr"], [/\bBoulevard\b/g, "Blvd"], [/\bStreet\b/g, "St"], [/\bDrive\b/g, "Dr"],
  [/\bPlace\b/g, "Pl"], [/\bAvenue\b/g, "Ave"], [/\bRoad\b/g, "Rd"], [/\bLane\b/g, "Ln"],
];
export const shortStreet = (name) => ABBR.reduce((s, [re, to]) => s.replace(re, to), name);

/** "300 ft" under ~1,000 ft, otherwise "0.3 mi". */
export function distanceText(m) {
  const ft = m * 3.28084;
  return ft < 1000 ? `${Math.max(50, Math.round(ft / 50) * 50)} ft` : `${(m / 1609.34).toFixed(1)} mi`;
}

function nearRing(p, ring, meters) {
  return closestApproach([p], ring, cumulative(ring)).meters <= meters || inRing(p, ring);
}

/** Part of a polyline between two distances along it (with its cumulative distances). */
function sliceLine(geom, cum, from, to) {
  const out = [pointAt(geom, cum, from)];
  for (let i = 0; i < geom.length; i++) if (cum[i] > from && cum[i] < to) out.push(geom[i]);
  out.push(pointAt(geom, cum, to));
  return out;
}

function joinList(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Classify one reverse-geocoded point.
 * @returns {string|null} "street:<name>" | "park:<landmarkId>" | "plaza" | "walkway" | null (crossing / unknown)
 */
export function classify({ road, type, pt, parallel = null }, parks) {
  if (type === "crossing") return null;
  for (const park of parks) {
    if (inRing(pt, park.ring)) return `park:${park.id}`;
    if (road && PATH_TYPES.has(type) && nearRing(pt, park.ring, 30)) return `park:${park.id}`;
  }
  // the nearest street runs across the walk (an intersection, or a plaza beside a road): not the street you're on
  if (parallel === false) return type === "pedestrian" ? "plaza" : "walkway";
  // a pedestrian area (plaza) carrying a street's name is still a plaza, unless it demonstrably runs along that street
  if (type === "pedestrian" && parallel !== true) return "plaza";
  if (road && (STREET_TYPES.has(type) || (PATH_TYPES.has(type) && STREET_SUFFIX.test(road) && type !== "cycleway"))) {
    return `street:${road}`;
  }
  return type === "pedestrian" ? "plaza" : "walkway";
}

/**
 * @param {object} input
 * @param {object} input.route        one OSRM route (geometries=geojson, steps=true)
 * @param {{road:string|null,type:string,parallel?:boolean|null}[]} input.legLookups  reverse-geocode result at the midpoint of each OSRM step (type "crossing" for very short steps); parallel=false when that street crosses the walk
 * @param {{d:number, pt:[number,number], road:string|null, type:string}[]} input.samples  reverse-geocode results every ~40 m along the route
 * @param {{id:string,name:string,kind:string,ring:[number,number][]}[]} input.landmarks
 * @param {string} input.destinationName
 * @param {string} [input.arrivalNote]  extra sentence for the arrival step
 * @param {string} [input.destinationLandmarkId] landmark that *is* the destination (not reported as "passed")
 */
export function buildSteps({ route, legLookups, samples, landmarks, destinationName, arrivalNote, destinationLandmarkId }) {
  const coords = route.geometry.coordinates;
  const cum = cumulative(coords);
  const parks = landmarks.filter((l) => l.kind === "park");
  const parkName = Object.fromEntries(parks.map((p) => [p.id, p.name]));

  // 1. legs = OSRM's turn-to-turn steps, with start/end distance along the route
  const osrmSteps = route.legs[0].steps;
  let pos = 0;
  const legs = osrmSteps.flatMap((s, i) => {
    const leg = { start: pos, end: pos + s.distance, geom: s.geometry.coordinates, arrive: s.maneuver.type === "arrive", names: [] };
    pos += s.distance;
    const inLeg = samples.filter((smp) => smp.d >= leg.start && smp.d < leg.end).map((smp) => ({ ...smp, label: classify(smp, parks) }));

    // a long leg can cover two different things (e.g. across a plaza, then along a street):
    // split it where the samples show a sustained change (two or more samples in a row)
    const runs = [];
    for (const smp of inLeg) {
      if (!smp.label) continue;
      const last = runs[runs.length - 1];
      if (last && last.label === smp.label) last.items.push(smp);
      else runs.push({ label: smp.label, items: [smp] });
    }
    const solid = runs.filter((r) => r.items.length >= 2);
    if (solid.length >= 2 && solid.some((r, k) => k > 0 && r.label !== solid[k - 1].label)) {
      const legCum = cumulative(leg.geom);
      const parts = [];
      let from = leg.start;
      solid.forEach((r, k) => {
        const next = solid[k + 1];
        const to = next ? (r.items[r.items.length - 1].d + next.items[0].d) / 2 : leg.end;
        if (parts.length && parts[parts.length - 1].label === r.label) { parts[parts.length - 1].end = to; }
        else parts.push({ label: r.label, start: from, end: to });
        from = to;
      });
      return parts.map((p) => ({
        start: p.start, end: p.end, arrive: false, label: p.label,
        geom: sliceLine(leg.geom, legCum, p.start - leg.start, p.end - leg.start),
        names: inLeg.filter((smp) => smp.d >= p.start && smp.d < p.end && smp.road && PATH_TYPES.has(smp.type)).map((smp) => smp.road),
      }));
    }

    // otherwise vote: the leg's own midpoint lookup counts 1.5, each 40 m sample inside the leg counts 1
    const votes = new Map();
    const add = (label, w) => label && votes.set(label, (votes.get(label) ?? 0) + w);
    const mid = leg.geom[Math.floor(leg.geom.length / 2)];
    const own = legLookups[i] ?? { road: null, type: "crossing" };
    add(classify({ ...own, pt: mid }, parks), 1.5);
    if (own.road && PATH_TYPES.has(own.type)) leg.names.push(own.road);
    for (const smp of inLeg) {
      add(smp.label, 1);
      if (smp.road && PATH_TYPES.has(smp.type)) leg.names.push(smp.road);
    }
    leg.label = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return [leg];
  });

  // 2. unlabelled (crossings) and very short legs inherit the previous label
  legs.forEach((leg, i) => {
    if (leg.label === null || (i > 0 && leg.end - leg.start < 25)) {
      leg.label = i > 0 ? legs[i - 1].label : legs.find((l) => l.label)?.label ?? "walkway";
    }
  });

  // 3. merge consecutive legs with the same label
  let groups = [];
  for (const leg of legs) {
    if (leg.arrive) continue;
    const g = groups[groups.length - 1];
    if (g && g.label === leg.label) {
      g.end = leg.end; g.geom.push(...leg.geom.slice(1)); g.names.push(...leg.names);
    } else {
      groups.push({ label: leg.label, start: leg.start, end: leg.end, geom: [...leg.geom], names: [...leg.names] });
    }
  }

  // 4. a short group sandwiched between two identical labels is noise (a plaza corner mid-boulevard)
  for (let i = 1; i < groups.length - 1; ) {
    const [a, g, b] = [groups[i - 1], groups[i], groups[i + 1]];
    if (g.end - g.start < 60 && a.label === b.label) {
      a.end = b.end; a.geom.push(...g.geom.slice(1), ...b.geom.slice(1)); a.names.push(...g.names, ...b.names);
      groups.splice(i, 2);
    } else i++;
  }
  // an unnamed walkway that runs straight on into a named street is that street's sidewalk
  const groupBearing = (g) => bearing(g.geom[0], g.geom[g.geom.length - 1]);
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (g.label !== "walkway") continue;
    // only a sidewalk: most of its points must be close to some street (a plaza's middle isn't)
    const pts = samples.filter((smp) => smp.d >= g.start && smp.d < g.end);
    const far = pts.filter((smp) => typeof smp.streetDistance === "number" && smp.streetDistance > 30).length;
    if (pts.length && far * 2 > pts.length) continue;
    for (const j of [i + 1, i - 1]) {
      const n = groups[j];
      if (!n || !n.label.startsWith("street:") || Math.abs(turnAngle(groupBearing(g), groupBearing(n))) >= 25) continue;
      if (j > i) { n.start = g.start; n.geom.unshift(...g.geom.slice(0, -1)); n.names.unshift(...g.names); }
      else { n.end = g.end; n.geom.push(...g.geom.slice(1)); n.names.push(...g.names); }
      groups.splice(i, 1); i--;
      break;
    }
  }
  // merging can leave two neighbouring groups with the same street
  for (let i = 1; i < groups.length; i++) {
    if (groups[i].label === groups[i - 1].label) {
      const [a, b] = [groups[i - 1], groups[i]];
      a.end = b.end; a.geom.push(...b.geom.slice(1)); a.names.push(...b.names); groups.splice(i, 1); i--;
    }
  }
  // a very short first group is usually the hotel's corner (wrong street name); fold it into the next
  if (groups.length > 1 && groups[0].end - groups[0].start < 45) {
    const [first, next] = groups;
    next.start = first.start; next.geom.unshift(...first.geom.slice(0, -1)); next.names.unshift(...first.names);
    groups.shift();
  }
  // a short trailing group before arrival folds into the previous one
  if (groups.length > 1 && groups[groups.length - 1].end - groups[groups.length - 1].start < 30) {
    const last = groups.pop(); const prev = groups[groups.length - 1];
    prev.end = last.end; prev.geom.push(...last.geom.slice(1));
  }

  // 5. landmarks passed
  const passed = [];
  for (const lm of landmarks) {
    if (lm.id === destinationLandmarkId) continue;
    const a = closestApproach(lm.ring, coords, cum);
    if (a.meters <= PASS_WITHIN_M) passed.push({ landmarkId: lm.id, side: a.side, atMeters: Math.round(a.atMeters), metersFromRoute: Math.round(a.meters) });
  }
  passed.sort((x, y) => x.atMeters - y.atMeters);

  // 6. phrase each group
  const steps = groups.map((g, n) => {
    g.bearing = bearing(g.geom[0], g.geom[g.geom.length - 1]);
    const dir = compass(g.bearing);
    const isLast = n === groups.length - 1;
    const toward = isLast ? ` toward ${destinationName}` : "";
    const d = n > 0 ? turnAngle(groups[n - 1].bearing, g.bearing) : 0;
    const tw = n === 0 || Math.abs(d) < 35 ? null : Math.abs(d) < 70 ? (d > 0 ? "Bear right" : "Bear left") : d > 0 ? "Turn right" : "Turn left";
    const [kind, ...rest] = g.label.split(":");
    const name = rest.join(":");
    let text;
    if (n === 0) {
      text = kind === "street" ? `Leave the hotel and head ${dir} on ${shortStreet(name)}.` : `Leave the hotel and head ${dir}.`;
    } else if (kind === "park") {
      const streetsOnRoute = new Set(groups.filter((x) => x.label.startsWith("street:")).map((x) => x.label.slice(7)));
      const paths = [...new Set(g.names)].filter((p) => p !== parkName[name] && !streetsOnRoute.has(p)).slice(0, 3);
      text = `${tw ? `${tw} and enter` : "Enter"} ${parkName[name]}. ` +
        (paths.length ? `Follow ${joinList(paths)} ${dir} through the park.` : `Walk ${dir} through the park.`);
    } else if (kind === "street") {
      text = tw ? `${tw} onto ${shortStreet(name)}, heading ${dir}.` : `Continue ${dir} on ${shortStreet(name)}.`;
    } else {
      const where = kind === "plaza" ? "across the pedestrian plaza" : "along the walkway";
      text = tw ? `${tw} and continue ${dir} ${where}${toward}.` : `Continue ${dir} ${where}${toward}.`;
    }
    const passing = passed
      .filter((p) => p.atMeters >= g.start && p.atMeters < g.end && !(kind === "park" && p.landmarkId === name))
      .map(({ landmarkId, side }) => ({ landmarkId, side }));
    return { instruction: text, distanceMeters: Math.round(g.end - g.start), startMeters: Math.round(g.start), passing };
  });

  steps.push({
    instruction: `Arrive at ${destinationName}.${arrivalNote ? ` ${arrivalNote}` : ""}`,
    distanceMeters: 0,
    startMeters: Math.round(route.distance),
    passing: [],
  });

  return { steps, landmarks: passed };
}
