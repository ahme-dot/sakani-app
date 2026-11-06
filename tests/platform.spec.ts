import { expect, test } from "@playwright/test";
import { SUPABASE_KEY, adminToken, api, guestSession, hasAdmin, sampleListing } from "./helpers";

// Phases 3–8: cancellation policy, listing details, notifications, tickets, finance summary, legal pages, sandbox, suspension.

function tomorrow() {
  return new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

test.describe("platform", () => {
  test.skip(!hasAdmin, "needs admin login");
  let admin = "";
  let adminId = "";
  let saved: { role: string; phone: string } | null = null;

  test.beforeAll(async () => {
    admin = await adminToken();
    adminId = (await api<{ id: string }>("/auth/v1/user", { token: admin })).data.id;
    saved = (await api<Array<{ role: string; phone: string }>>(`/rest/v1/profiles?select=role,phone&id=eq.${adminId}`, { token: admin })).data?.[0] ?? null;
    await api(`/rest/v1/profiles?id=eq.${adminId}`, { token: admin, method: "PATCH", body: { role: "guest", phone: saved?.phone || "01000000009" } });
  });

  test.afterAll(async () => {
    if (saved) await api(`/rest/v1/profiles?id=eq.${adminId}`, { token: admin, method: "PATCH", body: saved });
  });

  async function confirmedBooking(rent: number, deposit: number, extra: Record<string, unknown> = {}) {
    const host = await guestSession();
    const created = await api<Array<{ id: string }>>("/rest/v1/properties?select=id", {
      token: host.access_token, method: "POST", body: sampleListing(host.user.id, "Platform", { monthly_price: rent, deposit, ...extra }),
    });
    const listingId = created.data[0].id;
    await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "PATCH", body: { status: "approved" } });
    const booking = (await api<{ booking_id: string; pay_token: string }>("/rest/v1/rpc/guest_create_booking", {
      token: admin, method: "POST", body: { target_listing: listingId, move_in_date: tomorrow(), stay_months: 6, people: 1, guest_note: "" },
    })).data;
    await api("/rest/v1/rpc/host_decide_booking", { token: host.access_token, method: "POST", body: { target_booking: booking.booking_id, accept: true } });
    await api("/rest/v1/rpc/submit_payment_by_token", { method: "POST", body: { token: booking.pay_token, pay_method: "instapay", pay_reference: "IP-PLAT-1", pay_phone: "01112223334" } });
    await api("/rest/v1/rpc/admin_confirm_booking_payment", { token: admin, method: "POST", body: { target_booking: booking.booking_id } });
    return { host, listingId, bookingId: booking.booking_id };
  }

  async function cleanup(listingId: string) {
    await api(`/rest/v1/listing_requests?listing_id=eq.${listingId}`, { token: admin, method: "DELETE" });
    await api(`/rest/v1/rental_fees?listing_id=eq.${listingId}`, { token: admin, method: "DELETE" });
    await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "DELETE" });
  }

  const bookingStatus = async (id: string) => (await api<Array<{ status: string }>>(`/rest/v1/listing_requests?select=status&id=eq.${id}`, { token: admin })).data[0].status;

  test("TEST 9: no refund from a cancellation until the policy is active and the rule is set", async () => {
    const ready = await api("/rest/v1/cancellation_rules?select=scenario&limit=1", { token: admin });
    test.skip(ready.status >= 400, "platform migration not installed yet");
    const settings = (await api<Array<{ cancellation_policy_active: boolean }>>("/rest/v1/app_settings?select=cancellation_policy_active&id=eq.1", { token: admin })).data[0];
    const rule = (await api<Array<Record<string, unknown>>>("/rest/v1/cancellation_rules?select=refund_rent_percent,refund_guest_fee,refund_deposit&scenario=eq.host_cancels", { token: admin })).data[0];
    const booking = await confirmedBooking(10_000, 10_000);
    try {
      expect(await bookingStatus(booking.bookingId)).toBe("confirmed");
      // A stranger can't cancel; the host can.
      const stranger = await guestSession();
      expect((await api("/rest/v1/rpc/request_cancellation", { token: stranger.access_token, method: "POST", body: { target_booking: booking.bookingId, cancel_scenario: "host_cancels", cancel_reason: "Not mine" } })).status).toBeGreaterThanOrEqual(400);
      const request = await api<string>("/rest/v1/rpc/request_cancellation", { token: booking.host.access_token, method: "POST", body: { target_booking: booking.bookingId, cancel_scenario: "host_cancels", cancel_reason: "The flat is no longer free" } });
      expect(request.status).toBeLessThan(300);
      expect(await bookingStatus(booking.bookingId)).toBe("cancellation_requested");

      // Policy off: approving is refused, and nothing is refunded.
      await api("/rest/v1/app_settings?id=eq.1", { token: admin, method: "PATCH", body: { cancellation_policy_active: false } });
      const off = await api("/rest/v1/rpc/admin_decide_cancellation", { token: admin, method: "POST", body: { target_request: request.data, approve: true, chosen_scenario: "host_cancels", note: "" } });
      expect(off.status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(off.data)).toContain("policy_not_active");

      // Policy on but the rule not set: still refused.
      await api("/rest/v1/app_settings?id=eq.1", { token: admin, method: "PATCH", body: { cancellation_policy_active: true } });
      await api("/rest/v1/cancellation_rules?scenario=eq.host_cancels&select=scenario", { token: admin, method: "PATCH", body: { refund_rent_percent: null, refund_guest_fee: null, refund_deposit: null } });
      const unset = await api("/rest/v1/rpc/admin_decide_cancellation", { token: admin, method: "POST", body: { target_request: request.data, approve: true, chosen_scenario: "host_cancels", note: "" } });
      expect(JSON.stringify(unset.data)).toContain("rule_not_set");

      // With a rule (full refund, deposit not yet sent): rent 10,000 + fee 800 + deposit 10,000.
      await api("/rest/v1/cancellation_rules?scenario=eq.host_cancels&select=scenario", { token: admin, method: "PATCH", body: { refund_rent_percent: 100, refund_guest_fee: true, refund_deposit: true } });
      const approved = await api<{ refundable_amount: number }>("/rest/v1/rpc/admin_decide_cancellation", { token: admin, method: "POST", body: { target_request: request.data, approve: true, chosen_scenario: "host_cancels", note: "" } });
      expect(approved.data, JSON.stringify(approved.data)).toMatchObject({ refundable_amount: 20_800 });
      expect(await bookingStatus(booking.bookingId)).toBe("refund_pending");
      await api("/rest/v1/rpc/admin_mark_refunded", { token: admin, method: "POST", body: { target_booking: booking.bookingId, transfer_reference: "IP-BACK-9" } });
      const closed = await api<Array<{ status: string; refund_reference: string }>>(`/rest/v1/cancellation_requests?select=status,refund_reference&id=eq.${request.data}`, { token: admin });
      expect(closed.data[0]).toEqual({ status: "refunded", refund_reference: "IP-BACK-9" });

      // The guest and host were notified.
      const notices = await api<Array<{ kind: string }>>(`/rest/v1/notifications?select=kind&booking_id=eq.${booking.bookingId}`, { token: booking.host.access_token });
      expect(notices.data.map((item) => item.kind)).toEqual(expect.arrayContaining(["booking_new", "booking_confirmed", "cancellation_requested"]));
    } finally {
      await api("/rest/v1/app_settings?id=eq.1", { token: admin, method: "PATCH", body: { cancellation_policy_active: settings.cancellation_policy_active } });
      await api("/rest/v1/cancellation_rules?scenario=eq.host_cancels&select=scenario", { token: admin, method: "PATCH", body: rule });
      await cleanup(booking.listingId);
    }
  });

  test("a stay shorter than the minimum is refused; listing details are public", async () => {
    const ready = await api("/rest/v1/cancellation_rules?select=scenario&limit=1", { token: admin });
    test.skip(ready.status >= 400, "platform migration not installed yet");
    const host = await guestSession();
    const created = await api<Array<{ id: string }>>("/rest/v1/properties?select=id", {
      token: host.access_token, method: "POST", body: sampleListing(host.user.id, "Long stay", { min_months: 6, bedrooms: 2, bathrooms: 1, area_sqm: 90 }),
    });
    const listingId = created.data[0].id;
    try {
      await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "PATCH", body: { status: "approved" } });
      const short = await api("/rest/v1/rpc/guest_create_booking", { token: admin, method: "POST", body: { target_listing: listingId, move_in_date: tomorrow(), stay_months: 3, people: 1, guest_note: "" } });
      expect(JSON.stringify(short.data)).toContain("stay_too_short");
      const visible = await api<Array<{ bedrooms: number; min_months: number }>>(`/rest/v1/properties?select=bedrooms,min_months&id=eq.${listingId}`);
      expect(visible.data[0]).toEqual({ bedrooms: 2, min_months: 6 });
      // The stay filter leaves it out for a 3-month stay and keeps it for 12.
      expect((await api<unknown[]>(`/rest/v1/properties?select=id&id=eq.${listingId}&min_months=lte.3`)).data).toHaveLength(0);
      expect((await api<unknown[]>(`/rest/v1/properties?select=id&id=eq.${listingId}&min_months=lte.12`)).data).toHaveLength(1);

      // Suspended listings disappear from the public feed.
      expect((await api("/rest/v1/rpc/admin_suspend_listing", { token: host.access_token, method: "POST", body: { target_listing: listingId, suspend: true } })).status).toBeGreaterThanOrEqual(400);
      await api("/rest/v1/rpc/admin_suspend_listing", { token: admin, method: "POST", body: { target_listing: listingId, suspend: true } });
      expect((await api<unknown[]>(`/rest/v1/properties?select=id&id=eq.${listingId}&status=eq.approved`)).data).toHaveLength(0);
    } finally {
      await cleanup(listingId);
    }
  });

  test("tickets, finance, legal pages and sandbox are protected", async () => {
    const ready = await api("/rest/v1/cancellation_rules?select=scenario&limit=1", { token: admin });
    test.skip(ready.status >= 400, "platform migration not installed yet");
    const stranger = await guestSession();

    // Tickets: numbered, private to their owner.
    const ticket = await api<{ id: string; number: number }>("/rest/v1/rpc/create_support_ticket", {
      token: admin, method: "POST", body: { ticket_category: "payment", ticket_subject: "[E2E] Transfer question", first_message: "[E2E] When will my transfer be checked?", target_booking: null },
    });
    expect(ticket.data.number).toBeGreaterThan(1000);
    const seen = await api<unknown[]>(`/rest/v1/support_tickets?select=id&id=eq.${ticket.data.id}`, { token: stranger.access_token });
    expect((seen.data as unknown[]).length).toBe(0);
    expect((await api("/rest/v1/rpc/create_support_ticket", { token: stranger.access_token, method: "POST", body: { ticket_category: "other", ticket_subject: "Hello", first_message: "Hi", target_booking: null } })).status).toBeGreaterThanOrEqual(400);
    await api(`/rest/v1/support_messages?ticket_id=eq.${ticket.data.id}`, { token: admin, method: "DELETE" });

    // Finance: admins only; booking value and revenue reported separately.
    expect((await api("/rest/v1/rpc/admin_finance_summary", { token: stranger.access_token, method: "POST", body: { from_date: "2026-01-01", to_date: "2030-01-01" } })).status).toBeGreaterThanOrEqual(400);
    const summary = await api<Record<string, number>>("/rest/v1/rpc/admin_finance_summary", { token: admin, method: "POST", body: { from_date: "2026-01-01", to_date: "2030-01-01" } });
    expect(Object.keys(summary.data)).toEqual(expect.arrayContaining(["booking_value", "platform_commissions", "deposits_held"]));

    // Legal pages: anyone reads, only admins write.
    expect((await api("/rest/v1/legal_pages?select=slug", { token: SUPABASE_KEY })).status).toBeLessThan(300);
    const write = await api("/rest/v1/legal_pages", { token: stranger.access_token, method: "POST", body: { slug: "deposit-policy", locale: "en", title: "Hacked", body: "Hacked page body text" } });
    expect(write.status).toBeGreaterThanOrEqual(400);

    // Sandbox payments are refused unless sandbox mode is on.
    const mode = (await api<Array<{ payment_mode: string }>>("/rest/v1/app_settings?select=payment_mode&id=eq.1", { token: admin })).data[0].payment_mode;
    test.skip(mode === "sandbox", "the site is in sandbox mode");
    const settle = await api("/rest/v1/rpc/sandbox_settle_payment", { method: "POST", body: { token: "00000000-0000-0000-0000-000000000000", succeed: true } });
    expect(JSON.stringify(settle.data)).toContain("sandbox_disabled");

    // Identity documents of others are private.
    const ids = await api<unknown[]>("/rest/v1/identity_verifications?select=id&limit=5", { token: stranger.access_token });
    expect((ids.data as unknown[]).length).toBe(0);
  });
});

test("policy pages and agreements open for everyone", async ({ page }) => {
  for (const path of ["/ar/legal/cancellation-policy", "/en/legal/deposit-policy", "/ar/legal/commission-disclosure"]) {
    await page.goto(path);
    await expect(page.locator(".document h1")).toBeVisible();
  }
});

test("one page lists every policy, and the footer links to it", async ({ page }) => {
  await page.goto("/en");
  await page.locator(".footer-policies a", { hasText: "Policies and terms" }).click();
  await expect(page).toHaveURL(/\/en\/legal$/);
  await expect(page.locator(".legal-hub-grid a")).toHaveCount(10);
  await page.locator(".legal-hub-grid a", { hasText: "Refund policy" }).click();
  await expect(page).toHaveURL(/\/en\/legal\/refund-policy$/);
  await page.goto("/ar/legal");
  await expect(page.locator(".legal-hub-grid a")).toHaveCount(10);
});
