# Data model

The guide's content lives in three JSON files in `data/`. The page (`index.html`) only presents them. `npm run validate` checks all three against `schema/venue.schema.json` and the rules below; it runs without installing anything.

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
| `status` | `active` · `temporarily_unavailable` · `closed` | yes | volatile | Closed venues are hidden from the page. |
| `category` | `dining` | yes | stable | More categories (attractions, events…) will be added. |
| `cuisine` | string | yes | stable | Must be listed under `cuisineGroup` in `data/taxonomy.json`. |
| `cuisineGroup` | string | yes | stable | A group name from `data/taxonomy.json`. Not geography. |
| `priceLevel` | `$`–`$$$$` | yes | volatile | Must exist in `taxonomy.priceLevels`. |
| `diningStyle` | string | no | stable | Must exist in `taxonomy.diningStyles`. |
| `address` | string | yes | stable | Full street address as guests would type it into a map. |
| `phone` | string or `null` | no | volatile | `null` = unknown; the page shows "Check official site". |
| `hours` | string or `null` | no | volatile | `null` = unknown; the page shows "Check current hours". |
| `rating` | number or `null` | no | volatile | Legacy, always `null`. Kept so behavior is unchanged; slated for removal (the guide recommends by judgment, not ratings). |
| `walkMinutes` | integer or `null` | no | stable | Walking minutes from the hotel in `data/hotel.json`. Current values are curated estimates; prebuilt routes (issue #2) will replace them with a sourced value. |
| `summary` | string | no | stable | Short card description. |
| `verification.sourceLabel` | string | yes | — | Where the facts came from, e.g. "Discover Atlanta". |
| `verification.sourceUrls` | URL list | yes | — | Links to those sources. Empty today; fill in as records are verified. |
| `verification.lastVerified` | `YYYY-MM-DD` or `null` | yes | — | When volatile facts were last checked. `null` = never. Cannot be in the future. |

### Defined but not yet used

These are in the schema so new content has a home. The page ignores them until features use them.

| Field | Type | Purpose |
|---|---|---|
| `subcategories` | string list | Finer classification |
| `neighborhood` | string or `null` | e.g. "Downtown", "Midtown" (see the geographic tiers in the project brief) |
| `coordinates` | `{lat, lng}` or `null` | Map placement |
| `website` | URL or `null` | Official site |
| `walkable` | boolean or `null` | Explicit "walk there" recommendation |
| `driveMinutes` | integer or `null` | Drive or rideshare time from the hotel |
| `walkingRoute` | object or `null` | Prebuilt route from the hotel (issue #2): `distanceMeters`, `durationMinutes`, `polyline`, `steps[]` (`instruction`, `distanceMeters`), `source`, `computedAt` |
| `reservations` | `{policy, notes}` | `policy`: `required` · `recommended` · `accepted` · `not_accepted` · `unknown` |
| `dressCode` | string or `null` | |
| `bestFor` | string list | Occasions, e.g. "business dinner", "date night" |
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
- `verification.lastVerified` and `walkingRoute.computedAt` are real dates, not in the future.
- URLs are full `http(s)` links.
- Unknown fields are rejected, which catches typos like `sumary`.

## `data/taxonomy.json`

| Field | Notes |
|---|---|
| `cuisineGroups[]` | `{name, description, cuisines[]}`. Drives the region tiles and subcategory buttons. A cuisine may belong to only one group. |
| `priceLevels[]` | `{value, label}`, e.g. `{"value": "$$", "label": "$$ · $25–$50"}`. Drives the price filter. |
| `diningStyles[]` | Drives the "Restaurant type" filter. |

## `data/hotel.json`

The property the guide is centered on, and the origin for walking times and routes.

| Field | Notes |
|---|---|
| `id`, `name` | |
| `address.street`, `address.locality`, `address.region`, `address.postalCode` | Shown in the walking panel and used as the Google Maps origin |
| `phone` | |

## Changing the model

Material schema changes (new required fields, renamed fields, new categories) should update this document and `schema/venue.schema.json` in the same pull request. If the change is a real design decision, add an ADR in `docs/adr/`. The schema checker (`scripts/lib/schema-check.mjs`) supports only the JSON Schema keywords listed at its top. Using another keyword fails loudly, so extend it with a test when needed.
