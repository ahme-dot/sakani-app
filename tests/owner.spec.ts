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

  // Submitting empty is blocked by the form.
  await form.locator('button[type="submit"]').click();
  await expect(page.locator(".owner-feedback-success")).toHaveCount(0);

  // A real image to upload: a screenshot of the page itself.
  const photo = await page.screenshot({ type: "jpeg", quality: 70 });
  await form.locator('input[name="title"]').fill(`${TEST_TAG} Owner form room`);
  await form.locator('textarea[name="description"]').fill("A quiet furnished room for students, close to transport and shops.");
  await form.locator('input[name="gender"][value="female"]').check({ force: true });
  await form.locator('select[name="area"]').selectOption("Dokki");
  await form.locator('select[name="university"]').selectOption("Cairo University");
  await form.locator('input[name="monthly_price"]').fill("3000");
  await form.locator('input[name="images"]').setInputFiles({ name: "room.jpg", mimeType: "image/jpeg", buffer: photo });
  await form.locator('input[name="whatsapp_number"]').fill("01000000000");
  await form.locator('button[type="submit"]').click();

  await expect(page.locator(".owner-feedback-success")).toBeVisible({ timeout: 60_000 });
  const row = page.locator(".owner-listing-row", { hasText: "Owner form room" });
  await expect(row.locator(".listing-status")).toHaveText(/Pending|review/i);
  expect(errors).toEqual([]);
});
