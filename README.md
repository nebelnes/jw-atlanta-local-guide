# JW Atlanta Local Guide

Curated local recommendations for guests of **JW Marriott Atlanta Downtown**, built to help associates answer "where should we go?" quickly and with real concierge judgment.

**Live site:** https://nebelnes.github.io/jw-atlanta-local-guide/ (works on phones, tablets and desktops)

## How it is built

A static website: plain HTML, CSS and JavaScript, hosted free on GitHub Pages, with no build step.

| Path | What it holds |
|---|---|
| `index.html` | The page: layout, styling and behavior |
| `data/venues.json` | Venue recommendations: 23 restaurants plus attractions, sports & events, entertainment, shopping, and parks & outdoors |
| `data/taxonomy.json` | Cuisine groups, price levels and dining styles used by filters |
| `data/hotel.json` | The hotel the guide is centered on (origin for walking routes) |
| `data/routes/` | One generated walking route per venue (from OpenStreetMap) |
| `data/landmarks.json` | Landmarks the walking cards can point out |
| `walk.html` | Printable walking card, e.g. `walk.html?id=catch-12` |
| `schema/venue.schema.json` | The rules every venue record must follow |
| `scripts/` | Data checker and a local preview server |
| `tests/` | Unit tests and browser smoke tests |
| `docs/` | Data model and decisions |

To change what the guide recommends, edit the files in `data/`. You don't need to touch `index.html`. See [docs/DATA_MODEL.md](docs/DATA_MODEL.md) for every field.

## Working on it locally

Requires [Node.js](https://nodejs.org/) 22 or newer.

```sh
npm run validate   # check the data files (no install needed)
npm test           # unit tests (no install needed)
npm run serve      # preview at http://127.0.0.1:8080
```

The page loads its data with `fetch`, so it must be opened through a web server (`npm run serve`, or the live site). Opening `index.html` by double-clicking shows a "could not load" message.

Browser smoke tests use Playwright and the installed Google Chrome:

```sh
npm install        # once, installs Playwright
npm run test:e2e
```

Walking routes are generated from OpenStreetMap and stored in `data/routes/`. After adding venues:

```sh
npm run routes     # needs internet; computes missing routes (~1 minute each)
```

## Decisions

- [ADR 0001: Venue data in static JSON files](docs/adr/0001-static-json-data.md)
- [ADR 0002: Prebuilt walking routes from OpenStreetMap](docs/adr/0002-walking-routes-openstreetmap.md)

Map data © OpenStreetMap contributors.
