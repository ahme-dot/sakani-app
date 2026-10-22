import { expect, test } from "@playwright/test";
import { LOCALES, designProblems, scrollThrough, watchErrors } from "./helpers";

// Every public page, in Arabic and English, on desktop and phone: loads, no errors, no design problems.
const PAGES = ["", "/host", "/help", "/sign-in", "/account", "/privacy", "/terms", "/update-password", "/flyer"];
const VIEWPORTS = {
  desktop: { width: 1366, height: 900 },
  phone: { width: 390, height: 844 },
};

for (const locale of LOCALES) {
  for (const [device, viewport] of Object.entries(VIEWPORTS)) {
    test.describe(`${locale} ${device}`, () => {
      test.use({ viewport, isMobile: device === "phone", hasTouch: device === "phone" });

      for (const path of PAGES) {
        test(`/${locale}${path || ""} loads cleanly`, async ({ page }) => {
          const errors = watchErrors(page);
          const response = await page.goto(`/${locale}${path}`);
          expect(response?.status()).toBeLessThan(400);
          await page.waitForLoadState("networkidle");
          await scrollThrough(page);
          expect(await designProblems(page)).toEqual([]);
          expect(errors).toEqual([]);
        });
      }

      test(`/${locale} listing page loads cleanly`, async ({ page }) => {
        await page.goto(`/${locale}`);
        const link = page.locator(".property-title a").first();
        test.skip(await link.count() === 0, "no published listings");
        const errors = watchErrors(page);
        await page.goto((await link.getAttribute("href"))!);
        await expect(page.locator("h1")).toBeVisible();
        await expect(page.locator(".listing2-whatsapp")).toBeVisible();
        await page.waitForLoadState("networkidle");
        await scrollThrough(page);
        expect(await designProblems(page)).toEqual([]);
        expect(errors).toEqual([]);
      });
    });
  }

  test(`/${locale} unknown page shows the friendly 404`, async ({ page }) => {
    const response = await page.goto(`/${locale}/no-such-page`);
    expect(response?.status()).toBe(404);
    await expect(page.locator(".not-found-panel h1")).toBeVisible();
  });
}

test("web app manifest and icons are served", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  const body = await manifest.json();
  expect(body.icons.length).toBeGreaterThanOrEqual(3);
  for (const size of [192, 512]) {
    const icon = await request.get(`/app-icon/${size}`);
    expect(icon.headers()["content-type"]).toContain("image/png");
  }
});

test("sitemap and robots are served", async ({ request }) => {
  expect((await request.get("/sitemap.xml")).ok()).toBeTruthy();
  expect((await request.get("/robots.txt")).ok()).toBeTruthy();
});
