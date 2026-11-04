# ADR 0001: Venue data in static JSON files

- **Status:** Accepted
- **Date:** 2026-11-04
- **Issue:** #1

## Context

All venue content was hard-coded in a JavaScript array inside `index.html`, alongside the cuisine taxonomy and the hotel address (repeated three times). Every content edit was a code edit, nothing checked the data, and the data couldn't be reused by future views (print guide, walking routes, Concierge Mode, QR guest view).

The guide is a curated set of dozens to low hundreds of venues, maintained by a small team through GitHub pull requests and hosted on GitHub Pages.

## Decision

1. Store content as JSON in `data/` (`venues.json`, `taxonomy.json`, `hotel.json`), loaded by the page at runtime with `fetch`.
2. Describe venues with a JSON Schema (`schema/venue.schema.json`) and enforce it plus cross-file rules with `npm run validate`.
3. Keep the stack as is: static HTML, CSS and JavaScript, no framework and no build step.
4. Write the data checker without dependencies (a small JSON Schema subset in `scripts/lib/schema-check.mjs`), so anyone with Node can validate content without installing packages. Playwright is the only dev dependency, used only for browser tests.

## Alternatives considered

- **Keep data in a `.js` file assigned to a global.** Works when opening `index.html` directly from disk, but isn't JSON (harder to validate, reuse or generate), and mixes code with content.
- **A build step that inlines JSON into the page.** Keeps double-click preview working, but adds tooling and a generated artifact for little benefit at this size.
- **A framework (React, Astro, etc.).** Nothing in the product requirements needs one yet. Search, filters, Quick Picks and Concierge Mode are client-side logic over a small dataset.
- **Ajv for schema validation.** The standard choice, but it adds an install step for content editors. Our schemas use a small, stable subset. Revisit if the schema needs keywords the subset lacks.

## Consequences

- Content changes are diffs to JSON files, reviewable in pull requests and checked automatically.
- **Opening `index.html` directly from disk no longer works.** The page shows a clear message instead. Use `npm run serve` or the live site.
- One `venues.json` file is simplest now. If it grows past about 150 venues or edits often conflict, split it into one file per venue with a generated index.
- `data/hotel.json` is the single source for the origin. Walking routes (issue #2) and travel times are computed from it.
