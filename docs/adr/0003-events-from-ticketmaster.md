# ADR 0003: Upcoming events from Ticketmaster, refreshed by a scheduled job

**Status:** accepted · 2026-11-09

## Context

Associates need to know what is on tonight at Mercedes-Benz Stadium, State Farm Arena, the Fox Theatre and the other event venues, both for guests who want to go and because big events mean traffic, crowds and full restaurants. The site is static (GitHub Pages) with no server of its own.

## Decision

- Use Ticketmaster's free Discovery API. Most of our event venues sell through Ticketmaster or Live Nation. The default quota (5,000 requests a day) is far above our needs (about 12 requests per refresh).
- Fetch from a scheduled GitHub Actions job (`.github/workflows/events.yml`, three times a day), not from the browser. The API key stays a repository secret and never appears in the page.
- The job writes `data/events.json`, checks it with `npm run validate`, and commits it only if it changed. Ticketmaster's terms allow keeping event content "for reasonable periods in order to provide the service"; we keep only the next 7 days and replace it several times a day.
- The page treats events older than 36 hours as unavailable and shows nothing rather than stale information. Every venue also keeps a "What's on" link to its own calendar, which works without the feed.

## Alternatives considered

- **Live calls from the browser:** would expose the key and make every page view depend on Ticketmaster.
- **SeatGeek API:** similar data, but resale-focused; kept as a fallback option.
- **Scraping venue websites:** fragile and against most sites' terms.

## Consequences

- Each refresh that finds changes adds a small commit to `main` and redeploys the site.
- Conventions at the Georgia World Congress Center are not on Ticketmaster and are not covered.
- If the job fails repeatedly, the events simply disappear from the page after 36 hours; the rest of the guide is unaffected.
