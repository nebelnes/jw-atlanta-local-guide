// Small geometry helpers shared by the route builder (Node) and the card page (browser).
// Coordinates are [lng, lat] arrays, as in GeoJSON. Distances are metres.

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

export function haversine(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Initial compass bearing from a to b, 0–360° (0 = north). */
export function bearing(a, b) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x =
    Math.cos(rad(a[1])) * Math.sin(rad(b[1])) -
    Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
export const compass = (deg) => COMPASS[Math.floor(((deg + 22.5) % 360) / 45)];

/** Signed turn from bearing b1 to b2, -180..180 (positive = right). */
export const turnAngle = (b1, b2) => ((b2 - b1 + 540) % 360) - 180;

/** Cumulative distance along a polyline. */
export function cumulative(coords) {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  return cum;
}

/** Point at `m` metres along a polyline (with its precomputed cumulative distances). */
export function pointAt(coords, cum, m) {
  if (m <= 0) return coords[0];
  for (let i = 1; i < coords.length; i++) {
    if (cum[i] >= m) {
      const t = (m - cum[i - 1]) / Math.max(cum[i] - cum[i - 1], 1e-9);
      const [a, b] = [coords[i - 1], coords[i]];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
  }
  return coords[coords.length - 1];
}

/** Ray-casting point-in-polygon on the outer ring. */
export function inRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    if (y1 > p[1] !== y2 > p[1] && p[0] < ((x2 - x1) * (p[1] - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

/**
 * Closest approach of a polygon ring to a route.
 * @returns {{meters:number, side:"left"|"right", atMeters:number}}
 */
export function closestApproach(ring, coords, cum) {
  const kx = 111320 * Math.cos(rad(coords[0][1]));
  const ky = 110540;
  let best = { meters: Infinity, side: "right", atMeters: 0 };
  for (const q of ring) {
    const px = q[0] * kx;
    const py = q[1] * ky;
    for (let i = 1; i < coords.length; i++) {
      const ax = coords[i - 1][0] * kx, ay = coords[i - 1][1] * ky;
      const bx = coords[i][0] * kx, by = coords[i][1] * ky;
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d < best.meters) {
        best = {
          meters: d,
          side: dx * (py - ay) - dy * (px - ax) > 0 ? "left" : "right",
          atMeters: cum[i - 1] + t * (cum[i] - cum[i - 1]),
        };
      }
    }
  }
  return best;
}

/** Web Mercator world pixel coordinates at zoom z (256 px tiles). */
export function project([lng, lat], z) {
  const n = 256 * 2 ** z;
  const s = Math.sin(rad(lat));
  return [((lng + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}
