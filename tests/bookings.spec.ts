import { expect, test, type Page } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, SUPABASE_KEY, SUPABASE_URL, adminToken, api, guestSession, hasAdmin, sampleListing, watchErrors } from "./helpers";

// Hosts and guests: guests need an account to book, the team confirms, fees are due from both sides.

/** Tomorrow as YYYY-MM-DD (a valid move-in date). */
function tomorrow() {
  return new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function adminUserId(token: string) {
  const { data } = await api<{ id: string }>("/auth/v1/user", { token });
  return data.id;
}

async function openTestListing(page: Page) {
  await page.goto("/en");
  const link = page.locator(".property-title a", { hasText: "E2E TEST" }).first();
  test.skip(await link.count() === 0, "no test listing published");
  await page.goto((await link.getAttribute("href"))!);
}

test.describe("bookings", () => {
  test.skip(!hasAdmin, "needs admin login");

  test("signed out, Book now asks to log in and comes back to the listing", async ({ page }) => {
    await openTestListing(page);
    // The owner's number is never in the page.
    expect(await page.content()).not.toContain("01000000000");
    const login = page.locator("#book .book-login");
    await expect(login).toBeVisible();
    await login.click();
    await expect(page).toHaveURL(/\/en\/account\?role=guest&next=/);

    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.locator(".auth-submit").click();
    await expect(page).toHaveURL(/\/en\/listings\/[^/]+#book$/);
    await expect(page.locator(".book-form")).toBeVisible();
  });

  test("a guest books, sees it in the profile, cancels it, and logs out", async ({ page }) => {
    const errors = watchErrors(page);
    const admin = await adminToken();
    const adminId = await adminUserId(admin);
    const ready = await api("/rest/v1/profiles?select=role&limit=1", { token: admin });
    test.skip(ready.status >= 400, "hosts-and-guests migration not installed yet");
    // Use the admin account as a guest for this test, then put it back.
    await api(`/rest/v1/profiles?id=eq.${adminId}`, { token: admin, method: "PATCH", body: { role: "guest" } });
    try {
      await openTestListing(page);
      await page.locator("#book .book-login").click();
      await page.fill('input[name="email"]', ADMIN_EMAIL);
      await page.fill('input[name="password"]', ADMIN_PASSWORD);
      await page.locator(".auth-submit").click();

      const form = page.locator(".book-form");
      await expect(form).toBeVisible();
      await form.locator('input[name="move_in"]').fill(tomorrow());
      await form.locator('select[name="months"]').selectOption("3");
      await form.locator('input[name="name"]').fill("E2E Guest");
      await form.locator('input[name="contact"]').fill("01112223334");
      await expect(form.locator(".book-total")).toContainText("EGP");
      await form.locator(".book-submit").click();
      await expect(page.locator(".book-sent")).toBeVisible();

      await page.locator(".book-sent a").click();
      await expect(page).toHaveURL(/\/en\/account#bookings$/);
      const booking = page.locator("#bookings .profile-list li", { hasText: "E2E TEST" }).first();
      await expect(booking).toContainText("3 months");
      await expect(booking.locator(".status-chip")).toHaveText("Waiting for reply");
      await booking.locator(".text-button").click();
      await expect(booking.locator(".status-chip")).toHaveText("Cancelled");

      // Log out from the menu: the session ends and the menu offers Log in again.
      await page.locator(".user-menu-button").click();
      await page.locator(".user-menu-logout").click();
      await expect(page).toHaveURL(/\/en$/);
      await page.locator(".user-menu-button").click();
      await expect(page.locator(".user-menu-panel")).toContainText("Log in");
      await expect(page.locator(".user-menu-logout")).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally {
      await api(`/rest/v1/profiles?id=eq.${adminId}`, { token: admin, method: "PATCH", body: { role: "host" } });
    }
  });

  test("visitors cannot book; confirming a booking creates both fees; the guest sees and pays theirs", async () => {
    const admin = await adminToken();
    const adminId = await adminUserId(admin);
    const ready = await api("/rest/v1/profiles?select=role&limit=1", { token: admin });
    test.skip(ready.status >= 400, "hosts-and-guests migration not installed yet");

    const owner = await guestSession();
    const created = await api<Array<{ id: string }>>("/rest/v1/properties?select=id", {
      token: owner.access_token, method: "POST", body: sampleListing(owner.user.id, "Booking flow", { monthly_price: 4000 }),
    });
    const listingId = created.data[0].id;
    try {
      await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "PATCH", body: { status: "approved" } });
      const booking = { listing_id: listingId, listing_title: "[E2E TEST] Booking flow", name: "E2E Guest", contact: "01112223334", move_in: tomorrow(), months: 6, locale: "en" };

      // Signed out, or signed in without an account (anonymous), nobody can book.
      const anonInsert = await fetch(`${SUPABASE_URL}/rest/v1/listing_requests`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(booking),
      });
      expect(anonInsert.status).toBeGreaterThanOrEqual(400);
      const byAnonymous = await api("/rest/v1/listing_requests", { token: owner.access_token, method: "POST", body: booking });
      expect(byAnonymous.status).toBeGreaterThanOrEqual(400);
      // A move-in date in the past is refused.
      const past = await api("/rest/v1/listing_requests?select=id", { token: admin, method: "POST", body: { ...booking, move_in: "2020-01-01" } });
      expect(past.status).toBeGreaterThanOrEqual(400);

      // A real account books (the admin account, acting as a guest).
      const sent = await api<Array<{ id: string }>>("/rest/v1/listing_requests?select=id", { token: admin, method: "POST", body: booking });
      expect(sent.status).toBeLessThan(300);
      const requestId = sent.data[0].id;
      const ownerRead = await api<unknown[]>("/rest/v1/listing_requests?select=id", { token: owner.access_token });
      expect(ownerRead.status >= 400 || (ownerRead.data as unknown[]).length === 0).toBeTruthy();

      // Only admins confirm; confirming creates the host fee and the guest fee.
      const byOwner = await api("/rest/v1/rpc/admin_close_request", { token: owner.access_token, method: "POST", body: { target_request: requestId } });
      expect(byOwner.status).toBeGreaterThanOrEqual(400);
      const closed = await api<{ owner_fee: number; student_fee: number }>("/rest/v1/rpc/admin_close_request", { token: admin, method: "POST", body: { target_request: requestId } });
      expect(closed.status).toBe(200);
      const settings = (await api<Array<Record<string, number>>>("/rest/v1/app_settings?select=fee_percent,fee_minimum,student_fee_percent,student_fee_minimum&id=eq.1")).data[0];
      expect(closed.data.owner_fee).toBe(Math.max(Number(settings.fee_minimum), Math.round((4000 * Number(settings.fee_percent)) / 100)));
      expect(closed.data.student_fee).toBe(Math.max(Number(settings.student_fee_minimum), Math.round((4000 * Number(settings.student_fee_percent)) / 100)));

      const fees = await api<Array<{ payer: string; guest_id: string | null }>>(`/rest/v1/rental_fees?select=payer,guest_id&request_id=eq.${requestId}&order=payer`, { token: admin });
      expect(fees.data.map((fee) => fee.payer)).toEqual(["owner", "student"]);
      expect(fees.data[1].guest_id).toBe(adminId);
      const ownerFees = await api<Array<{ payer: string }>>(`/rest/v1/rental_fees?select=payer&request_id=eq.${requestId}`, { token: owner.access_token });
      expect(ownerFees.data.map((fee) => fee.payer)).toEqual(["owner"]);

      // The guest pays on the site through the fee's private link.
      const guestFee = (await api<Array<{ pay_token: string; amount: number }>>(`/rest/v1/rental_fees?select=pay_token,amount&request_id=eq.${requestId}&payer=eq.student`, { token: admin })).data[0];
      const shown = await api<Array<{ amount: number; status: string; payer: string }>>("/rest/v1/rpc/fee_by_token", { method: "POST", body: { token: guestFee.pay_token } });
      expect(shown.data[0]).toMatchObject({ amount: guestFee.amount, status: "due", payer: "student" });
      expect((await api("/rest/v1/rpc/submit_payment_by_token", { method: "POST", body: { token: guestFee.pay_token, pay_method: "vodafone_cash", pay_reference: "VF-778899", pay_phone: "01112223334" } })).status).toBeLessThan(300);

      // Confirming twice does not create more fees.
      await api("/rest/v1/rpc/admin_close_request", { token: admin, method: "POST", body: { target_request: requestId } });
      expect((await api<unknown[]>(`/rest/v1/rental_fees?select=id&request_id=eq.${requestId}`, { token: admin })).data).toHaveLength(2);
    } finally {
      await api(`/rest/v1/rental_fees?listing_id=eq.${listingId}`, { token: admin, method: "DELETE" });
      await api(`/rest/v1/listing_requests?listing_id=eq.${listingId}`, { token: admin, method: "DELETE" });
      await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "DELETE" });
    }
  });

  test("homes are for men or women only; profiles and saved places are private", async () => {
    const admin = await adminToken();
    const ready = await api("/rest/v1/profiles?select=role&limit=1", { token: admin });
    test.skip(ready.status >= 400, "hosts-and-guests migration not installed yet");

    const owner = await guestSession();
    const mixed = await api("/rest/v1/properties?select=id", { token: owner.access_token, method: "POST", body: sampleListing(owner.user.id, "Mixed", { gender: "mixed" }) });
    expect(mixed.status).toBeGreaterThanOrEqual(400);

    // Another user sees no profiles and no saved places but their own (anonymous users have none).
    const profiles = await api<unknown[]>("/rest/v1/profiles?select=id", { token: owner.access_token });
    expect(profiles.status >= 400 || (profiles.data as unknown[]).length === 0).toBeTruthy();
    const saved = await api<unknown[]>("/rest/v1/saved_listings?select=listing_id", { token: owner.access_token });
    expect(saved.status >= 400 || (saved.data as unknown[]).length === 0).toBeTruthy();
    const visitor = await api<unknown[]>("/rest/v1/profiles?select=id", { token: SUPABASE_KEY });
    expect(visitor.status >= 400 || (visitor.data as unknown[]).length === 0).toBeTruthy();
  });
});

