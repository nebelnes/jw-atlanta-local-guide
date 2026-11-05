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

test("Walking Map opens the printable card for that restaurant", async ({ page }) => {
  await stubTiles(page);
  const errors = trackErrors(page);
  await openRestaurants(page, "American");
  await page.locator(".card", { hasText: "Catch 12" }).getByRole("link", { name: /Walking Map/ }).click();
  await expect(page).toHaveURL(/walk\.html\?id=catch-12$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Catch 12");
  await expect(page.locator("header .addr")).toHaveText("400 W Peachtree St NW, Atlanta, GA 30308");
  await expect(page.locator("ol li").first()).toContainText("Leave the hotel");
  await expect(page.locator("ol li").last()).toContainText("Arrive at Catch 12");
  await expect(page.locator(".map svg .route")).toHaveCount(1);
  await expect(page.locator(".map")).toContainText("© OpenStreetMap contributors");
  await expect(page.locator("footer")).toContainText(HOTEL_ADDRESS);

  const gmaps = new URL(await page.getByRole("link", { name: "Open in Google Maps" }).getAttribute("href"));
  expect(gmaps.searchParams.get("origin")).toBe(HOTEL_ADDRESS);
  expect(gmaps.searchParams.get("destination")).toBe("400 W Peachtree St NW, Atlanta, GA 30308");
  expect(gmaps.searchParams.get("travelmode")).toBe("walking");
  expect(errors).toEqual([]);
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
