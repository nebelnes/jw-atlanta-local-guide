// Turning Ticketmaster Discovery API responses into data/events.json records.
// Pure functions, so they can be unit-tested without a network or an API key.

/** Pick the Atlanta, GA venue from a /venues.json search response; null if none. */
export function pickVenue(response, search) {
  const venues = response?._embedded?.venues ?? [];
  const inAtlanta = venues.filter((v) => v.city?.name === "Atlanta" && v.state?.stateCode === "GA");
  const exact = inAtlanta.find((v) => v.name?.toLowerCase() === search.toLowerCase());
  return (exact ?? inAtlanta[0])?.id ?? null;
}

/** Events from an /events.json response, for one guide venue. Cancelled events are dropped. */
export function toEvents(response, venueId) {
  const events = response?._embedded?.events ?? [];
  return events
    .filter((e) => e.dates?.start?.localDate && e.dates?.status?.code !== "cancelled")
    .map((e) => ({
      venueId,
      name: e.name,
      date: e.dates.start.localDate, // venue-local date, YYYY-MM-DD
      time: e.dates.start.timeTBA || e.dates.start.noSpecificTime ? null : (e.dates.start.localTime ?? null)?.slice(0, 5) ?? null,
      status: e.dates.status?.code === "postponed" || e.dates.status?.code === "rescheduled" ? e.dates.status.code : "scheduled",
      url: typeof e.url === "string" && /^https?:\/\//.test(e.url) ? e.url : null,
    }));
}

/** Drop listings that aren't events (tours, parking, premium add-ons): names matching any pattern. */
export function excludeEvents(events, patterns = []) {
  const res = patterns.map((p) => new RegExp(p, "i"));
  return events.filter((e) => !res.some((r) => r.test(e.name)));
}

/** Sort by date, then time (all-day/TBA last within a day), then name. */
export function sortEvents(events) {
  return [...events].sort((a, b) =>
    a.date.localeCompare(b.date) || (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || a.name.localeCompare(b.name));
}
