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

test("walking map uses the hotel from data/hotel.json", async ({ page }) => {
  await openRestaurants(page, "American");
  await page.locator(".card", { hasText: "Catch 12" }).getByRole("button", { name: /Walking Map/ }).click();
  const panel = page.locator("#mapPanel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(`From: JW Marriott Atlanta Downtown`);
  await expect(panel).toContainText(HOTEL_ADDRESS);
  await expect(page.locator("#mapEndAddress")).toHaveText("400 W Peachtree St NW, Atlanta, GA 30308");

  const opened = await page.evaluate(() => {
    let url = null;
    window.open = (u) => { url = u; };
    document.getElementById("openGoogleMap").click();
    return url;
  });
  const url = new URL(opened);
  expect(url.searchParams.get("origin")).toBe(HOTEL_ADDRESS);
  expect(url.searchParams.get("destination")).toBe("400 W Peachtree St NW, Atlanta, GA 30308");
  expect(url.searchParams.get("travelmode")).toBe("walking");
});

test("a failed data load shows an accessible error, not a blank page", async ({ page }) => {
  await page.route("**/data/venues.json", (route) => route.fulfill({ status: 500, body: "boom" }));
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("could not load its recommendations");
});
