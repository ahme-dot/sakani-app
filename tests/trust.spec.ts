import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_TOTP_SECRET, SUPABASE_KEY, adminToken, api, guestSession, hasAdmin, sampleListing } from "./helpers";

// Reviews after a stay, no double bookings, admin roles and error reports.
// The admin account books as a guest (with a phone number), then gets its profile back.

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

test.describe("reviews and availability", () => {
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

  async function listing(title: string, extra: Record<string, unknown> = {}) {
    const host = await guestSession();
    const created = await api<Array<{ id: string }>>("/rest/v1/properties?select=id", {
      token: host.access_token, method: "POST", body: sampleListing(host.user.id, title, extra),
    });
    const id = created.data[0].id;
    await api(`/rest/v1/properties?id=eq.${id}`, { token: admin, method: "PATCH", body: { status: "approved" } });
    return { host, id };
  }

  async function cleanup(listingId: string) {
    await api(`/rest/v1/listing_requests?listing_id=eq.${listingId}`, { token: admin, method: "DELETE" });
    await api(`/rest/v1/rental_fees?listing_id=eq.${listingId}`, { token: admin, method: "DELETE" });
    await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "DELETE" });
  }

  const book = (listingId: string, moveIn: string, months = 3) => api<{ booking_id: string; pay_token: string; message?: string }>("/rest/v1/rpc/guest_create_booking", {
    token: admin, method: "POST", body: { target_listing: listingId, move_in_date: moveIn, stay_months: months, people: 1, guest_note: "E2E" },
  });

  test("a place can't be booked before it's free or twice for the same months", async () => {
    const ready = await api("/rest/v1/rpc/listing_booked_ranges", { method: "POST", body: { target_listing: "00000000-0000-0000-0000-000000000000" } });
    test.skip(ready.status === 404, "reviews migration not installed yet");
    const { id } = await listing("Availability", { property_type: "studio", available_from: day(10) });
    try {
      const early = await book(id, day(3));
      expect(early.status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(early.data)).toContain("not_available_yet");

      const first = await book(id, day(12));
      expect(first.status).toBe(200);
      // Not paid yet: the calendar stays empty (an unpaid hold isn't shown to others).
      expect((await api<unknown[]>("/rest/v1/rpc/listing_booked_ranges", { method: "POST", body: { target_listing: id } })).data).toEqual([]);
      await api("/rest/v1/rpc/submit_payment_by_token", { method: "POST", body: { token: first.data.pay_token, pay_method: "instapay", pay_reference: "IP-AV-1", pay_phone: "01112223334" } });
      const ranges = await api<Array<{ starts: string; ends: string }>>("/rest/v1/rpc/listing_booked_ranges", { method: "POST", body: { target_listing: id } });
      expect(ranges.data).toHaveLength(1);
      expect(ranges.data[0].starts).toBe(day(12));

      // Overlapping months are refused; months after the stay are fine.
      const overlap = await book(id, day(40));
      expect(JSON.stringify(overlap.data)).toContain("dates_taken");
      // Keep under the per-guest request limit: cancel the first, and the dates open again.
      await api(`/rest/v1/listing_requests?id=eq.${first.data.booking_id}`, { token: admin, method: "PATCH", body: { status: "cancelled" } });
      expect((await book(id, day(40))).status).toBe(200);
    } finally {
      await cleanup(id);
    }
  });

  test("only the guest reviews, once, after moving in; admins can hide a review", async () => {
    const ready = await api("/rest/v1/rpc/listing_reviews", { method: "POST", body: { target_listing: "00000000-0000-0000-0000-000000000000" } });
    test.skip(ready.status === 404, "reviews migration not installed yet");
    const { host, id } = await listing("Reviews");
    try {
      const created = await book(id, day(2), 1);
      const bookingId = created.data.booking_id;
      const review = (token: string, stars = 5) => api("/rest/v1/rpc/guest_review_booking", { token, method: "POST", body: { target_booking: bookingId, stars, review_text: "E2E quiet and clean" } });

      expect(JSON.stringify((await review(admin)).data)).toContain("not_moved_in");
      await api("/rest/v1/rpc/submit_payment_by_token", { method: "POST", body: { token: created.data.pay_token, pay_method: "instapay", pay_reference: "IP-RV-1", pay_phone: "01112223334" } });
      await api("/rest/v1/rpc/host_decide_booking", { token: host.access_token, method: "POST", body: { target_booking: bookingId, accept: true } });
      await api("/rest/v1/rpc/admin_confirm_booking_payment", { token: admin, method: "POST", body: { target_booking: bookingId } });
      await api("/rest/v1/rpc/guest_confirm_move_in", { token: admin, method: "POST", body: { target_booking: bookingId } });

      // The host and visitors can't review someone else's stay; 6 stars is refused.
      expect((await review(host.access_token)).status).toBeGreaterThanOrEqual(400);
      expect((await review(SUPABASE_KEY)).status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify((await review(admin, 6)).data)).toContain("bad_rating");
      expect((await review(admin, 4)).status).toBe(200);
      expect(JSON.stringify((await review(admin, 5)).data)).toContain("already_reviewed");

      // Anyone can read it (first name only); the host was told.
      const shown = await api<Array<{ rating: number; body: string }>>("/rest/v1/rpc/listing_reviews", { method: "POST", body: { target_listing: id } });
      expect(shown.data).toEqual([expect.objectContaining({ rating: 4, body: "E2E quiet and clean" })]);
      expect(JSON.stringify(shown.data)).not.toMatch(/guest_id|@/);
      const ratings = await api<Array<{ average: number; reviews: number }>>("/rest/v1/rpc/listing_ratings", { method: "POST", body: { listing_ids: [id] } });
      expect(ratings.data[0]).toMatchObject({ average: 4, reviews: 1 });
      const notices = await api<Array<{ kind: string }>>(`/rest/v1/notifications?select=kind&booking_id=eq.${bookingId}&kind=eq.new_review`, { token: host.access_token });
      expect(notices.data).toHaveLength(1);

      // Hosts can't hide reviews; admins can.
      await api(`/rest/v1/reviews?booking_id=eq.${bookingId}`, { token: host.access_token, method: "PATCH", body: { hidden: true } });
      expect((await api<unknown[]>("/rest/v1/rpc/listing_reviews", { method: "POST", body: { target_listing: id } })).data).toHaveLength(1);
      await api(`/rest/v1/reviews?booking_id=eq.${bookingId}`, { token: admin, method: "PATCH", body: { hidden: true } });
      expect((await api<unknown[]>("/rest/v1/rpc/listing_reviews", { method: "POST", body: { target_listing: id } })).data).toEqual([]);
    } finally {
      await cleanup(id);
    }
  });
});

