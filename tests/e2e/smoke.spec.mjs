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

async function openRestaurants(page, group) {
  await page.goto("/");
  await page.getByRole("button", { name: /Restaurants/ }).click();
  await page.locator(`[data-region-tile="${group}"]`).click();
}

test("home loads with hotel name from data and no errors", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await expect(page.locator(".brand small")).toHaveText("JW Marriott Atlanta Downtown");
  await expect(page.locator(".region-tile")).toHaveCount(6);
  expect(errors).toEqual([]);
});

test("American shows 17 restaurants, closest first", async ({ page }) => {
  await openRestaurants(page, "American");
  await expect(page.locator("#resultCount")).toHaveText("17 results · closest first");
  await expect(page.locator(".card h3").first()).toHaveText("Catch 12");
});

test("Italian subcategory shows 3", async ({ page }) => {
  await openRestaurants(page, "European");
  await page.locator('[data-cuisine="Italian"]').click();
  await expect(page.locator("#resultCount")).toHaveText("3 results · closest first");
});

test("price filter: American at $$$$ shows 4", async ({ page }) => {
  await openRestaurants(page, "American");
  await page.selectOption("#price", "$$$$");
  await expect(page.locator("#resultCount")).toHaveText("4 results · closest first");
});

test("dining-style filter options come from the taxonomy", async ({ page }) => {
  await openRestaurants(page, "American");
  await expect(page.locator("#type option")).toHaveText(["Any type", "Casual", "Upscale", "Fine Dining"]);
  await expect(page.locator("#price option")).toHaveCount(5);
});

test("unknown hours and phone show the placeholder text", async ({ page }) => {
  await openRestaurants(page, "American");
  const card = page.locator(".card", { hasText: "Catch 12" });
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
  const print = page.locator(".card", { hasText: "Catch 12" }).getByRole("link", { name: /Print directions/ });
  await expect(print).toHaveAttribute("href", "walk.html?id=catch-12&print=1");
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
  const cols = await page.locator("#regionGrid").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  expect(cols).toBe(1);
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
  await expect(page.locator("#restaurantTitle")).toHaveText("Closest to the hotel");
  await expect(page.locator("#resultCount")).toHaveText("23 results · closest first");
  await expect(page.locator(".card h3").first()).toHaveText("Fiora Cucina Italiana"); // inside the hotel
  const minutes = await page.locator(".card-top strong").allInnerTexts();
  const nums = minutes.map((t) => Number(t.match(/\d+/)[0]));
  expect(nums).toEqual([...nums].sort((a, b) => a - b));
  // going into a region afterwards brings the cuisine buttons back
  await page.getByRole("button", { name: /Change region/ }).click();
  await page.locator('[data-region-tile="American"]').click();
  await expect(page.locator(".subcategory-bar")).toBeVisible();
});

test("no dead controls: no rating filter, no placeholder Details button, empty sections marked", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".tile", { hasText: "Attractions" })).toContainText("Coming soon");
  await expect(page.locator(".tile", { hasText: "Restaurants" })).not.toContainText("Coming soon");
  await expect(page.locator(".pill")).toHaveCount(1);
  await openRestaurants(page, "American");
  await expect(page.locator("#rating")).toHaveCount(0);
  await expect(page.locator(".cards")).not.toContainText("Not loaded");
  await expect(page.getByRole("button", { name: "Details" })).toHaveCount(0);
});

test("a restaurant inside the hotel says so instead of offering walking directions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Closest to the hotel/ }).click();
  const fiora = page.locator(".card", { hasText: "Fiora Cucina Italiana" });
  await expect(fiora).toContainText("In the hotel");
  await expect(fiora.getByRole("link", { name: /Walking Map/ })).toHaveCount(0);
  await expect(fiora.getByRole("link", { name: /Print directions/ })).toHaveCount(1);
});
