# ADR 0002: Prebuilt walking routes from OpenStreetMap

- **Status:** Accepted
- **Date:** 2026-11-05
- **Issue:** #2

## Context

Associates need to hand guests a printed walking route from the hotel, and the guide needs a reliable route on screen. Requirements:

- A real street map with the route, numbered turn-by-turn steps, and landmarks along the way, on one printed page.
- Works even if a map service is slow or down at the moment of printing.
- Generated automatically for every venue as the guide grows.
- No secret keys in a public website.

AI image tools (Copilot, Gemini) produce attractive route infographics, but they paint the map. Street labels are garbled and the route, landmark positions and scale aren't measured. That's unacceptable for directions handed to guests.

## Decision

1. **Compute routes once and store them** in `data/routes/<venue-id>.json`, using OpenStreetMap services:
   - Nominatim for venue coordinates and street names.
   - OSRM's foot profile (routing.openstreetmap.de) for the walking path.
2. **Rewrite the router's output into guest-friendly steps** (`scripts/lib/route-steps.mjs`). Downtown sidewalks are mapped as unnamed paths, so raw output is dozens of "unnamed path" steps. Each leg is labelled with the street it runs along, and legs are merged.
3. **End each route on the sidewalk of the venue's own street**, not at the building's centre point, which can route guests around the back of a block.
4. **Draw the card in the browser** (`walk.html?id=…`) from the stored route, landmark outlines (`data/landmarks.json`) and live OpenStreetMap map tiles, with the credit "© OpenStreetMap contributors".
5. Keep **"Open in Google Maps"** as a plain directions link for live phone navigation.

## Why not Google

The owner has a Google Maps API key, and Google's routes match what guests see in Google Maps. But the Google Maps Platform Service Specific Terms for the Routes API (§19, checked 2026-11-05):

- allow caching only latitude/longitude values, for up to 30 days, and not distances, durations, route lines or steps;
- forbid using Routes API content with a non-Google map.

That rules out storing routes and drawing them on our own map. A live Google map in the page is allowed, but it needs a key exposed in the website, may cost money per view, prints unreliably, and fails if Google is unavailable. Scraping google.com/maps is prohibited. OpenStreetMap data may be stored and republished with attribution (ODbL).

## Consequences

- Cards are reproducible, reviewable in pull requests, and print reliably.
- Routes can differ slightly from Google's. Each route has `reviewed: false` until someone who knows the walk checks it.
- Generating routes needs network access, so `npm run routes` is a manual step, not part of tests or CI. It respects the services' 1-request-per-second limit and caches lookups in `.cache/`. Roughly one minute of unattended time per new venue.
- Map tiles load live from tile.openstreetmap.org when a card is viewed or printed. That's light, attributed use within OpenStreetMap's tile policy. If traffic grows a lot, switch to a commercial tile provider.
- Walking minutes in the guide now come from the routes, at an average pace of about 4.5 km/h, instead of earlier unsourced estimates.
