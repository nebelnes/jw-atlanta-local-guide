# Data model

The guide's content lives in JSON files in `data/`. The pages (`index.html`, `walk.html`) only present them. `npm run validate` checks everything against the schemas in `schema/` and the rules below; it runs without installing anything.

Fields are marked **stable** (rarely changes once correct) or **volatile** (can change without notice and should be re-checked; see `verification.lastVerified`).

## `data/venues.json`

```json
{ "venues": [ { …venue… } ] }
```

### Fields in use today

| Field | Type | Required | Kind | Notes |
|---|---|---|---|---|
| `id` | string | yes | stable | Kebab-case, e.g. `catch-12`. Permanent: never reuse or rename once published, because links and Quick Picks will point at it. |
| `name` | string | yes | stable | |
| `status` | `active` · `temporarily_unavailable` · `closed` | yes | volatile | Only `active` venues are shown. Use `temporarily_unavailable` when a place may be closed but it isn't confirmed (it stays in the data, off the page). |
| `category` | `dining` · `attractions` · `events` · `entertainment` · `shopping` · `outdoors` | yes | stable | The home-screen section the venue appears in. |
| `cuisine` | string | dining | stable | Must be listed under `cuisineGroup` in `data/taxonomy.json`. Required for dining venues only. |
| `cuisineGroup` | string | dining | stable | A group name from `data/taxonomy.json`. Not geography. Required for dining venues only. |
| `priceLevel` | `$`–`$$$$` | dining | volatile | Must exist in `taxonomy.priceLevels`. Required for dining venues only. |
| `diningStyle` | string | no | stable | Must exist in `taxonomy.diningStyles`. `Fine Dining` puts the restaurant on the Fine Dining tab. |
| `michelin` | `{distinction, year}` | no | volatile | MICHELIN Guide distinction (`1 Star`, `2 Stars`, `3 Stars`, `Bib Gourmand`, `Recommended`) and guide year. Shown as a badge (filled for Stars, outlined for Bib Gourmand and Recommended). Starred restaurants always appear on the Fine Dining tab; Bib Gourmand and Recommended places appear there only if their `diningStyle` is `Fine Dining`. Re-check every fall when the guide is announced. |
| `address` | string | yes | stable | Full street address as guests would type it into a map. |
| `phone` | string or `null` | no | volatile | `null` = unknown; the page shows "Check official site". |
| `hours` | string or `null` | no | volatile | `null` = unknown; the page shows "Check current hours". |
| `rating` | number or `null` | no | volatile | Legacy, always `null`. Kept so behavior is unchanged; slated for removal (the guide recommends by judgment, not ratings). |
| `walkMinutes` | integer or `null` | no | stable | Walking minutes from the hotel in `data/hotel.json`. Set by `npm run routes` from the generated route (average pace ≈ 4.5 km/h); `0` for venues inside the hotel. |
| `coordinates` | `{lat, lng}` or `null` | no | stable | Venue pin. Filled in by `npm run routes` from OpenStreetMap. If the address can't be found, add it by hand (see "Routes" below). |
| `summary` | string | no | stable | Short card description: what it is, then who or what occasion it suits. |
| `dressCode` | string or `null` | no | volatile | As the restaurant or OpenTable states it, e.g. "Business casual". Not shown on cards yet. |
| `subcategories` | string list | no | stable | Type labels, e.g. "Museum", "Stadium". Non-dining sections use them as filter chips and the card badge. |
| `website` | URL or `null` | no | stable | Official site, shown as a "Website" link. |
| `bestFor` | string list | no | stable | Occasions or guests it suits, e.g. "families", "rainy day". Shown as "Good for …" on non-dining cards. |
| `walkable` | boolean | no | stable | Set by `npm run routes`. `true`: a walking route and printable card exist. `false`: too far to walk, so `driveMinutes` is set instead. |
| `driveMinutes` | integer or `null` | no | volatile | Set by `npm run routes` for places too far to walk: drive time without traffic, from OpenStreetMap's car routing. The card says "without traffic". |
| `verification.sourceLabel` | string | yes | — | Where the facts came from, e.g. "Discover Atlanta". |
| `verification.sourceUrls` | URL list | yes | — | Links to those sources. Empty today; fill in as records are verified. |
| `verification.lastVerified` | `YYYY-MM-DD` or `null` | yes | — | When volatile facts were last checked. `null` = never. Cannot be in the future. |

### Defined but not yet used

These are in the schema so new content has a home. The page ignores them until features use them.

| Field | Type | Purpose |
|---|---|---|
| `neighborhood` | string or `null` | e.g. "Downtown", "Midtown" (see the geographic tiers in the project brief) |
| `reservations` | `{policy, notes}` | `policy`: `required` · `recommended` · `accepted` · `not_accepted` · `unknown` |
| `atmosphere` | string list | e.g. "quiet", "lively" |
| `dietaryOptions` | string list | e.g. "vegetarian", "gluten-free" |
| `whyWeRecommend` | string or `null` | The concierge reason to choose it. See the content standard in the project brief. |
| `insiderTip` | string or `null` | |
| `caveat` | string or `null` | Honest warning, e.g. "loud on game nights" |

### Rules enforced by `npm run validate`

Besides field types:

- `id` values are unique.
- `cuisineGroup` exists in the taxonomy, and `cuisine` is listed under that group.
- `priceLevel` and `diningStyle` exist in the taxonomy.
- No placeholder text such as "Check current hours" in any field. Use `null` for unknown values; the page supplies the placeholder.
- `verification.lastVerified` is a real date, not in the future.
- URLs are full `http(s)` links.
- Unknown fields are rejected, which catches typos like `sumary`.

## `data/routes/<venue-id>.json`: walking routes

