// Smoke tests for the guide's critical paths, at phone and desktop size.
// These protect behavior, not pixels: they check what an associate relies on.

import { test, expect } from "playwright/test";

const HOTEL_ADDRESS = "45 Ivan Allen Jr Blvd NW, Atlanta, GA 30308";

/**
 * Collect console errors and uncaught exceptions.
 * Ignores the browser's automatic /favicon.ico request: the site has no icon yet (tracked separately).
 */
function trackErrors(page) {
  const errors = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (m.location().url?.endsWith("/favicon.ico")) return;
    errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

/** Restaurant rows start collapsed; open them all so tests can reach the links inside. */
async function expandAll(page) {
  await page.locator("#restaurantCards .vrow-btn").first().waitFor();
  await page.evaluate(() => document.querySelectorAll('#restaurantCards .vrow-btn[aria-expanded="false"]').forEach((b) => b.click()));
}

async function openRestaurants(page, type) {
  await page.goto("/");
  await page.getByRole("button", { name: /Restaurants/ }).click();
  await page.locator(`[data-rfilter="${type}"]`).click();
}

test("home loads with hotel name from data and no errors", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await expect(page.locator(".brand small")).toHaveText("JW Marriott Atlanta Downtown");
  await expect(page.locator(".tile")).toHaveCount(6);
  expect(errors).toEqual([]);
});

test("American shows 21 restaurants, closest first", async ({ page }) => {
  await openRestaurants(page, "American");
  await expect(page.locator("#resultCount")).toHaveText("21 restaurants · closest first");
  await expect(page.locator(".vname").first()).toHaveText("Catch 12");
});

test("restaurant types are condensed: one row of types, empty types hidden", async ({ page }) => {
  await page.goto("/#restaurants");
  await expect(page.locator("#occChips .cuisine")).toHaveText(["All79", "Quick bites13", "Brunch9", "Atlanta originals8", "MICHELIN Guide45"]);
  await expect(page.locator("#typeChips .cuisine")).toHaveText([
    "American21", "Southern & BBQ9", "Steak & Seafood5", "Pubs & Sports Bars5", "European & Mediterranean10", "Latin3", "Asian & Sushi18", "Breakfast & Casual8",
  ]);
  await page.locator('[data-rfilter="European & Mediterranean"]').click();
  await expect(page.locator("#resultCount")).toHaveText("10 restaurants · closest first");
  await expect(page.locator('[data-rfilter="European & Mediterranean"]')).toHaveAttribute("aria-pressed", "true");
});

test("price filter: American at $$$$ shows 8", async ({ page }) => {
  await openRestaurants(page, "American");
  await page.selectOption("#price", "$$$$");
  await expect(page.locator("#resultCount")).toHaveText("8 restaurants · closest first");
});

test("price options come from the taxonomy; the old restaurant-type filter is gone", async ({ page }) => {
  await openRestaurants(page, "American");
  await expect(page.locator("#price option")).toHaveCount(5);
  await expect(page.locator("#type")).toHaveCount(0);
});

