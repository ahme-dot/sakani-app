import { expect, test } from "@playwright/test";
import { watchErrors } from "./helpers";

// Airbnb-style browsing: categories, Filters window, header search, old links, phone tabs and search sheet.
test("a category filters the homes and is kept in the address", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/en");
  test.skip(await page.locator(".property-card").count() === 0, "no published listings");
  await page.locator(".category-tab", { hasText: "Women only" }).click();
  await expect(page).toHaveURL(/gender=female/);
  await expect(page.locator(".category-tab", { hasText: "Women only" })).toHaveAttribute("aria-pressed", "true");
  for (const meta of await page.locator(".property-card .property-meta").filter({ hasText: "·" }).allTextContents()) {
    expect(meta).toContain("Women");
  }
  await page.locator(".category-tab", { hasText: "All homes" }).click();
  await expect(page).not.toHaveURL(/gender=/);
  expect(errors).toEqual([]);
});

test("Filters window counts matches and applies a price limit", async ({ page }) => {
  await page.goto("/en");
  test.skip(await page.locator(".property-card").count() === 0, "no published listings");
  await page.locator(".filters-button").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Maximum").fill("100000");
  await expect(dialog.locator(".filters-foot .button")).toHaveText(/Show \d+ homes/);
  await dialog.locator(".filters-foot .button").click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/max=100000/);
  await expect(page.locator(".filters-count")).toHaveText("1");

  await page.locator(".filters-button").click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("header search on another page opens the home page with that search", async ({ page }) => {
  await page.goto("/en/help");
  await page.locator(".search-pill select").nth(2).selectOption("female");
  await page.locator(".search-pill-go").click();
  await expect(page).toHaveURL(/\/en\?gender=female/);
  await expect(page.locator(".search-pill .search-seg-value").nth(2)).toHaveText("Women");
});

test("old #owner and #contact links open the new pages", async ({ page }) => {
  await page.goto("/ar#owner");
  await expect(page).toHaveURL(/\/ar\/host$/);
  await page.goto("/en#contact");
  await expect(page).toHaveURL(/\/en\/help#contact$/);
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("bottom tabs and the search sheet work", async ({ page }) => {
    await page.goto("/ar");
    const tabs = page.locator(".bottom-tabs");
    await expect(tabs).toBeVisible();
    await expect(tabs.locator("a.is-active")).toHaveCount(1);

    await page.locator(".search-pill-mobile").click();
    const sheet = page.locator(".search-sheet");
    await expect(sheet).toBeVisible();
    // The Search button must be on top (not hidden behind the tab bar).
    const search = sheet.locator(".search-sheet-foot .button");
    const box = (await search.boundingBox())!;
    const onTop = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest(".search-sheet-foot") !== null, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    expect(onTop).toBe(true);
    await search.click();
    await expect(sheet).toHaveCount(0);

    await tabs.locator("a").nth(2).click();
    await expect(page).toHaveURL(/\/ar\/host$/);
  });

  test("listing page hides the tabs and keeps the contact bar", async ({ page }) => {
    await page.goto("/en");
    const link = page.locator(".property-title a").first();
    test.skip(await link.count() === 0, "no published listings");
    await page.goto((await link.getAttribute("href"))!);
    await expect(page.locator(".bottom-tabs")).toHaveCount(0);
    await expect(page.locator(".listing2-bar")).toBeVisible();
    await expect(page.locator(".photo-mobile")).toBeVisible();
  });
});

test("searching a governorate narrows the universities and is kept in the address", async ({ page }) => {
  await page.goto("/en/help");
  const selects = page.locator(".search-pill select");
  await selects.nth(0).selectOption("Alexandria");
  const universities = await selects.nth(1).locator("option").allTextContents();
  expect(universities).toContain("Alexandria University");
  expect(universities).not.toContain("Cairo University");
  await selects.nth(1).selectOption("Alexandria University");
  await page.locator(".search-pill-go").click();
  await expect(page).toHaveURL(/gov=Alexandria/);
  await expect(page.locator(".search-pill .search-seg-value").first()).toHaveText("Alexandria");
});