Generated by `npm run routes` (`scripts/build-walking-routes.mjs`) from OpenStreetMap: Nominatim for coordinates and street names, OSRM's foot profile for the path. Shown and printed by `walk.html?id=<venue-id>`. Schema: `schema/route.schema.json`. See [ADR 0002](adr/0002-walking-routes-openstreetmap.md) for why routes come from OpenStreetMap rather than Google.

| Field | Notes |
|---|---|
| `venueId` | Must match the file name and a venue in `data/venues.json` |
| `sameBuilding` | `true` for venues inside the hotel: no map, one step |
| `distanceMeters`, `durationMinutes` | Whole route; minutes at an average walking pace |
| `geometry` | Route path as `[lng, lat]` pairs, from the hotel to the venue's street-front sidewalk |
| `steps[]` | `instruction`, `distanceMeters`, `startMeters` (where it starts along the route; places the numbered marker), `passing[]` (`landmarkId`, `side`) |
| `landmarks[]` | Landmarks the route passes within 40 m of: `landmarkId`, `side`, `atMeters`, `metersFromRoute` |
| `from`, `to` | Hotel id and destination coordinates |
| `source`, `computedAt` | Provenance and date (not in the future) |
| `reviewed` | `false` until someone who knows the walk has checked the steps. Set it to `true` in the PR that confirms it. |

**Walk or drive:** a place gets a walking route if it's within 2.4 km in a straight line *and* the walk takes 30 minutes or less. Otherwise it gets `driveMinutes` and the card offers driving directions instead of a printable walking card. Both limits are constants at the top of `scripts/build-walking-routes.mjs`.

**Adding a venue:** add it to `data/venues.json`, then run `npm run routes`. Only missing routes are computed, at about a minute each because of the services' 1-request-per-second limit. It prints anything that needs a look, for example an address it couldn't find or a route that doesn't end on the venue's street.

**Pins are kept:** once a venue has `coordinates`, re-runs (even `--force`) don't move them. Use `--regeocode` to look every address up again.

**Parks and trails** can use a name instead of a street address (e.g. "Woodruff Park, Atlanta, GA 30303"). Set `coordinates` by hand and the route goes straight to that point.

**Address not found?** Find the entrance on https://www.openstreetmap.org, right-click → "Show address", copy the coordinates into the venue's `coordinates`, then run `npm run routes -- --only <venue-id>`.

**Rewording a step:** steps are regenerated by `npm run routes -- --force`, so a hand edit can be overwritten. Note any correction in the PR. Support for keeping hand-edited wording is a planned follow-up.

## `data/hotel-hours.json`: hotel outlet hours

Shown on the **Hotel hours** screen (`index.html#hours`), each with an "Open now / Closed" status worked out in Atlanta time, whatever time zone the viewer's phone is in. Schema: `schema/hotel-hours.schema.json`. Formatting and status logic: `assets/hotel-hours.js`.

| Field | Notes |
|---|---|
| `timeZone` | `America/New_York` |
| `verification.sourceLabel`, `verification.lastVerified` | Where the hours came from and when they were last checked (shown under the list) |
| `outlets[].id`, `name` | |
| `outlets[].location`, `description` | Optional, e.g. "Lobby Level", "Southern American cuisine" |
| `outlets[].venueId` | Optional link to a venue in `data/venues.json`. That venue's card then shows these hours. |
| `outlets[].open24h` | `true` for 24-hour outlets (then no `periods`) |
| `outlets[].periods[]` | `label` (optional, e.g. "Breakfast"), `days` (`mon`…`sun`), `open` and `close` as 24-hour `HH:MM` |
| `outlets[].notes[]` | Optional short lines, e.g. "Last call 30 minutes before the bar closes." |

**Editing hours:** change the times and update `lastVerified`. A close of `24:00` means midnight. For something open past midnight, end the day at `24:00` and add the early hours to the next day as a separate period. `npm run validate` rejects a period that closes before it opens.

## `data/landmarks.json`

Places a walking card can point out. A landmark is mentioned only when a route passes within 40 m of its outline, so the cards never claim you pass something you don't.

| Field | Notes |
|---|---|
| `id`, `name` | |
| `kind` | `park` (sage accent) or `building` (gold accent) |
| `line` | One short, stable fact shown in the map callout, e.g. "Home of the Atlanta Hawks" |
| `osm` | OpenStreetMap object the outline came from |
| `outline` | Outer boundary as `[lng, lat]` points (© OpenStreetMap contributors) |

## `data/taxonomy.json`

| Field | Notes |
|---|---|
| `cuisineGroups[]` | `{name, description, cuisines[]}`. Each group is one type button on the Restaurants screen (e.g. "Steak & Seafood"); groups with no restaurants are hidden. A cuisine may belong to only one group. |
| `priceLevels[]` | `{value, label}`, e.g. `{"value": "$$", "label": "$$ · $25–$50"}`. Drives the price filter. |
| `diningStyles[]` | Allowed `diningStyle` values. |

## `data/hotel.json`

The property the guide is centered on, and the origin for walking times and routes.

| Field | Notes |
|---|---|
| `id`, `name` | |
| `address.street`, `address.locality`, `address.region`, `address.postalCode` | Shown in the walking panel and used as the Google Maps origin |
| `phone` | |
| `coordinates`, `coordinatesSource` | Origin point for all routes, and where it came from |

## Changing the model

Material schema changes (new required fields, renamed fields, new categories) should update this document and `schema/venue.schema.json` in the same pull request. If the change is a real design decision, add an ADR in `docs/adr/`. The schema checker (`scripts/lib/schema-check.mjs`) supports only the JSON Schema keywords listed at its top. Using another keyword fails loudly, so extend it with a test when needed.