test("Fine Dining tab: MICHELIN-starred and fine dining, walkable first, then by drive time", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#restaurants");
  await page.getByRole("tab", { name: /Fine Dining/ }).click();
  await expect(page).toHaveURL(/#restaurants\/fine$/);
  await expect(page.getByRole("tab", { name: /Fine Dining/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#resultCount")).toHaveText("21 restaurants · closest first");
  await expect(page.locator("#price")).toBeHidden(); // everything here is $$$$
  const times = await page.locator("#restaurantCards .card-top strong").allInnerTexts();
  const walk = times.filter((t) => /🚶/.test(t)).map((t) => Number(t.match(/\d+/)[0]));
  const drive = times.filter((t) => /🚗/.test(t) && !/🚶/.test(t)).map((t) => Number(t.match(/\d+/)[0])); // longer walks show both
  expect(times.slice(0, walk.length).every((t) => /🚶/.test(t))).toBe(true);
  expect(walk).toEqual([...walk].sort((a, b) => a - b));
  expect(drive).toEqual([...drive].sort((a, b) => a - b));
  await page.locator('[data-rfilter="michelin"]').click();
  await expect(page.locator("#restaurantCards .card")).toHaveCount(9);
  await expect(page.locator("#restaurantCards .badge.michelin")).toHaveCount(9);
  await expect(page.locator(".card", { hasText: "Lazy Betty" })).toContainText("MICHELIN 1 Star 2026");
  await page.locator('[data-rfilter="All"]').click();
  await expandAll(page);
  await expect(page.locator(".card", { hasText: "Miller Union" }).locator(".badge.michelin.listed")).toHaveText("MICHELIN Recommended 2026");
  await expect(page.locator(".card", { hasText: "Lazy Betty" }).getByRole("link", { name: /driving directions/i })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("unknown hours and phone show the placeholder text", async ({ page }) => {
  await openRestaurants(page, "American");
  const card = page.locator(".card", { hasText: "Summerland" }); // no verified hours or phone yet
  await expect(card).toContainText("Check current hours");
  await expect(card).toContainText("Check official site");
});

/** Serve a blank tile instead of contacting tile.openstreetmap.org, so tests never depend on a third-party site. */
const BLANK_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
async function stubTiles(page) {
  await page.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: BLANK_PNG }));
}

test("Walking Map opens live walking directions in Google Maps", async ({ page }) => {
  await openRestaurants(page, "American");
  await expandAll(page);
  const link = page.locator(".card", { hasText: "Catch 12" }).getByRole("link", { name: /Walking Map/ });
  await expect(link).toHaveAttribute("target", "_blank");
  const url = new URL(await link.getAttribute("href"));
  expect(url.hostname).toBe("www.google.com");
  expect(url.searchParams.get("origin")).toBe(HOTEL_ADDRESS);
  expect(url.searchParams.get("destination")).toBe("400 W Peachtree St NW, Atlanta, GA 30308");
  expect(url.searchParams.get("travelmode")).toBe("walking");
});

test("Print directions opens the printable card for that restaurant", async ({ page }) => {
  await stubTiles(page);
  const errors = trackErrors(page);
  await openRestaurants(page, "American");
  await expandAll(page);
  const print = page.locator(".card", { hasText: "Catch 12" }).getByRole("link", { name: /Print directions/ });
  await expect(print).toHaveAttribute("href", "walk.html?id=catch-12");
  await page.goto("/walk.html?id=catch-12");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Catch 12");
  await expect(page.locator("header .addr")).toHaveText("400 W Peachtree St NW, Atlanta, GA 30308");
  await expect(page.locator("ol li").first()).toContainText("Leave the hotel");
  await expect(page.locator("ol li").last()).toContainText("Arrive at Catch 12");
  await expect(page.locator(".map svg .route")).toHaveCount(1);
  await expect(page.locator(".map")).toContainText("© OpenStreetMap contributors");
  await expect(page.locator("footer")).toContainText(HOTEL_ADDRESS);
  const live = new URL(await page.getByRole("link", { name: "Open in Google Maps" }).getAttribute("href"));
  expect(live.searchParams.get("destination")).toBe("400 W Peachtree St NW, Atlanta, GA 30308");
  expect(errors).toEqual([]);
});

test.describe("on an iPhone", () => {
  test.use({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });

  test("Walking Map and the card's live link open Apple Maps", async ({ page }) => {
    await stubTiles(page);
    await openRestaurants(page, "American");
    await expandAll(page);
    const href = await page.locator(".card", { hasText: "Catch 12" }).getByRole("link", { name: /Walking Map/ }).getAttribute("href");
    const url = new URL(href);
    expect(url.hostname).toBe("maps.apple.com");
    expect(url.searchParams.get("saddr")).toBe(HOTEL_ADDRESS);
    expect(url.searchParams.get("daddr")).toBe("400 W Peachtree St NW, Atlanta, GA 30308");
    expect(url.searchParams.get("dirflg")).toBe("w");
    await page.goto("/walk.html?id=catch-12");
    await expect(page.getByRole("link", { name: "Open in Apple Maps" })).toHaveAttribute("href", /^https:\/\/maps\.apple\.com\//);
  });
});

test("walking card prints on one page without the on-screen buttons", async ({ page }) => {
  await stubTiles(page);
  await page.goto("/walk.html?id=twin-smokers-bbq");
  await expect(page.locator(".map svg .route")).toHaveCount(1);
  await page.emulateMedia({ media: "print" });
  await page.setViewportSize({ width: 816, height: 1056 }); // Letter at 96 dpi
  await expect(page.locator(".toolbar")).toBeHidden();
  const fits = await page.evaluate(() => {
    const p = document.querySelector(".page");
    const labels = [...document.querySelectorAll(".map .label")].map((e) => e.getBoundingClientRect());
    let overlaps = 0;
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i], b = labels[j];
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps++;
    }
    return { overflow: p.scrollHeight - p.clientHeight, overlaps };
  });
  expect(fits).toEqual({ overflow: 0, overlaps: 0 });
});

test("restaurant inside the hotel gets a card without a map", async ({ page }) => {
  await page.goto("/walk.html?id=fiora-cucina-italiana");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fiora Cucina Italiana");
  await expect(page.locator("ol")).toContainText("inside the hotel");
  await expect(page.locator(".map")).toHaveCount(0);
});

test("venue without a generated route explains and offers Google Maps", async ({ page }) => {
  await page.goto("/walk.html?id=pittypats-porch");
  await expect(page.getByRole("alert")).toContainText("haven’t been generated yet");
  await expect(page.getByRole("link", { name: "Open in Google Maps" })).toHaveAttribute("href", /destination=25%20Andrew%20Young/);
});

test("a failed data load shows an accessible error, not a blank page", async ({ page }) => {
  await page.route("**/data/venues.json", (route) => route.fulfill({ status: 500, body: "boom" }));
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("could not load its recommendations");
});

test("on a phone, pages fit the screen and the card map is drawn at phone size", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "phone layout only");
  await stubTiles(page);
  const noSideScroll = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.goto("/");
  expect(await noSideScroll()).toBe(0);
  await page.getByRole("button", { name: /Restaurants/ }).click();
  const chipRows = await page.locator("#typeChips .cuisine").evaluateAll((els) => new Set(els.map((e) => e.offsetTop)).size);
  expect(chipRows).toBe(1); // types swipe sideways instead of wrapping
  expect(await noSideScroll()).toBe(0);

  await page.goto("/walk.html?id=der-biergarten");
  await expect(page.locator(".map svg .route")).toHaveCount(1);
  const sizes = await page.evaluate(() => ({
    wrap: document.getElementById("mapWrap").clientWidth,
    map: parseFloat(document.getElementById("map").style.width),
  }));
  expect(Math.abs(sizes.map - sizes.wrap)).toBeLessThanOrEqual(2); // drawn 1:1, not a shrunken desktop map
  expect(await noSideScroll()).toBe(0);
});