test("admin roles: the admin has full access and can't change their own role", async () => {
  test.skip(!hasAdmin, "needs admin login");
  const admin = await adminToken();
  const full = await api<boolean>("/rest/v1/rpc/is_full_admin", { token: admin, method: "POST", body: {} });
  test.skip(full.status === 404, "roles migration not installed yet");
  expect(full.data).toBe(true);
  const adminId = (await api<{ id: string }>("/auth/v1/user", { token: admin })).data.id;
  const self = await api("/rest/v1/rpc/admin_team_set_role", { token: admin, method: "POST", body: { target_user_id: adminId, new_role: "reviewer" } });
  expect(JSON.stringify(self.data)).toContain("cannot_change_self");
  // Visitors and ordinary accounts aren't admins of any kind.
  expect((await api<boolean>("/rest/v1/rpc/is_full_admin", { method: "POST", body: {} })).data).toBe(false);
  const team = await api<Array<{ role: string }>>("/rest/v1/rpc/admin_team", { token: admin, method: "POST", body: {} });
  expect(team.data.every((member) => member.role === "full" || member.role === "reviewer")).toBe(true);
});

test("error reports: anyone can send one, only admins read and clear them", async () => {
  test.skip(!hasAdmin, "needs admin login");
  const message = `E2E error ${Date.now()}`;
  const sent = await api("/rest/v1/rpc/report_client_error", { method: "POST", body: { error_page: "/en/test", error_message: message, error_detail: "stack", agent: "playwright" } });
  test.skip(sent.status === 404, "error reports migration not installed yet");
  expect(sent.status).toBeLessThan(300);
  // A repeat within 10 minutes is dropped.
  await api("/rest/v1/rpc/report_client_error", { method: "POST", body: { error_page: "/en/test", error_message: message, error_detail: "stack", agent: "playwright" } });
  const admin = await adminToken();
  const rows = await api<Array<{ id: number }>>(`/rest/v1/client_errors?select=id&message=eq.${encodeURIComponent(message)}`, { token: admin });
  expect(rows.data).toHaveLength(1);
  const visitor = await api<unknown>(`/rest/v1/client_errors?select=id&message=eq.${encodeURIComponent(message)}`);
  expect(visitor.status >= 400 || (Array.isArray(visitor.data) && visitor.data.length === 0)).toBe(true);
  await api(`/rest/v1/client_errors?id=eq.${rows.data[0].id}`, { token: admin, method: "DELETE" });
});

test("two-step sign-in: with the password alone, admin actions are refused", async () => {
  test.skip(!hasAdmin || !ADMIN_TOTP_SECRET, "two-step sign-in isn't set up for the test admin");
  const passwordOnly = await api<{ access_token: string }>("/auth/v1/token?grant_type=password", {
    method: "POST", body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const refused = await api("/rest/v1/rpc/admin_finance_summary", { token: passwordOnly.data.access_token, method: "POST", body: { from_date: "2026-01-01", to_date: "2026-12-31" } });
  expect(refused.status).toBeGreaterThanOrEqual(400);
  const allowed = await api("/rest/v1/rpc/admin_finance_summary", { token: await adminToken(), method: "POST", body: { from_date: "2026-01-01", to_date: "2026-12-31" } });
  expect(allowed.status).toBe(200);
});
