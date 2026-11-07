import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, TEST_TAG, adminToken, api, guestSession, hasAdmin, sampleListing, startsToday, testHost, testHostListing } from "./helpers";

// Migration 20261111000000: paying the host doesn't end a stay, who counts as living somewhere, hosts need an
// account, refunds that aren't the guest's fault, a host's "no" on an unverified transfer, and rented pages.

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const REFERENCE = { pay_method: "instapay", pay_phone: "01112223334" };

test.describe("launch fixes", () => {
  test.skip(!hasAdmin, "needs admin login");
  let admin = "";
  let adminId = "";
  let saved: { role: string; phone: string } | null = null;

  // The admin account books as a guest, then gets its profile back.
  test.beforeAll(async () => {
    admin = await adminToken();
    adminId = (await api<{ id: string }>("/auth/v1/user", { token: admin })).data.id;
    saved = (await api<Array<{ role: string; phone: string }>>(`/rest/v1/profiles?select=role,phone&id=eq.${adminId}`, { token: admin })).data?.[0] ?? null;
    await api(`/rest/v1/profiles?id=eq.${adminId}`, { token: admin, method: "PATCH", body: { role: "guest", phone: saved?.phone || "01000000009" } });
  });

  test.afterAll(async () => {
    if (saved) await api(`/rest/v1/profiles?id=eq.${adminId}`, { token: admin, method: "PATCH", body: saved });
  });

  const rpc = <T = unknown>(name: string, body: Record<string, unknown>, token = admin) => api<T>(`/rest/v1/rpc/${name}`, { token, method: "POST", body });
  const booking = async (id: string) => (await api<Array<Record<string, string | number | null>>>(`/rest/v1/listing_requests?select=status,refund_amount,paid_out_at,host_id&id=eq.${id}`, { token: admin })).data[0];
  const place = async (id: string) => (await api<Array<{ status: string }>>(`/rest/v1/properties?select=status&id=eq.${id}`, { token: admin })).data[0].status;

  async function cleanup(listingId: string) {
    await api(`/rest/v1/listing_requests?listing_id=eq.${listingId}`, { token: admin, method: "DELETE" });
    await api(`/rest/v1/rental_fees?listing_id=eq.${listingId}`, { token: admin, method: "DELETE" });
    await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "DELETE" });
  }

  /** Booked and paid, and accepted by the host unless told otherwise. */
  async function paidBooking(title: string, extra: Record<string, unknown> = {}, accept = true) {
    const { host, listingId } = await testHostListing(admin, title, { monthly_price: 5000, deposit: 1000, property_type: "studio", ...extra });
    const created = await rpc<{ booking_id: string; pay_token: string }>("guest_create_booking", { target_listing: listingId, move_in_date: day(3), stay_months: 3, people: 1, guest_note: "" });
    expect(created.status).toBe(200);
    const bookingId = created.data.booking_id;
    await rpc("submit_payment_by_token", { token: created.data.pay_token, pay_reference: `IP-${title.slice(0, 8)}`, ...REFERENCE });
    if (accept) await rpc("host_decide_booking", { target_booking: bookingId, accept: true }, host.access_token);
    await rpc("admin_confirm_booking_payment", { target_booking: bookingId });
    return { host, listingId, bookingId };
  }

  async function movedIn(title: string, extra: Record<string, unknown> = {}) {
    const paid = await paidBooking(title, extra);
    await startsToday(admin, paid.bookingId);
    expect((await rpc("guest_confirm_move_in", { target_booking: paid.bookingId })).status).toBeLessThan(300);
    return paid;
  }

  test("item 1: paying the host keeps the stay running; it completes when the end date passes", async () => {
    const { listingId, bookingId } = await movedIn("Payout stay");
    try {
      expect((await rpc("admin_mark_payout", { target_booking: bookingId, transfer_reference: "IP-OUT-1" })).status).toBeLessThan(300);
      const paid = await booking(bookingId);
      expect(paid.status).toBe("moved_in");
      expect(paid.paid_out_at).not.toBeNull();
      expect(await place(listingId)).toBe("rented");

      // The place can't be booked while someone lives there, and the guest can still report a problem.
      expect((await rpc("guest_create_booking", { target_listing: listingId, move_in_date: day(5), stay_months: 1, people: 1, guest_note: "" })).status).toBeGreaterThanOrEqual(400);
      expect((await rpc("guest_report_problem", { target_booking: bookingId, note: "The heating is broken" })).status).toBeLessThan(300);
      expect((await booking(bookingId)).status).toBe("cancellation_requested");
      expect(await place(listingId)).toBe("rented");
      const request = (await api<Array<{ id: string }>>(`/rest/v1/cancellation_requests?select=id&booking_id=eq.${bookingId}`, { token: admin })).data[0];
      await rpc("admin_decide_cancellation", { target_request: request.id, approve: false, chosen_scenario: "", note: "Repaired the same day" });
      expect((await booking(bookingId)).status).toBe("moved_in");

      // The end date passes: the stay is over and the place is free again.
      await api(`/rest/v1/listing_requests?id=eq.${bookingId}`, { token: admin, method: "PATCH", body: { move_in: day(-200) } });
      await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "PATCH", body: { rented_until: day(0) } });
      await rpc("admin_release_ended_rentals", {});
      expect((await booking(bookingId)).status).toBe("completed");
      expect(await place(listingId)).toBe("approved");
    } finally {
      await cleanup(listingId);
    }
  });

  test("item 2: a cancellation request before move-in doesn't rent the place", async () => {
    const { listingId, bookingId } = await paidBooking("Early cancel");
    try {
      expect((await rpc("guest_report_problem", { target_booking: bookingId, note: "I changed my plans" })).status).toBeLessThan(300);
      const request = (await api<Array<{ id: string }>>(`/rest/v1/cancellation_requests?select=id&booking_id=eq.${bookingId}`, { token: admin })).data[0];
      expect((await booking(bookingId)).status).toBe("cancellation_requested");
      expect(await place(listingId)).toBe("approved");
      // Even when something refreshes the place.
      await rpc("admin_release_ended_rentals", {});
      expect(await place(listingId)).toBe("approved");
      await rpc("admin_decide_cancellation", { target_request: request.id, approve: false, chosen_scenario: "", note: "Outside the cancellation window" });
      expect((await booking(bookingId)).status).toBe("confirmed");
    } finally {
      await cleanup(listingId);
    }
  });

  test("item 3: hosts need a real account with a phone and InstaPay; the claim moves everything", async () => {
    const anonymous = await guestSession();
    const created = await api<Array<{ id: string }>>("/rest/v1/properties?select=id", {
      token: anonymous.access_token, method: "POST", body: sampleListing(anonymous.user.id, "No account yet"),
    });
    const listingId = created.data[0].id;
    try {
      // Reviewed and published as usual, but not bookable yet.
      await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "PATCH", body: { status: "approved" } });
      expect((await rpc<boolean>("listing_host_ready", { target_listing: listingId })).data).toBe(false);
      const refused = await rpc("guest_create_booking", { target_listing: listingId, move_in_date: day(3), stay_months: 1, people: 1, guest_note: "" });
      expect(JSON.stringify(refused.data)).toContain("host_needs_account");

      const host = await testHost();
      await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "PATCH", body: { owner_id: host.user.id } });
      expect((await rpc<boolean>("listing_host_ready", { target_listing: listingId })).data).toBe(true);
      const booked = await rpc<{ booking_id: string }>("guest_create_booking", { target_listing: listingId, move_in_date: day(3), stay_months: 1, people: 1, guest_note: "" });
      expect(booked.status).toBe(200);

      // A booking from the old anonymous session follows the host into the account.
      await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "PATCH", body: { owner_id: anonymous.user.id } });
      await api(`/rest/v1/listing_requests?id=eq.${booked.data.booking_id}`, { token: admin, method: "PATCH", body: { host_id: anonymous.user.id } });
      const token = await rpc<string>("create_listing_transfer", {}, anonymous.access_token);
      expect((await rpc<number>("claim_listing_transfer", { transfer_token: token.data }, host.access_token)).data).toBe(1);
      expect((await booking(booked.data.booking_id)).host_id).toBe(host.user.id);
    } finally {
      await cleanup(listingId);
    }
  });

  test("item 4: a full refund works with the policy off; rejecting needs a reason and its own notice", async () => {
    const settings = (await api<Array<{ cancellation_policy_active: boolean }>>("/rest/v1/app_settings?select=cancellation_policy_active&id=eq.1", { token: admin })).data[0];
    const { host, listingId, bookingId } = await paidBooking("Full refund");
    try {
      await api("/rest/v1/app_settings?id=eq.1", { token: admin, method: "PATCH", body: { cancellation_policy_active: false } });
      const request = await rpc<string>("request_cancellation", { target_booking: bookingId, cancel_scenario: "host_cancels", cancel_reason: "The flat is no longer free" }, host.access_token);
      expect(request.status).toBeLessThan(300);

      // Rejecting needs a reason, and the guest hears about it without a second "booking confirmed".
      const silent = await rpc("admin_decide_cancellation", { target_request: request.data, approve: false, chosen_scenario: "", note: "" });
      expect(JSON.stringify(silent.data)).toContain("invalid_note");
      expect((await rpc("admin_decide_cancellation", { target_request: request.data, approve: false, chosen_scenario: "", note: "The host confirmed it is free" })).status).toBeLessThan(300);
      const notices = await api<Array<{ kind: string }>>(`/rest/v1/notifications?select=kind&booking_id=eq.${bookingId}`, { token: admin });
      const kinds = notices.data.map((item) => item.kind);
      expect(kinds).toContain("cancellation_rejected");
      expect(kinds.filter((kind) => kind === "booking_confirmed")).toHaveLength(1);

      // Only a full admin; only the fault cases; a reason is required.
      const stranger = await guestSession();
      expect((await rpc("admin_full_refund", { target_booking: bookingId, fault_case: "host_cancels", fault_note: "Not allowed" }, stranger.access_token)).status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify((await rpc("admin_full_refund", { target_booking: bookingId, fault_case: "mutual", fault_note: "Wrong case" })).data)).toContain("invalid_scenario");
      expect(JSON.stringify((await rpc("admin_full_refund", { target_booking: bookingId, fault_case: "host_cancels", fault_note: "" })).data)).toContain("invalid_note");

      const refund = await rpc<{ refundable_amount: number }>("admin_full_refund", { target_booking: bookingId, fault_case: "host_cancels", fault_note: "The host rented it elsewhere" });
      expect(refund.data).toMatchObject({ refundable_amount: 6400 });
      expect(await booking(bookingId)).toMatchObject({ status: "refund_pending", refund_amount: 6400 });
      const told = await api<Array<{ kind: string }>>(`/rest/v1/notifications?select=kind&booking_id=eq.${bookingId}`, { token: host.access_token });
      expect(told.data.map((item) => item.kind)).toContain("refund_pending_host");
    } finally {
      await api("/rest/v1/app_settings?id=eq.1", { token: admin, method: "PATCH", body: { cancellation_policy_active: settings.cancellation_policy_active } });
      await cleanup(listingId);
    }
  });

  test("item 6: a host's no on an unverified transfer waits for the team", async () => {
    const { host, listingId } = await testHostListing(admin, "Unverified no", { property_type: "studio" });
    try {
      const book = () => rpc<{ booking_id: string; pay_token: string }>("guest_create_booking", { target_listing: listingId, move_in_date: day(3), stay_months: 1, people: 1, guest_note: "" });

      // The money arrived: only then does the refund start.
      const first = await book();
      await rpc("submit_payment_by_token", { token: first.data.pay_token, pay_reference: "IP-NO-1", ...REFERENCE });
      await rpc("host_decide_booking", { target_booking: first.data.booking_id, accept: false }, host.access_token);
      expect((await booking(first.data.booking_id)).status).toBe("payment_review");
      await rpc("admin_confirm_booking_payment", { target_booking: first.data.booking_id });
      expect((await booking(first.data.booking_id)).status).toBe("refund_pending");

      // It never arrived: there is nothing to refund.
      const second = await book();
      await rpc("submit_payment_by_token", { token: second.data.pay_token, pay_reference: "IP-NO-2", ...REFERENCE });
      await rpc("host_decide_booking", { target_booking: second.data.booking_id, accept: false }, host.access_token);
      const fee = (await api<Array<{ id: string }>>(`/rest/v1/rental_fees?select=id&request_id=eq.${second.data.booking_id}`, { token: admin })).data[0];
      await rpc("admin_decide_fee", { target_fee: fee.id, decision: "due" });
      expect((await booking(second.data.booking_id)).status).toBe("cancelled");
    } finally {
      await cleanup(listingId);
    }
  });

  test("items 5 and 9: wrong amounts, late transfers, and rooms that fill up by people", async () => {
    const { listingId } = await testHostListing(admin, "Two free beds", { property_type: "room", available_beds: 2, total_beds: 2, monthly_price: 5000, deposit: 1000 });
    try {
      const book = (people: number) => rpc<{ booking_id: string; pay_token: string }>("guest_create_booking", { target_listing: listingId, move_in_date: day(3), stay_months: 1, people, guest_note: "" });
      expect(JSON.stringify((await book(3)).data)).toContain("too_many_people");

      // One guest of two: the calendar stays empty, because a bed is free.
      const first = await book(1);
      await rpc("submit_payment_by_token", { token: first.data.pay_token, pay_reference: "IP-AMT-1", ...REFERENCE });
      expect((await rpc<unknown[]>("listing_booked_ranges", { target_listing: listingId })).data).toEqual([]);
      // Two people don't fit in the one bed left.
      expect(JSON.stringify((await book(2)).data)).toContain("dates_taken");

      // Less money than due: the amount is kept, and the guest gets the clock back and a message.
      expect((await rpc("admin_amount_differs", { target_booking: first.data.booking_id, received: 6400, team_note: null })).status).toBeGreaterThanOrEqual(400);
      expect((await rpc("admin_amount_differs", { target_booking: first.data.booking_id, received: 5000, team_note: null })).status).toBeLessThan(300);
      const fee = (await api<Array<{ status: string; received_amount: number; admin_note: string }>>(`/rest/v1/rental_fees?select=status,received_amount,admin_note&request_id=eq.${first.data.booking_id}`, { token: admin })).data[0];
      expect(fee).toMatchObject({ status: "due", received_amount: 5000 });
      expect(fee.admin_note).toContain("5000");
      expect((await booking(first.data.booking_id)).status).toBe("pending_payment");

      // The guest gives up: what arrived goes back, not the whole amount.
      await rpc("guest_cancel_booking", { target_booking: first.data.booking_id });
      expect(await booking(first.data.booking_id)).toMatchObject({ status: "refund_pending", refund_amount: 5000 });

      // A transfer after expiry: the team can move a cancelled booking to refund.
      const late = await book(1);
      await rpc("guest_cancel_booking", { target_booking: late.data.booking_id });
      expect((await booking(late.data.booking_id)).status).toBe("cancelled");
      expect((await rpc("admin_late_transfer", { target_booking: late.data.booking_id, received: 6400, transfer_reference: "IP-LATE-1" })).status).toBeLessThan(300);
      expect(await booking(late.data.booking_id)).toMatchObject({ status: "refund_pending", refund_amount: 6400 });
    } finally {
      await cleanup(listingId);
    }
  });

  test("item 12: visitors can report and be counted on rented pages", async () => {
    const owner = await guestSession();
    const created = await api<Array<{ id: string }>>("/rest/v1/properties?select=id", {
      token: owner.access_token, method: "POST", body: sampleListing(owner.user.id, "Rented page"),
    });
    const listingId = created.data[0].id;
    try {
      await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "PATCH", body: { status: "approved" } });
      expect((await rpc("owner_report_rental", { target_listing: listingId, via_sakani: false, rented_until: day(10) }, owner.access_token)).status).toBe(200);
      const view = await api("/rest/v1/listing_events", { method: "POST", prefer: "return=minimal", body: { listing_id: listingId, kind: "view" } });
      expect(view.status).toBeLessThan(300);
      const report = await api("/rest/v1/listing_reports", { method: "POST", prefer: "return=minimal", body: { listing_id: listingId, reason: "other", details: "E2E rented page" } });
      expect(report.status).toBeLessThan(300);
    } finally {
      await api(`/rest/v1/listing_reports?listing_id=eq.${listingId}`, { token: admin, method: "DELETE" });
      await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "DELETE" });
    }
  });

  test("item 13: an owner can edit a published place, and a change that needs a review sends it back", async () => {
    const owner = await guestSession();
    const created = await api<Array<{ id: string }>>("/rest/v1/properties?select=id", {
      token: owner.access_token, method: "POST", body: sampleListing(owner.user.id, "Edit published"),
    });
    const listingId = created.data[0].id;
    try {
      await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "PATCH", body: { status: "approved" } });
      await api(`/rest/v1/properties?id=eq.${listingId}`, { token: owner.access_token, method: "PATCH", body: { description_en: "A new description, long enough to count as one." } });
      const row = (await api<Array<{ status: string }>>(`/rest/v1/properties?select=status&id=eq.${listingId}`, { token: admin })).data[0];
      expect(row).toEqual({ status: "pending" });
    } finally {
      await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "DELETE" });
    }
  });
});