test("Closest to the hotel lists every restaurant, nearest first", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Closest to the hotel/ }).click();
  await expect(page.locator("#resultCount")).toHaveText("79 restaurants · closest first");
  await expect(page.locator(".vname").first()).toHaveText("Fiora Cucina Italiana"); // inside the hotel
  const minutes = await page.locator("#restaurantCards .card-top strong").allInnerTexts();
  const nums = minutes.filter((t) => !/🚗/.test(t)).map((t) => (/In the hotel/.test(t) ? 0 : Number(t.match(/\d+/)[0])));
  expect(nums).toEqual([...nums].sort((a, b) => a - b));
});

test("no dead controls: no rating filter, no placeholder Details button, empty sections marked", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".soon")).toHaveCount(0); // every section now has places
  await expect(page.locator(".pill")).toHaveText(["📍 Closest to the hotel", "🕘 Hotel hours"]); // both work
  await openRestaurants(page, "American");
  await expect(page.locator("#rating")).toHaveCount(0);
  await expect(page.locator("#restaurantCards")).not.toContainText("Not loaded");
  await expect(page.getByRole("button", { name: "Details" })).toHaveCount(0);
});

test("a restaurant inside the hotel says so instead of offering walking directions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Closest to the hotel/ }).click();
  await expandAll(page);
  const fiora = page.locator(".card", { hasText: "Fiora Cucina Italiana" });
  await expect(fiora).toContainText("In the hotel");
  await expect(fiora.getByRole("link", { name: /Walking Map/ })).toHaveCount(0);
  await expect(fiora.getByRole("link", { name: /Print directions/ })).toHaveCount(1);
});

test("Attractions lists walkable places with walking map and printable card", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Attractions/ }).click();
  await expect(page.locator('[data-count="attractions"]')).toHaveText("5 places · closest first");
  const aquarium = page.locator('[data-cards="attractions"] .card', { hasText: "Georgia Aquarium" });
  await expect(aquarium).toContainText("🚶");
  await expect(aquarium.getByRole("link", { name: /Print directions/ })).toHaveAttribute("href", "walk.html?id=georgia-aquarium");
  const walk = new URL(await aquarium.getByRole("link", { name: /Walking Map/ }).getAttribute("href"));
  expect(walk.searchParams.get("destination")).toBe("225 Baker St NW, Atlanta, GA 30313");
  expect(walk.searchParams.get("travelmode")).toBe("walking");
});

