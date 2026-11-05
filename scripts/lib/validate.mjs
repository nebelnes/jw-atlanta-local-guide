// Content and consistency rules for the guide's data files.
// Pure function: no file or network access, so it is easy to unit-test.

import { checkSchema } from "./schema-check.mjs";

const PLACEHOLDER = /^\s*check\b/i; // e.g. "Check current hours", "Check official site"

/**
 * @param {object} data
 * @param {object} data.venuesDoc  parsed data/venues.json
 * @param {object} data.taxonomy   parsed data/taxonomy.json
 * @param {object} data.hotel      parsed data/hotel.json
 * @param {object} data.schema     parsed schema/venue.schema.json
 * @param {object} [data.landmarksDoc]  parsed data/landmarks.json
 * @param {Record<string, object>} [data.routes]  parsed data/routes/*.json, keyed by file name
 * @param {object} [data.routeSchema]  parsed schema/route.schema.json
 * @param {object} [options]
 * @param {string} [options.today] ISO date used for "not in the future" checks (default: today, UTC)
 * @returns {{file: string, id?: string, field: string, message: string}[]}
 */
export function validateData({ venuesDoc, taxonomy, hotel, schema, landmarksDoc, routes, routeSchema }, { today } = {}) {
  const errors = [];
  const todayIso = today ?? new Date().toISOString().slice(0, 10);

  errors.push(...checkTaxonomy(taxonomy));
  errors.push(...checkHotel(hotel));

  const venues = Array.isArray(venuesDoc?.venues) ? venuesDoc.venues : [];

  // 1. Structure (schema)
  for (const e of checkSchema(venuesDoc, schema)) {
    const m = /^venues\[(\d+)\]\.?(.*)$/.exec(e.path);
    const venue = m ? venues[Number(m[1])] : undefined;
    errors.push({
      file: "data/venues.json",
      id: venue?.id ?? (m ? `#${m[1]}` : undefined),
      field: m ? m[2] || "(record)" : e.path,
      message: e.message,
    });
  }

  // 2. Cross-record and cross-file rules
  const groups = new Map((taxonomy?.cuisineGroups ?? []).map((g) => [g.name, new Set(g.cuisines ?? [])]));
  const prices = new Set((taxonomy?.priceLevels ?? []).map((p) => p.value));
  const styles = new Set(taxonomy?.diningStyles ?? []);
  const seenIds = new Map();

  venues.forEach((v, i) => {
    if (!v || typeof v !== "object") return;
    const id = v.id ?? `#${i}`;
    const add = (field, message) => errors.push({ file: "data/venues.json", id, field, message });

    if (typeof v.id === "string") {
      if (seenIds.has(v.id)) add("id", `duplicate id (also used by record #${seenIds.get(v.id)})`);
      else seenIds.set(v.id, i);
    }

    if (v.category === "dining") {
      for (const field of ["cuisine", "cuisineGroup", "priceLevel"]) {
        if (v[field] === undefined) add(field, "is required for dining venues");
      }
    }
    if (typeof v.cuisineGroup === "string") {
      if (!groups.has(v.cuisineGroup)) {
        add("cuisineGroup", `"${v.cuisineGroup}" is not a cuisine group in data/taxonomy.json`);
      } else if (typeof v.cuisine === "string" && !groups.get(v.cuisineGroup).has(v.cuisine)) {
        add("cuisine", `"${v.cuisine}" is not listed under "${v.cuisineGroup}" in data/taxonomy.json`);
      }
    }
    if (typeof v.priceLevel === "string" && !prices.has(v.priceLevel)) {
      add("priceLevel", `"${v.priceLevel}" is not a price level in data/taxonomy.json`);
    }
    if (typeof v.diningStyle === "string" && !styles.has(v.diningStyle)) {
      add("diningStyle", `"${v.diningStyle}" is not a dining style in data/taxonomy.json`);
    }

    for (const [field, value] of walkStrings(v)) {
      if (PLACEHOLDER.test(value)) {
        add(field, `placeholder text "${value}" — use null for unknown values; the page shows the placeholder`);
      }
    }

    const lastVerified = v.verification?.lastVerified;
    if (typeof lastVerified === "string" && lastVerified > todayIso) {
      add("verification.lastVerified", `${lastVerified} is in the future`);
    }
  });

  const landmarkIds = landmarksDoc ? checkLandmarks(landmarksDoc, errors) : null;
  if (routes) {
    const venueIds = new Set(venues.map((v) => v?.id));
    for (const [file, route] of Object.entries(routes)) {
      errors.push(...checkRoute(file, route, { routeSchema, venueIds, landmarkIds, hotel, todayIso }));
    }
  }
  return errors;
}