test("owner phone numbers are private", async () => {
  test.skip(!hasAdmin, "needs admin login");
  const admin = await adminToken();
  const hidden = await api("/rest/v1/properties?select=whatsapp_number&limit=1");
  expect(hidden.status).toBeGreaterThanOrEqual(400);

  const owner = await guestSession();
  const stranger = await guestSession();
  const created = await api<Array<{ id: string }>>("/rest/v1/properties?select=id", {
    token: owner.access_token, method: "POST", body: sampleListing(owner.user.id, "Private number", { whatsapp_number: "01099998888" }),
  });
  const listingId = created.data[0].id;
  try {
    const rpc = (token: string) => api<Array<{ whatsapp_number: string }>>("/rest/v1/rpc/listing_private_contacts", { token, method: "POST", body: { listing_ids: [listingId] } });
    expect((await rpc(owner.access_token)).data[0]?.whatsapp_number).toBe("01099998888");
    expect((await rpc(admin)).data[0]?.whatsapp_number).toBe("01099998888");
    expect((await rpc(stranger.access_token)).data).toEqual([]);
    expect((await rpc(SUPABASE_KEY)).status).toBeGreaterThanOrEqual(400);
  } finally {
    await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "DELETE" });
  }
});

test("an invalid payment link shows a clear message", async ({ page }) => {
  await page.goto("/en/pay/not-a-real-link");
  await expect(page.getByRole("alert")).toContainText("payment link");
});