test("far places offer driving directions instead of a walk", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Shopping/ }).click();
  const lenox = page.locator('[data-cards="shopping"] .card').filter({ has: page.getByRole("heading", { name: "Lenox Square", exact: true }) });
  await expect(lenox).toContainText("🚗");
  await expect(lenox).toContainText("without traffic");
  await expect(lenox.getByRole("link", { name: /Print directions/ })).toHaveCount(0);
  const drive = new URL(await lenox.getByRole("link", { name: /driving directions/i }).getAttribute("href"));
  expect(drive.searchParams.get("travelmode")).toBe("driving");
});

test("section chips filter by type", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Sports & Events/ }).click();
  await page.locator('[data-chips="events"] [data-sub="Stadium"]').click();
  await expect(page.locator('[data-count="events"]')).toHaveText("2 places · closest first");
  await expect(page.locator('[data-cards="events"] .card h3')).toHaveText(["Bobby Dodd Stadium", "Mercedes-Benz Stadium"]);
});

test("the walking card never prints by itself; the Print button does", async ({ page }) => {
  await stubTiles(page);
  await page.addInitScript(() => { window.__prints = 0; window.print = () => { window.__prints++; }; });
  await page.goto("/walk.html?id=catch-12&print=1"); // old links still carry print=1
  await expect(page.locator(".map svg .route")).toHaveCount(1);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__prints)).toBe(0);
  await page.getByRole("button", { name: "Print directions" }).click();
  await expect.poll(() => page.evaluate(() => window.__prints)).toBe(1);
});

test("the phone's Back button steps back through screens instead of leaving the guide", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  const active = () => page.locator(".view.active").getAttribute("id");
  await page.getByRole("button", { name: /Restaurants/ }).click();
  await page.getByRole("tab", { name: /Fine Dining/ }).click();
  await expect(page.locator("#resultCount")).toHaveText("21 restaurants · closest first");
  await page.locator('[data-rfilter="michelin"]').click(); // filters don't add history steps
  await page.goBack(); // to All restaurants
  await expect(page.getByRole("tab", { name: /All restaurants/ })).toHaveAttribute("aria-selected", "true");
  await page.goBack(); // to home
  expect(await active()).toBe("home");
  await page.goForward();
  expect(await active()).toBe("restaurants");
  await page.locator("#homeBtn").click();
  await page.getByRole("button", { name: /Attractions/ }).click();
  expect(await active()).toBe("attractions");
  await page.goBack();
  expect(await active()).toBe("home");
  expect(errors).toEqual([]);
});

