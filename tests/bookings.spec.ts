import { expect, test, type Page } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, SUPABASE_KEY, adminToken, api, guestSession, hasAdmin, sampleListing, watchErrors } from "./helpers";

// Upfront payment: the guest books and pays straight away (first month + 8%) by InstaPay. Sakani holds the money,
// refunds within 24 hours on a problem, and pays the host rent − 10% after move-in. The admin account acts as the guest.

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
  const link = page.locator(".property-card:not(:has(.property-demo)) .property-title a", { hasText: "E2E TEST" }).first();
  test.skip(await link.count() === 0, "no test listing published");
  await page.goto((await link.getAttribute("href"))!);
}

async function logIn(page: Page) {
  await page.fill('input[name="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.locator(".auth-submit").click();
}

/** A published test listing by an anonymous host; returns its id, the host session and a cleanup. */
async function hostWithListing(admin: string, title: string, rent: number) {
  const host = await guestSession();
  const created = await api<Array<{ id: string }>>("/rest/v1/properties?select=id", {
    token: host.access_token, method: "POST", body: sampleListing(host.user.id, title, { monthly_price: rent }),
  });
  const listingId = created.data[0].id;
  await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "PATCH", body: { status: "approved" } });
  return { host, listingId };
}

async function cleanup(admin: string, listingId: string) {
  await api(`/rest/v1/listing_requests?listing_id=eq.${listingId}`, { token: admin, method: "DELETE" });
  await api(`/rest/v1/rental_fees?listing_id=eq.${listingId}`, { token: admin, method: "DELETE" });
  await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "DELETE" });
}

