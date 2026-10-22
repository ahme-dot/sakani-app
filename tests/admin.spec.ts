import { expect, test } from "@playwright/test";
import { designProblems, hasAdmin, signInAsAdmin, watchErrors } from "./helpers";

test.skip(!hasAdmin, "set SAKANI_ADMIN_EMAIL and SAKANI_ADMIN_PASSWORD to run admin tests");

for (const locale of ["ar", "en"] as const) {
  test(`${locale}: every admin section opens without errors`, async ({ page }) => {
    const errors = watchErrors(page);
    await signInAsAdmin(page, locale);
    const nav = page.locator(".admin-nav button");
    const count = await nav.count();
    expect(count).toBeGreaterThanOrEqual(7);
    for (let index = 0; index < count; index += 1) {
      await nav.nth(index).click();
      await expect(page.locator(".spinner")).toHaveCount(0, { timeout: 30_000 });
      expect(await designProblems(page), `section ${index + 1}`).toEqual([]);
    }
    expect(errors).toEqual([]);
  });
}

test("listing tabs show counts and the stale filter", async ({ page }) => {
  await signInAsAdmin(page);
  await expect(page.locator(".admin-stat")).toHaveCount(5);
  await page.locator(".admin-stat-approved").click();
  await expect(page.locator(".admin-stale-toggle")).toBeVisible();
  await expect(page.locator(".admin-card").first()).toBeVisible();
});

test("Add listing: verifying needs the full visit checklist", async ({ page }) => {
  await signInAsAdmin(page);
  await page.locator(".admin-nav button", { hasText: "Add listing" }).click();
  const form = page.locator("#owner-form");
  await expect(form).toBeVisible();
  await form.locator(".form-section-admin .choice").nth(1).click();
  await expect(page.locator(".visit-checklist")).toBeVisible();
  await expect(page.locator(".visit-check input")).toHaveCount(5);
});