function checkLandmarks(doc, errors) {
  const add = (field, message) => errors.push({ file: "data/landmarks.json", field, message });
  const ids = new Set();
  if (!Array.isArray(doc?.landmarks)) { add("landmarks", "must be a list"); return ids; }
  doc.landmarks.forEach((l, i) => {
    const f = `landmarks[${i}]`;
    if (typeof l?.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(l.id)) add(`${f}.id`, "must be a kebab-case id");
    else if (ids.has(l.id)) add(`${f}.id`, `duplicate id "${l.id}"`);
    else ids.add(l.id);
    for (const k of ["name", "line"]) if (typeof l?.[k] !== "string" || !l[k]) add(`${f}.${k}`, "is required");
    if (!["park", "building"].includes(l?.kind)) add(`${f}.kind`, 'must be "park" or "building"');
    const ok = Array.isArray(l?.outline) && l.outline.length >= 3 &&
      l.outline.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
    if (!ok) add(`${f}.outline`, "must be at least 3 [lng, lat] points");
  });
  return ids;
}

function checkRoute(file, route, { routeSchema, venueIds, landmarkIds, hotel, todayIso }) {
  const errors = [];
  const where = `data/routes/${file}`;
  const add = (field, message) => errors.push({ file: where, field, message });
  if (routeSchema) for (const e of checkSchema(route, routeSchema)) add(e.path, e.message);
  if (!route || typeof route !== "object") return errors;
  const expected = file.replace(/\.json$/, "");
  if (route.venueId !== expected) add("venueId", `must match the file name ("${expected}")`);
  else if (!venueIds.has(route.venueId)) add("venueId", `no venue "${route.venueId}" in data/venues.json`);
  if (hotel?.id && route.from !== hotel.id) add("from", `must be the hotel id "${hotel.id}"`);
  if (typeof route.computedAt === "string" && route.computedAt > todayIso) add("computedAt", `${route.computedAt} is in the future`);
  if (Array.isArray(route.geometry)) {
    const bad = route.geometry.findIndex((p) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite));
    if (bad >= 0) add(`geometry[${bad}]`, "must be a [lng, lat] pair");
    if (!route.sameBuilding && route.geometry.length < 2) add("geometry", "needs at least 2 points");
  }
  if (Array.isArray(route.steps) && route.steps.length === 0) add("steps", "must not be empty");
  if (landmarkIds) {
    const refs = [...(route.landmarks ?? []).map((l) => l.landmarkId), ...(route.steps ?? []).flatMap((s) => (s.passing ?? []).map((p) => p.landmarkId))];
    for (const ref of new Set(refs)) if (!landmarkIds.has(ref)) add("landmarks", `unknown landmark "${ref}" (not in data/landmarks.json)`);
  }
  return errors;
}

function* walkStrings(value, path = "") {
  if (typeof value === "string") {
    yield [path, value];
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* walkStrings(value[i], `${path}[${i}]`);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) yield* walkStrings(v, path ? `${path}.${k}` : k);
  }
}

function checkTaxonomy(taxonomy) {
  const errors = [];
  const add = (field, message) => errors.push({ file: "data/taxonomy.json", field, message });
  if (!taxonomy || typeof taxonomy !== "object") {
    add("(file)", "must be a JSON object");
    return errors;
  }

  if (!Array.isArray(taxonomy.cuisineGroups) || taxonomy.cuisineGroups.length === 0) {
    add("cuisineGroups", "must be a non-empty list");
  } else {
    const groupNames = new Set();
    const cuisineOwner = new Map();
    taxonomy.cuisineGroups.forEach((g, i) => {
      const f = `cuisineGroups[${i}]`;
      if (typeof g?.name !== "string" || !g.name) add(`${f}.name`, "is required");
      else if (groupNames.has(g.name)) add(`${f}.name`, `duplicate group "${g.name}"`);
      else groupNames.add(g.name);
      if (typeof g?.description !== "string" || !g.description) add(`${f}.description`, "is required");
      if (!Array.isArray(g?.cuisines) || g.cuisines.length === 0) {
        add(`${f}.cuisines`, "must be a non-empty list");
      } else {
        for (const c of g.cuisines) {
          if (cuisineOwner.has(c)) add(`${f}.cuisines`, `"${c}" is also listed under "${cuisineOwner.get(c)}"`);
          else cuisineOwner.set(c, g.name);
        }
      }
    });
  }

  if (!Array.isArray(taxonomy.priceLevels) || taxonomy.priceLevels.length === 0) {
    add("priceLevels", "must be a non-empty list");
  } else {
    taxonomy.priceLevels.forEach((p, i) => {
      if (typeof p?.value !== "string" || !/^\${1,4}$/.test(p.value)) add(`priceLevels[${i}].value`, "must be $ to $$$$");
      if (typeof p?.label !== "string" || !p.label) add(`priceLevels[${i}].label`, "is required");
    });
  }

  if (!Array.isArray(taxonomy.diningStyles) || taxonomy.diningStyles.length === 0) {
    add("diningStyles", "must be a non-empty list");
  }
  return errors;
}

function checkHotel(hotel) {
  const errors = [];
  const add = (field, message) => errors.push({ file: "data/hotel.json", field, message });
  if (!hotel || typeof hotel !== "object") {
    add("(file)", "must be a JSON object");
    return errors;
  }
  for (const key of ["id", "name"]) {
    if (typeof hotel[key] !== "string" || !hotel[key]) add(key, "is required");
  }
  for (const key of ["street", "locality", "region", "postalCode"]) {
    if (typeof hotel.address?.[key] !== "string" || !hotel.address[key]) add(`address.${key}`, "is required");
  }
  return errors;
}
