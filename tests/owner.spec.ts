import { expect, test } from "@playwright/test";
import { TEST_TAG, hasAdmin, watchErrors } from "./helpers";

// An owner continues without an account and submits a listing with a photo; it waits for review.
test("guest owner submits a listing for review", async ({ page }) => {
  test.skip(!hasAdmin, "needs admin login so the test listing can be cleaned up");
  const errors = watchErrors(page);
  await page.goto("/en/host");
  await page.locator(".owner-guest-button").click();
  const form = page.locator("#owner-form");
  await expect(form).toBeVisible();

  // The form goes one screen at a time; Next is blocked until the screen is complete.
  const next = () => form.locator(".listing-next").click();
  const photo = await page.screenshot({ type: "jpeg", quality: 70 });
  await expect(form.locator('[data-step="type"] .listing-screen-title')).toHaveText("What kind of place is it?");
  await next();
  await expect(form.locator('[data-step="location"]')).toBeHidden();
  await form.locator('input[name="gender"][value="female"]').check({ force: true });
  await next();

  await form.locator('select[name="governorate"]').selectOption("Giza");
  await form.locator('input[name="area"]').fill("Dokki");
  await form.locator('select[name="university"]').selectOption("Cairo University");
  await next();
  await next(); // beds: 1 of 1
  await form.locator(".tile", { hasText: "Wi-Fi" }).click();
  await next();

  // Photos are required for a new listing.
  await next();
  await expect(page.locator(".owner-feedback-error")).toBeVisible();
  await form.locator('input[name="images"]').setInputFiles({ name: "room.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(form.locator(".listing-photo-grid figure")).toHaveCount(1);
  await next();

  await form.locator('input[name="title"]').fill(`${TEST_TAG} Owner form room`);
  await form.locator('textarea[name="description"]').fill("A quiet furnished room for students, close to transport and shops.");
  await next();
  await form.locator('input[name="monthly_price"]').fill("3000");
  await expect(form.locator(".listing-fee-note")).toBeVisible();
  await next();
  await form.locator('input[name="whatsapp_number"]').fill("01000000000");
  await next();

  // Review shows what was entered, then submit.
  await expect(form.locator(".listing-review")).toContainText("Owner form room");
  await expect(form.locator(".listing-review")).toContainText("Dokki");
  await form.locator('button[type="submit"]').click();

  await expect(page.locator(".owner-feedback-success")).toBeVisible({ timeout: 60_000 });
  const row = page.locator(".owner-listing-row", { hasText: "Owner form room" });
  await expect(row.locator(".listing-status")).toHaveText(/Pending|review/i);
  expect(errors).toEqual([]);
});