// Migration 20261112000000: team alerts, InstaPay at sign-up, small edits, the monthly reminder.
test.describe("workflow", () => {
  test.skip(!hasAdmin, "needs admin login");
  let admin = "";
  test.beforeAll(async () => {
    admin = await adminToken();
  });

  const listingRow = async (id: string) => (await api<Array<{ status: string; verified: boolean; monthly_price: number; title_en: string }>>(`/rest/v1/properties?select=status,verified,monthly_price,title_en&id=eq.${id}`, { token: admin })).data[0];

  /** A place of a fresh anonymous owner, in the status asked for. */
  async function ownedListing(title: string, status: string, extra: Record<string, unknown> = {}) {
    const owner = await guestSession();
    const created = await api<Array<{ id: string }>>("/rest/v1/properties?select=id", { token: owner.access_token, method: "POST", body: sampleListing(owner.user.id, title) });
    const listingId = created.data[0].id;
    await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "PATCH", body: { status, ...extra } });
    const edit = (body: Record<string, unknown>) => api(`/rest/v1/properties?id=eq.${listingId}`, { token: owner.access_token, method: "PATCH", body });
    return { owner, listingId, edit };
  }
  const remove = (listingId: string) => api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "DELETE" });

  test("team alerts: the function and its settings are out of reach of visitors and accounts", async () => {
    const user = await guestSession();
    for (const token of [undefined, user.access_token]) {
      const call = await api("/rest/v1/rpc/team_alert", { token, method: "POST", body: { alert_text: "[E2E TEST] should never send" } });
      expect([401, 403, 404]).toContain(call.status);
      const settings = await api("/rest/v1/team_alert_settings?select=bot_token,chat_id", { token });
      expect([401, 403, 404]).toContain(settings.status);
      const change = await api("/rest/v1/team_alert_settings?id=eq.1", { token, method: "PATCH", body: { chat_id: "1" } });
      expect([401, 403, 404]).toContain(change.status);
    }
    // Not even the team, from the site: the token only lives in the SQL Editor.
    expect([401, 403, 404]).toContain((await api("/rest/v1/team_alert_settings?select=bot_token", { token: admin })).status);
  });

  test("small edits keep a published place live and its badge, and are written to the audit log", async () => {
    const { listingId, edit } = await ownedListing("Small edit", "approved", { verified: true });
    try {
      // What the listing form sends: the changed fields, and status pending.
      expect((await edit({ monthly_price: 3700, deposit: 1500, wifi: false, fridge: true, status: "pending" })).status).toBeLessThan(300);
      expect(await listingRow(listingId)).toMatchObject({ status: "approved", verified: true, monthly_price: 3700 });
      const log = await api<Array<{ action: string; new_data: Record<string, unknown> }>>(`/rest/v1/audit_logs?select=action,new_data&entity=eq.properties&entity_id=eq.${listingId}`, { token: admin });
      expect(log.data).toHaveLength(1);
      expect(log.data[0].action).toBe("owner_small_edit");
      expect(log.data[0].new_data).toMatchObject({ monthly_price: 3700, deposit: 1500 });

      // A paused place stays paused.
      await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "PATCH", body: { status: "paused" } });
      await edit({ monthly_price: 3800, status: "approved" });
      expect(await listingRow(listingId)).toMatchObject({ status: "paused", monthly_price: 3800 });
    } finally {
      await remove(listingId);
    }
  });

  test("anything else on a published place goes back to review", async () => {
    const { listingId, edit } = await ownedListing("Review edit", "approved", { verified: true });
    try {
      const changes = [
        { title_en: `${TEST_TAG} Review edit renamed` },
        { area: "Maadi", monthly_price: 3550 },
        { gender: "male" },
        { property_type: "studio" },
        { image_urls: ["https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=800"] },
      ];
      for (const change of changes) {
        await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "PATCH", body: { status: "approved", verified: true } });
        await edit(change);
        expect(await listingRow(listingId), JSON.stringify(change)).toMatchObject({ status: "pending", verified: false });
      }
    } finally {
      await remove(listingId);
    }
  });

  test("an owner can't publish a place, or give a published one any other status", async () => {
    const pending = await ownedListing("Stays pending", "pending");
    const published = await ownedListing("Stays approved", "approved");
    try {
      await pending.edit({ status: "approved" });
      expect((await listingRow(pending.listingId)).status).toBe("pending");
      await pending.edit({ status: "approved", monthly_price: 3600 });
      expect((await listingRow(pending.listingId)).status).toBe("pending");

      for (const status of ["pending", "rejected", "paused", "rented", "reserved", "suspended"]) {
        await published.edit({ status });
        expect((await listingRow(published.listingId)).status, status).toBe("approved");
      }
      // The badge and the owner are not the owner's to change either.
      await published.edit({ verified: true, owner_id: pending.owner.user.id, monthly_price: 3900 });
      const row = await listingRow(published.listingId);
      expect(row).toMatchObject({ status: "approved", verified: false, monthly_price: 3900 });
      const owners = await api<Array<{ owner_id: string }>>(`/rest/v1/properties?select=owner_id&id=eq.${published.listingId}`, { token: admin });
      expect(owners.data[0].owner_id).toBe(published.owner.user.id);
    } finally {
      await remove(pending.listingId);
      await remove(published.listingId);
    }
  });

  test("monthly reminder: a stale place's owner is asked once, confirming stops it, demo places are left out", async () => {
    const stale = await ownedListing("Still there", "approved");
    const demo = await ownedListing("Demo place", "approved", { is_demo: true });
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
    const notices = async (owner: { access_token: string }) => (await api<Array<{ data: { listing_id: string; title: string; title_en: string } }>>("/rest/v1/notifications?select=data&kind=eq.listing_still_available", { token: owner.access_token })).data;
    const release = () => api("/rest/v1/rpc/admin_release_ended_rentals", { token: admin, method: "POST", body: {} });
    try {
      for (const id of [stale.listingId, demo.listingId]) await api(`/rest/v1/properties?id=eq.${id}`, { token: admin, method: "PATCH", body: { updated_at: old } });
      await release();
      const first = await notices(stale.owner);
      expect(first).toHaveLength(1);
      expect(first[0].data).toMatchObject({ listing_id: stale.listingId });
      expect(first[0].data.title_en).toContain("Still there");
      expect(await notices(demo.owner)).toHaveLength(0);

      await release();
      expect(await notices(stale.owner)).toHaveLength(1);

      // Confirming stamps the place, so it isn't stale any more, whatever the notices say.
      expect((await api("/rest/v1/rpc/confirm_listing", { token: stale.owner.access_token, method: "POST", body: { target_listing: stale.listingId } })).status).toBeLessThan(300);
      const stamp = await api<Array<{ updated_at: string }>>(`/rest/v1/properties?select=updated_at&id=eq.${stale.listingId}`, { token: admin });
      expect(Date.now() - new Date(stamp.data[0].updated_at).getTime()).toBeLessThan(3_600_000);
    } finally {
      await remove(stale.listingId);
      await remove(demo.listingId);
    }
  });

  test("host sign-up asks for InstaPay, and guests aren't asked", async ({ page }) => {
    await page.goto("/en/account?mode=signup&role=host");
    const field = page.locator('input[name="instapay"]');
    await expect(field).toBeVisible();
    await page.fill('input[name="name"]', "E2E Host");
    await page.fill('input[name="email"]', "e2e-never-sent@example.com");
    await page.fill('input[name="password"]', "a-long-enough-password");
    await page.click('button[type="submit"]');
    await expect(page.locator(".field-error")).toContainText("InstaPay");
    await expect(field).toBeFocused();

    await page.locator('input[name="role"][value="guest"]').check({ force: true });
    await expect(field).toHaveCount(0);
  });

  test("the InstaPay address given at sign-up reaches the profile", async () => {
    // A fixed account, like the test host, so runs don't pile up accounts. It needs its email confirmed once.
    const [local, domain] = ADMIN_EMAIL.split("@");
    const credentials = { email: `${local}+sakani-test-signup@${domain}`, password: createHash("sha256").update(`sakani-test-signup:${ADMIN_PASSWORD}`).digest("hex") };
    await api("/auth/v1/signup", { method: "POST", body: { ...credentials, data: { role: "host", full_name: "E2E Signup", phone: "01000000078", instapay_address: "e2e-signup@instapay" } } });
    const session = await api<{ access_token?: string; user?: { id: string } }>("/auth/v1/token?grant_type=password", { method: "POST", body: credentials });
    test.skip(!session.data?.access_token, "the sign-up account's email isn't confirmed yet");
    const profile = await api<Array<{ role: string; instapay_address: string }>>(`/rest/v1/profiles?select=role,instapay_address&id=eq.${session.data.user!.id}`, { token: session.data.access_token });
    expect(profile.data[0]).toEqual({ role: "host", instapay_address: "e2e-signup@instapay" });
  });
});