test.describe("bookings", () => {
  test.skip(!hasAdmin, "needs admin login");
  let admin = "";
  let adminId = "";
  let savedProfile: { role: string; phone: string } | null = null;
  let guestPhone = "";

  // The admin account books as a guest with a phone number, then gets its profile back.
  test.beforeAll(async () => {
    admin = await adminToken();
    adminId = await adminUserId(admin);
    const current = await api<Array<{ role: string; phone: string }>>(`/rest/v1/profiles?select=role,phone&id=eq.${adminId}`, { token: admin });
    savedProfile = current.data?.[0] ?? null;
    guestPhone = savedProfile?.phone || "01000000009";
    await api(`/rest/v1/profiles?id=eq.${adminId}`, { token: admin, method: "PATCH", body: { role: "guest", phone: guestPhone } });
  });

  test.afterAll(async () => {
    if (savedProfile) await api(`/rest/v1/profiles?id=eq.${adminId}`, { token: admin, method: "PATCH", body: savedProfile });
  });

  test("signed out, Book now asks to log in and comes back to the listing", async ({ page }) => {
    await openTestListing(page);
    expect(await page.content()).not.toContain("01000000000");
    await page.locator("#book .book-login").click();
    await expect(page).toHaveURL(/\/en\/account\?role=guest&next=/);
    await logIn(page);
    await expect(page).toHaveURL(/\/en\/listings\/[^/]+#book$/);
    await expect(page.locator(".book-form")).toBeVisible();
  });

  test("a guest books, pays by InstaPay right away, and sees it in the profile", async ({ page }) => {
    const errors = watchErrors(page);
    await openTestListing(page);
    await page.locator("#book .book-login").click();
    await logIn(page);

    const form = page.locator(".book-form");
    await expect(form).toBeVisible();
    await expect(form.locator(".book-total .is-total")).toContainText("EGP");
    await form.locator('input[name="move_in"]').fill(tomorrow());
    await form.locator('select[name="months"]').selectOption("3");
    await form.locator(".book-submit").click();

    // Pay now: first month + 8%, by InstaPay only.
    const payNow = page.locator(".book-paynow");
    await expect(payNow).toBeVisible();
    await expect(payNow).toContainText("24 hours");
    await payNow.locator(".book-submit").click();
    await expect(page).toHaveURL(/\/en\/pay\//);
    await expect(page.locator(".pay-breakdown")).toBeVisible();
    await expect(page.locator('input[type="radio"][value="vodafone_cash"]')).toHaveCount(0);
    await page.fill("#pay-reference", "IP-E2E-12345");
    await page.fill("#pay-phone", "01112223334");
    await page.locator(".fee-pay button[type=submit]").click();
    await expect(page.locator(".pay-state")).toBeVisible();

    await page.goto("/en/account#bookings");
    const booking = page.locator("#bookings .profile-list > li", { hasText: "E2E TEST" }).first();
    await expect(booking.locator(".status-chip")).toHaveText("Checking your transfer");
    expect(errors).toEqual([]);
  });

  test("full journey: pay, host accepts, team confirms, move in, host is paid rent − 10%", async () => {
    const ready = await api("/rest/v1/rpc/host_bookings", { token: admin, method: "POST", body: {} });
    test.skip(ready.status >= 400, "upfront migration not installed yet");
    const { host, listingId } = await hostWithListing(admin, "Upfront journey", 5000);
    try {
      // Visitors and anonymous sessions can't book; past dates are refused.
      const book = (token: string, moveIn = tomorrow()) => api<{ booking_id: string; pay_token: string; total: number; rent: number; fee: number }>("/rest/v1/rpc/guest_create_booking", {
        token, method: "POST", body: { target_listing: listingId, move_in_date: moveIn, stay_months: 6, people: 1, guest_note: "E2E" },
      });
      expect((await book(SUPABASE_KEY)).status).toBeGreaterThanOrEqual(400);
      expect((await book(host.access_token)).status).toBeGreaterThanOrEqual(400);
      expect((await book(admin, "2020-01-01")).status).toBeGreaterThanOrEqual(400);

      const created = await book(admin);
      expect(created.status).toBe(200);
      expect(created.data).toMatchObject({ rent: 5000, fee: 400, total: 5400 });
      const bookingId = created.data.booking_id;

      // The payment link shows the breakdown; only InstaPay is accepted.
      const shown = await api<Array<{ amount: number; kind: string; rent_amount: number; fee_amount: number }>>("/rest/v1/rpc/fee_by_token", { method: "POST", body: { token: created.data.pay_token } });
      expect(shown.data[0]).toMatchObject({ amount: 5400, kind: "upfront", rent_amount: 5000, fee_amount: 400 });
      expect((await api("/rest/v1/rpc/submit_payment_by_token", { method: "POST", body: { token: created.data.pay_token, pay_method: "vodafone_cash", pay_reference: "VF-1", pay_phone: "01112223334" } })).status).toBeGreaterThanOrEqual(400);
      expect((await api("/rest/v1/rpc/submit_payment_by_token", { method: "POST", body: { token: created.data.pay_token, pay_method: "instapay", pay_reference: "IP-778899", pay_phone: "01112223334" } })).status).toBeLessThan(300);

      const status = async () => (await api<Array<{ status: string; payout_amount: number }>>(`/rest/v1/listing_requests?select=status,payout_amount&id=eq.${bookingId}`, { token: admin })).data[0];
      expect((await status()).status).toBe("payment_review");

      // The host sees the request without the guest's phone, and accepts it.
      const hostView = await api<Array<Record<string, unknown>>>("/rest/v1/rpc/host_bookings", { token: host.access_token, method: "POST", body: {} });
      const row = hostView.data.find((item) => item.id === bookingId)!;
      expect(row).toMatchObject({ payout_amount: 4500, host_fee: 500 });
      expect(JSON.stringify(row)).not.toContain(guestPhone);
      expect((await api("/rest/v1/rpc/host_decide_booking", { token: host.access_token, method: "POST", body: { target_booking: bookingId, accept: true } })).status).toBeLessThan(300);

      // Only the team confirms the payment; then the booking is confirmed and the listing hidden.
      expect((await api("/rest/v1/rpc/admin_confirm_booking_payment", { token: host.access_token, method: "POST", body: { target_booking: bookingId } })).status).toBeGreaterThanOrEqual(400);
      expect((await api("/rest/v1/rpc/admin_confirm_booking_payment", { token: admin, method: "POST", body: { target_booking: bookingId } })).status).toBeLessThan(300);
      expect((await status()).status).toBe("confirmed");
      const listing = await api<Array<{ status: string }>>(`/rest/v1/properties?select=status&id=eq.${listingId}`, { token: admin });
      expect(listing.data[0].status).toBe("paused");

      // The guest moves in; the team pays the host and records the transfer.
      expect((await api("/rest/v1/rpc/admin_mark_payout", { token: admin, method: "POST", body: { target_booking: bookingId, transfer_reference: "IP-OUT-1" } })).status).toBeGreaterThanOrEqual(400);
      expect((await api("/rest/v1/rpc/guest_confirm_move_in", { token: admin, method: "POST", body: { target_booking: bookingId } })).status).toBeLessThan(300);
      expect((await status()).status).toBe("moved_in");
      expect((await api("/rest/v1/rpc/admin_mark_payout", { token: admin, method: "POST", body: { target_booking: bookingId, transfer_reference: "IP-OUT-1" } })).status).toBeLessThan(300);
      expect(await status()).toEqual({ status: "completed", payout_amount: 4500 });
    } finally {
      await cleanup(admin, listingId);
    }
  });

  test("refund: the host declines after payment, the money goes back within 24 hours", async () => {
    const ready = await api("/rest/v1/rpc/host_bookings", { token: admin, method: "POST", body: {} });
    test.skip(ready.status >= 400, "upfront migration not installed yet");
    const { host, listingId } = await hostWithListing(admin, "Upfront refund", 3000);
    try {
      const created = await api<{ booking_id: string; pay_token: string }>("/rest/v1/rpc/guest_create_booking", {
        token: admin, method: "POST", body: { target_listing: listingId, move_in_date: tomorrow(), stay_months: 1, people: 1, guest_note: "" },
      });
      const bookingId = created.data.booking_id;
      await api("/rest/v1/rpc/submit_payment_by_token", { method: "POST", body: { token: created.data.pay_token, pay_method: "instapay", pay_reference: "IP-REF-1", pay_phone: "01112223334" } });
      await api("/rest/v1/rpc/host_decide_booking", { token: host.access_token, method: "POST", body: { target_booking: bookingId, accept: false } });

      const row = (await api<Array<{ status: string; refund_due_at: string }>>(`/rest/v1/listing_requests?select=status,refund_due_at&id=eq.${bookingId}`, { token: admin })).data[0];
      expect(row.status).toBe("refund_pending");
      const hoursLeft = (new Date(row.refund_due_at).getTime() - Date.now()) / 3_600_000;
      expect(hoursLeft).toBeGreaterThan(23);
      expect(hoursLeft).toBeLessThanOrEqual(24);

      expect((await api("/rest/v1/rpc/admin_mark_refunded", { token: admin, method: "POST", body: { target_booking: bookingId, transfer_reference: "x" } })).status).toBeGreaterThanOrEqual(400);
      expect((await api("/rest/v1/rpc/admin_mark_refunded", { token: admin, method: "POST", body: { target_booking: bookingId, transfer_reference: "IP-BACK-1" } })).status).toBeLessThan(300);
      const fee = await api<Array<{ status: string }>>(`/rest/v1/rental_fees?select=status&request_id=eq.${bookingId}`, { token: admin });
      expect(fee.data[0].status).toBe("refunded");
    } finally {
      await cleanup(admin, listingId);
    }
  });

  test("homes are for men or women only; profiles, saved places and chats are private", async () => {
    const owner = await guestSession();
    const mixed = await api("/rest/v1/properties?select=id", { token: owner.access_token, method: "POST", body: sampleListing(owner.user.id, "Mixed", { gender: "mixed" }) });
    expect(mixed.status).toBeGreaterThanOrEqual(400);

    for (const table of ["profiles", "saved_listings", "support_threads", "support_messages"]) {
      const asOther = await api<unknown[]>(`/rest/v1/${table}?select=*&limit=5`, { token: owner.access_token });
      expect(asOther.status >= 400 || (asOther.data as unknown[]).length === 0, table).toBeTruthy();
      const asVisitor = await api<unknown[]>(`/rest/v1/${table}?select=*&limit=5`, { token: SUPABASE_KEY });
      expect(asVisitor.status >= 400 || (asVisitor.data as unknown[]).length === 0, table).toBeTruthy();
    }

    // The public profile never includes phone, email or InstaPay.
    const shown = await api<Array<Record<string, unknown>>>("/rest/v1/rpc/public_profile", { method: "POST", body: { target_user: adminId } });
    expect(shown.status).toBe(200);
    const text = JSON.stringify(shown.data);
    expect(text).not.toMatch(/phone|email|instapay|010\d{8}/i);
  });
});

test("demo listings can be added and removed by admins only, and can't be booked", async () => {
  test.skip(!hasAdmin, "needs admin login");
  const admin = await adminToken();
  const before = await api<unknown[]>("/rest/v1/properties?select=id&is_demo=eq.true&limit=1", { token: admin });
  test.skip(before.status >= 400, "upfront migration not installed yet");
  test.skip((before.data as unknown[]).length > 0, "demo listings are in use; not touching them");

  const owner = await guestSession();
  expect((await api("/rest/v1/rpc/admin_seed_demo", { token: owner.access_token, method: "POST", body: { how_many: 3 } })).status).toBeGreaterThanOrEqual(400);
  const seeded = await api<number>("/rest/v1/rpc/admin_seed_demo", { token: admin, method: "POST", body: { how_many: 5 } });
  expect(seeded.data).toBe(5);
  try {
    const demo = await api<Array<{ id: string; is_demo: boolean; status: string }>>("/rest/v1/properties?select=id,is_demo,status&is_demo=eq.true&limit=1");
    expect(demo.data[0]).toMatchObject({ is_demo: true, status: "approved" });
    const book = await api("/rest/v1/rpc/guest_create_booking", {
      token: admin, method: "POST", body: { target_listing: demo.data[0].id, move_in_date: tomorrow(), stay_months: 1, people: 1, guest_note: "" },
    });
    expect(book.status).toBeGreaterThanOrEqual(400);
  } finally {
    expect((await api("/rest/v1/rpc/admin_clear_demo", { token: owner.access_token, method: "POST", body: {} })).status).toBeGreaterThanOrEqual(400);
    const cleared = await api<number>("/rest/v1/rpc/admin_clear_demo", { token: admin, method: "POST", body: {} });
    expect(cleared.data).toBe(5);
  }
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

