import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { designProblems, hasAdmin, signInAsAdmin } from "./helpers";

// Design checks that catch the problems found in the full-site review (2026-11-04) if they come back:
// pages wider than the screen, browser-style dropdowns and date boxes on a computer, unreadable text,
// oversized listing cards, and look changes on the sign-in and account pages.

const SIZES = {
  phone: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1093, height: 520 }, // a 1366×768 laptop at 125% zoom
  desktop: { width: 1440, height: 900 },
};
const PAGES = ["", "/host", "/sign-in", "/account?mode=signup", "/help", "/terms"];
const AXE = readFileSync("node_modules/axe-core/axe.min.js", "utf8");

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

async function contrastProblems(page: Page) {
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => {
    // @ts-expect-error axe is added to the page above
    const result = await window.axe.run(document, { runOnly: ["color-contrast", "scrollable-region-focusable"] });
    return result.violations.flatMap((v: { id: string; nodes: Array<{ target: string[] }> }) => v.nodes.map((n) => `${v.id}: ${n.target.join(" ")}`));
  });
}

for (const [size, viewport] of Object.entries(SIZES)) {
  test.describe(`${size} ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, isMobile: size === "phone" || size === "tablet", hasTouch: size === "phone" || size === "tablet" });
    for (const locale of ["ar", "en"] as const) {
      test(`${locale}: pages fit the screen, controls look like Sakani, text is readable`, async ({ page }) => {
        for (const path of PAGES) {
          await open(page, `/${locale}${path}`);
          expect(await designProblems(page), `${path || "/"}`).toEqual([]);
          if (size === "laptop" || size === "phone") expect(await contrastProblems(page), `${path || "/"}`).toEqual([]);
        }
      });
    }
  });
}

test.describe("on a computer", () => {
  test.use({ viewport: SIZES.laptop });

  test("listing cards: four in a row on a laptop, a whole row fits the screen", async ({ page }) => {
    await open(page, "/en");
    const cards = page.locator(".property-card");
    test.skip(await cards.count() < 4, "fewer than four published listings");
    const boxes = await cards.evaluateAll((items) => items.slice(0, 8).map((item) => item.getBoundingClientRect().toJSON()));
    const firstRow = boxes.filter((box) => Math.abs(box.top - boxes[0].top) < 4);
    expect(firstRow.length).toBe(4);
    expect(boxes[0].height).toBeLessThan(420);
  });

  test("dropdowns open the Sakani list, work by keyboard, and Escape closes only the list", async ({ page }) => {
    await open(page, "/en");
    await page.locator(".filters-button").first().click();
    const dialog = page.getByRole("dialog");
    const select = dialog.locator("select").first();
    await select.click();
    const list = page.locator(".sakani-select-list");
    await expect(list).toBeVisible();
    await expect(list.getByRole("option").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(list).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await select.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(list).toHaveCount(0);
    expect(await select.inputValue()).toBe("1");
    await expect(select).toBeFocused();
  });

  test("phones keep the phone's own picker", async ({ browser }) => {
    const context = await browser.newContext({ viewport: SIZES.phone, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await open(page, "/en");
    await page.locator(".listing-sort select").tap();
    await expect(page.locator(".sakani-select-list")).toHaveCount(0);
    await context.close();
  });

  test("the date is written in words and picked from the Sakani calendar", async ({ page }) => {
    test.skip(!hasAdmin, "needs the admin login");
    await signInAsAdmin(page);
    await page.locator(".admin-nav button", { hasText: "Finance" }).click();
    const display = page.locator(".sakani-date-display").first();
    await expect(display).toBeVisible();
    await expect(display).toHaveValue(/^[A-Z][a-z]+day, \d{1,2} [A-Z][a-z]+ \d{4}$/); // e.g. "Thursday, 26 November 2026"
    const real = page.locator(".sakani-date-native").first();
    const before = await real.inputValue();
    await display.click();
    const calendar = page.locator(".sakani-calendar");
    await expect(calendar).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await expect(calendar).toHaveCount(0);
    const after = await real.inputValue();
    expect(new Date(before).getTime() - new Date(after).getTime()).toBe(86_400_000);
  });
});

// Reference pictures of pages that change rarely. Windows only: fonts render differently on the
// GitHub machine. After an intended design change, refresh them with `npx playwright test design --update-snapshots`.
test.describe("reference pictures", () => {
  test.skip(process.platform !== "win32" || Boolean(process.env.CI), "reference pictures are taken on Windows");
  for (const [size, viewport] of Object.entries({ laptop: SIZES.laptop, phone: SIZES.phone })) {
    for (const locale of ["ar", "en"] as const) {
      for (const [name, path] of [["sign-in", "/sign-in"], ["account", "/account?mode=signup"]]) {
        test(`${name} ${locale} ${size}`, async ({ page }) => {
          await page.setViewportSize(viewport);
          await open(page, `/${locale}${path}`);
          await expect(page).toHaveScreenshot(`${name}-${locale}-${size}.png`, { maxDiffPixelRatio: 0.01, animations: "disabled" });
        });
      }
    }
  }
});