test("returning from a walking card lands on the same list, and links to a screen work", async ({ page }) => {
  await stubTiles(page);
  await page.goto("/#restaurants/American"); // a screen can be opened (or refreshed) directly
  await expect(page.locator('[data-rfilter="American"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-venue="catch-12"] .vrow-btn').click();
  await page.locator(".card", { hasText: "Catch 12" }).getByRole("link", { name: /Print directions/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Catch 12");
  await page.goBack();
  await expect(page.locator('[data-rfilter="American"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".card", { hasText: "Catch 12" })).toBeInViewport(); // same spot in the list
});

test("a chosen type is kept when coming back from a walking card", async ({ page }) => {
  await stubTiles(page);
  await page.goto("/#restaurants/fine");
  await page.locator('[data-rfilter="walk"]').click();
  await expect(page).toHaveURL(/#restaurants\/fine\/walk$/);
  await page.locator('[data-venue="polaris"] .vrow-btn').click();
  await page.locator(".card", { hasText: "Polaris" }).getByRole("link", { name: /Print directions/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Polaris");
  await page.goBack();
  await expect(page.locator('[data-rfilter="walk"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#restaurantCards .card")).toHaveCount(5);
});

test("Hotel hours lists every outlet with open/closed status in Atlanta time", async ({ page }) => {
  const errors = trackErrors(page);
  await page.clock.setFixedTime(new Date("2026-11-06T09:00:00-05:00")); // Friday 9:00 AM in Atlanta
  await page.goto("/");
  await page.getByRole("button", { name: /Hotel hours/ }).click();
  await expect(page).toHaveURL(/#hours$/);
  await expect(page.locator(".hours-card h3")).toHaveText([
    "Fiora Restaurant", "Executive Lounge", "JW Market", "The Ledger Bar", "Nest Wellness Spa", "Fitness Center", "In-Room Dining",
  ]);
  const card = (id) => page.locator(`[data-outlet="${id}"]`);
  await expect(card("fiora").locator(".hours-status")).toHaveText("Open now · until 11:00 AM");
  await expect(card("fiora")).toContainText("Mon–Fri");
  await expect(card("fiora")).toContainText("Sat & Sun");
  await expect(card("executive-lounge").locator(".hours-status")).toHaveText("Open now · until 9:30 AM");
  await expect(card("nest-wellness-spa").locator(".hours-status")).toHaveText("Closed · opens 10:00 AM");
  await expect(card("the-ledger")).toContainText("Kitchen closes 1 hour before the bar closes.");
  await expect(card("fitness-center").locator(".hours-status")).toHaveText("Open 24 hours");
  await expect(card("in-room-dining")).toContainText("Dinner · Fri & Sat");
  await expect(page.locator("#hoursSource")).toContainText("Hotel outlet times sheet");
  await page.goBack();
  await expect(page.locator("#home")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Fiora's restaurant card shows the hotel hours", async ({ page }) => {
  await openRestaurants(page, "European & Mediterranean");
  await expect(page.locator(".card", { hasText: "Fiora" })).toContainText("Mon–Fri 7:00 AM – 11:00 AM · Sat & Sun 8:00 AM – 12:00 PM");
});

test("MICHELIN filter on All restaurants lists starred, Bib Gourmand and Recommended places", async ({ page }) => {
  await page.goto("/#restaurants/michelin");
  await expect(page.locator("#resultCount")).toHaveText("45 restaurants · closest first");
  await expect(page.locator(".card", { hasText: "Estrellita" })).toContainText("MICHELIN Bib Gourmand 2026");
  await expect(page.locator(".card", { hasText: "Estrellita" }).locator(".badge.michelin.listed")).toHaveCount(1);
  await expect(page.locator(".card", { hasText: "Atlas" }).locator(".badge.michelin:not(.listed)")).toHaveText("★ MICHELIN 1 Star 2026");
});

test("The Ledger is listed as an in-hotel restaurant with the hotel's hours; unconfirmed places are hidden", async ({ page }) => {
  await page.goto("/#restaurants/Southern & BBQ");
  const ledger = page.locator(".card", { hasText: "The Ledger Bar" });
  await expect(ledger).toContainText("In the hotel");
  await expect(ledger).toContainText("Sun–Thu 12:00 PM – 11:00 PM · Fri & Sat 12:00 PM – 12:00 AM");
  await page.goto("/#restaurants");
  await expect(page.locator(".card", { hasText: "Pittypat's Porch" })).toHaveCount(0);
});

test("verified restaurants show phone and website", async ({ page }) => {
  await page.goto("/#restaurants/Steak & Seafood");
  await expandAll(page);
  const ag = page.locator(".card", { hasText: "AG Modern Bar & Steakhouse" });
  await expect(ag).toContainText("(404) 221-6550");
  await expect(ag.getByRole("link", { name: "Website" })).toHaveAttribute("href", "https://www.ritzcarlton.com/ag");
});

test("walks over 15 minutes are labelled Longer walk and offer both walking and driving", async ({ page }) => {
  await page.goto("/#restaurants/fine");
  await expandAll(page);
  const lyla = page.locator(".card", { hasText: "Lyla Lila" });
  await expect(lyla.locator(".card-top strong")).toHaveText(/🚶 17 min · 🚗 ~\d+/);
  await expect(lyla.locator(".long-walk")).toContainText("Longer walk");
  await expect(lyla.getByRole("link", { name: /Walking Map/ })).toHaveCount(1);
  await expect(lyla.getByRole("link", { name: /Print directions/ })).toHaveCount(1);
  await expect(lyla.getByRole("link", { name: /driving directions/i })).toHaveAttribute("href", /travelmode=driving|dirflg=d/);
  // a short walk has neither the label nor a driving button
  const polaris = page.locator(".card", { hasText: "Polaris" });
  await expect(polaris.locator(".long-walk")).toHaveCount(0);
  await expect(polaris.getByRole("link", { name: /driving directions/i })).toHaveCount(0);
});

test("a restaurant with no published price shows no price instead of a guess", async ({ page }) => {
  await page.goto("/#restaurants/Asian & Sushi");
  const card = page.locator('[data-venue="blossom-tree"]');
  await expect(card).toBeVisible();
  await expect(card.locator(".meta").first()).not.toContainText("$");
});

test("restaurant rows start collapsed and open on tap to show details and actions", async ({ page }) => {
  await page.goto("/#restaurants");
  const row = page.locator('[data-venue="catch-12"]');
  const btn = row.locator(".vrow-btn");
  await expect(btn).toHaveAttribute("aria-expanded", "false");
  await expect(row.getByRole("link", { name: /Walking Map/ })).toHaveCount(0); // hidden until opened
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  await expect(row.locator(".vdetails")).toBeVisible();
  await expect(row.getByRole("link", { name: /Walking Map/ })).toHaveCount(1);
  await btn.press("Enter"); // keyboard closes it again
  await expect(btn).toHaveAttribute("aria-expanded", "false");
});

test("occasion filters: Quick bites, Brunch and Atlanta originals", async ({ page }) => {
  await page.goto("/#restaurants");
  await page.locator('[data-rfilter="quick-bite"]').click();
  await expect(page).toHaveURL(/#restaurants\/quick-bite$/);
  await expect(page.locator("#resultCount")).toHaveText("13 restaurants · closest first");
  await expect(page.locator('[data-venue="freds-meat-and-bread"]')).toBeVisible();
  await page.locator('[data-rfilter="atlanta-original"]').click();
  await expect(page.locator('[data-venue="polaris"]')).toBeVisible();
  await expect(page.locator('[data-venue="freds-meat-and-bread"]')).toHaveCount(0);
});

/** Today's and tomorrow's date at the hotel, as the page computes them. */
function hotelDates() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const t = new Date(`${today}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + 1);
  return { today, tomorrow: t.toISOString().slice(0, 10) };
}
async function stubEvents(page, { ageHours = 1 } = {}) {
  const { today, tomorrow } = hotelDates();
  const doc = {
    source: "Ticketmaster", timeZone: "America/New_York", days: 7,
    generatedAt: new Date(Date.now() - ageHours * 3600e3).toISOString(),
    events: [
      { venueId: "state-farm-arena", name: "Atlanta Hawks vs. Boston Celtics", date: today, time: "19:30", status: "scheduled", url: "https://www.ticketmaster.com/event/1" },
      { venueId: "fox-theatre", name: "Touring Musical", date: tomorrow, time: "20:00", status: "postponed", url: null },
    ],
  };
  await page.route("**/data/events.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(doc) }));
}

test("Today Downtown lists today's events on the home screen and links to the venue", async ({ page }) => {
  const errors = trackErrors(page);
  await stubEvents(page);
  await page.goto("/");
  const box = page.locator("#today");
  await expect(box).toBeVisible();
  await expect(box.locator("li")).toHaveCount(1); // tomorrow's show isn't "today"
  await expect(box).toContainText("7:30 PM");
  await expect(box).toContainText("Atlanta Hawks vs. Boston Celtics");
  await expect(box.getByRole("link", { name: "Atlanta Hawks vs. Boston Celtics" })).toHaveAttribute("href", "https://www.ticketmaster.com/event/1");
  await box.getByRole("button", { name: "State Farm Arena" }).click();
  await expect(page).toHaveURL(/#events$/);
  expect(errors).toEqual([]);
});

test("venue cards show upcoming events and a What's on link", async ({ page }) => {
  await stubEvents(page);
  await page.goto("/#entertainment");
  const fox = page.locator('[data-venue="fox-theatre"]');
  await expect(fox.locator(".ev")).toContainText("Tomorrow · 8:00 PM");
  await expect(fox.locator(".ev")).toContainText("(postponed)");
  await expect(fox.getByRole("link", { name: /What's on at Fox Theatre/ })).toHaveAttribute("href", "https://www.foxtheatre.org/events");
});

test("without a fresh events file nothing event-related is shown, but What's on links remain", async ({ page }) => {
  await stubEvents(page, { ageHours: 48 }); // stale
  await page.goto("/");
  await expect(page.locator("#today")).toBeHidden();
  await page.goto("/#events");
  await expect(page.locator(".ev")).toHaveCount(0);
  await expect(page.locator('[data-venue="state-farm-arena"]').getByRole("link", { name: /What's on/ })).toHaveCount(1);
});
