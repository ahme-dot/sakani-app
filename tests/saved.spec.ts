import { expect, test } from "@playwright/test";
import { watchErrors } from "./helpers";

// Students save homes with the heart (stored in this browser) and see them under "Saved".
test("save a home, find it under Saved, remove it", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/en");
  const hearts = page.locator(".property-card .save-button");
  test.skip(await hearts.count() === 0, "no published listings");

  await expect(page.locator(".category-saved")).toHaveCount(0);
  const title = (await page.locator(".property-card .property-title").first().textContent())!.trim();
  await hearts.first().click();
  await expect(hearts.first()).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await page.locator(".category-saved").click();
  await expect(page.locator(".property-card .property-title")).toHaveText([title]);

  await page.locator(".property-card .save-button").click();
  await expect(page.locator("#homes .empty-state")).toBeVisible();
  await page.locator("#homes .empty-state button").click();
  await expect(page.locator(".property-card").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("listing page has Save and an approximate Google Maps link", async ({ page }) => {
  await page.goto("/ar");
  const link = page.locator(".property-title a").first();
  test.skip(await link.count() === 0, "no published listings");
  await page.goto((await link.getAttribute("href"))!);
  await page.locator(".save-button-page").click();
  await expect(page.locator(".save-button-page")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".listing2-maps a")).toHaveAttribute("href", /google\.com\/maps\/search/);
});
