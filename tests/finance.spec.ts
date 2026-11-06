import { expect, test } from "@playwright/test";
import { basisPoints, bookingAmounts, commissionFor } from "../lib/finance";
import { adminToken, api, guestSession, hasAdmin, testHostListing } from "./helpers";

// The money rules (MASTER PROJECT PROMPT, section 18). Commissions are on the first month's rent only;
// the deposit never earns commission; the code and the database use the same integer formula.

test.describe("calculation engine", () => {
  test("TEST 1: rent 10,000 and deposit 10,000 at 8% / 10%", () => {
    expect(bookingAmounts({ rent: 10_000, deposit: 10_000 }, { guestPercent: 8, hostPercent: 10 })).toEqual({
      rent: 10_000,
      deposit: 10_000,
      guestCommission: 800,
      hostCommission: 1_000,
      guestTotal: 20_800,
      hostNetRent: 9_000,
      platformCommission: 1_800,
    });
  });

  test("TEST 2: changing the deposit doesn't change the commissions", () => {
    const base = bookingAmounts({ rent: 10_000, deposit: 0 });
    for (const deposit of [1, 5_000, 10_000, 250_000]) {
      const amounts = bookingAmounts({ rent: 10_000, deposit });
      expect(amounts.guestCommission).toBe(base.guestCommission);
      expect(amounts.hostCommission).toBe(base.hostCommission);
      expect(amounts.platformCommission).toBe(base.platformCommission);
      expect(amounts.guestTotal).toBe(base.guestTotal + deposit);
    }
  });

  test("rounding is half-up to the pound with integers only", () => {
    expect(commissionFor(3_333, 8)).toBe(267); // 266.64
    expect(commissionFor(3_331, 8)).toBe(266); // 266.48
    expect(commissionFor(3_125, 8)).toBe(250); // exactly 250
    expect(commissionFor(1_250, 12.5)).toBe(156); // 156.25
    expect(commissionFor(1_252, 12.5)).toBe(157); // 156.5 → up
    expect(commissionFor(0, 8)).toBe(0);
    expect(basisPoints(8)).toBe(800);
    expect(basisPoints(12.5)).toBe(1_250);
  });

  test("invalid amounts are refused", () => {
    expect(() => bookingAmounts({ rent: -1, deposit: 0 })).toThrow(RangeError);
    expect(() => bookingAmounts({ rent: 100.5, deposit: 0 })).toThrow(RangeError);
    expect(() => commissionFor(100, 101)).toThrow(RangeError);
  });

  test("the database formula matches the code", async () => {
    const cases: Array<[number, number]> = [[10_000, 8], [10_000, 10], [3_333, 8], [3_331, 8], [1_250, 12.5], [1_252, 12.5], [7_777, 10], [0, 8]];
    for (const [amount, percent] of cases) {
      const { status, data } = await api<number>("/rest/v1/rpc/commission_for", { method: "POST", body: { amount, percent } });
      test.skip(status === 404, "finance migration not installed yet");
      expect(data, `${amount} at ${percent}%`).toBe(commissionFor(amount, percent));
    }
  });
});

/** Tomorrow as YYYY-MM-DD. */
function tomorrow() {
  return new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

test.describe("bookings, payments and deposits", () => {
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

  /** A published listing by the test host; booked by the admin acting as a guest. */
  async function book(rent: number, deposit: number, months = 6) {
    const { host, listingId } = await testHostListing(admin, "Finance", { monthly_price: rent, deposit });
    const booking = await api<{ booking_id: string; pay_token: string; total: number; fee: number; deposit: number }>("/rest/v1/rpc/guest_create_booking", {
      token: admin, method: "POST", body: { target_listing: listingId, move_in_date: tomorrow(), stay_months: months, people: 1, guest_note: "" },
    });
    return { host, listingId, ...booking.data, status: booking.status };
  }

  async function cleanup(listingId: string) {
    await api(`/rest/v1/listing_requests?listing_id=eq.${listingId}`, { token: admin, method: "DELETE" });
    await api(`/rest/v1/rental_fees?listing_id=eq.${listingId}`, { token: admin, method: "DELETE" });
    await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "DELETE" });
  }

  const row = async (id: string) =>
    (await api<Array<Record<string, number | string | null>>>(`/rest/v1/listing_requests?select=status,guest_fee,host_fee,deposit_amount,total_amount,payout_amount,guest_fee_percent,host_fee_percent&id=eq.${id}`, { token: admin })).data[0];

  test("the booking charges first month + 8% + deposit, and keeps its rates", async () => {
    const ready = await api("/rest/v1/rpc/commission_for", { method: "POST", body: { amount: 1, percent: 8 } });
    test.skip(ready.status === 404, "finance migration not installed yet");
    const first = await book(10_000, 10_000, 12);
    try {
      expect(first.status).toBe(200);
      expect(first).toMatchObject({ fee: 800, deposit: 10_000, total: 20_800 });
      expect(await row(first.booking_id)).toMatchObject({ guest_fee: 800, host_fee: 1_000, deposit_amount: 10_000, total_amount: 20_800, payout_amount: 9_000 });

      // TEST 7: a later rate change doesn't touch an existing booking.
      await api("/rest/v1/app_settings?id=eq.1", { token: admin, method: "PATCH", body: { student_fee_percent: 9, fee_percent: 11 } });
      const after = await row(first.booking_id);
      expect(after).toMatchObject({ guest_fee: 800, host_fee: 1_000, total_amount: 20_800 });
      expect(Number(after.guest_fee_percent)).toBe(8);
      expect(Number(after.host_fee_percent)).toBe(10);
    } finally {
      await api("/rest/v1/app_settings?id=eq.1", { token: admin, method: "PATCH", body: { student_fee_percent: 8, fee_percent: 10 } });
      await cleanup(first.listingId);
    }
  });

  test("TEST 3: the lease length doesn't change the first-month commissions", async () => {
    const short = await book(10_000, 5_000, 1);
    const long = await book(10_000, 5_000, 12);
    try {
      test.skip(short.status === 404, "finance migration not installed yet");
      expect(short.fee).toBe(long.fee);
      expect(short.total).toBe(long.total);
    } finally {
      await cleanup(short.listingId);
      await cleanup(long.listingId);
    }
  });

  test("TEST 4: a payment that wasn't received doesn't confirm the booking", async () => {
    const booking = await book(4_000, 2_000);
    try {
      await api("/rest/v1/rpc/host_decide_booking", { token: booking.host.access_token, method: "POST", body: { target_booking: booking.booking_id, accept: true } });
      await api("/rest/v1/rpc/submit_payment_by_token", { method: "POST", body: { token: booking.pay_token, pay_method: "instapay", pay_reference: "IP-FAIL-1", pay_phone: "01112223334" } });
      const fee = (await api<Array<{ id: string }>>(`/rest/v1/rental_fees?select=id&request_id=eq.${booking.booking_id}`, { token: admin })).data[0];
      await api("/rest/v1/rpc/admin_decide_fee", { token: admin, method: "POST", body: { target_fee: fee.id, decision: "due" } });
      expect((await row(booking.booking_id)).status).toBe("pending_payment");
      // The guest gets a fresh 24 hours, so the hourly job doesn't cancel it at once.
      const clock = await api<Array<{ pay_by: string }>>(`/rest/v1/listing_requests?select=pay_by&id=eq.${booking.booking_id}`, { token: admin });
      expect(new Date(clock.data[0].pay_by).getTime() - Date.now()).toBeGreaterThan(23 * 3_600_000);
    } finally {
      await cleanup(booking.listingId);
    }
  });

  test("TESTS 5, 6, 8, 10: deposit only after a signed contract, only once; ledgers private and audited", async () => {
    const booking = await book(6_000, 6_000);
    try {
      await api("/rest/v1/rpc/host_decide_booking", { token: booking.host.access_token, method: "POST", body: { target_booking: booking.booking_id, accept: true } });
      await api("/rest/v1/rpc/submit_payment_by_token", { method: "POST", body: { token: booking.pay_token, pay_method: "instapay", pay_reference: "IP-DEP-1", pay_phone: "01112223334" } });
      await api("/rest/v1/rpc/admin_confirm_booking_payment", { token: admin, method: "POST", body: { target_booking: booking.booking_id } });
      expect((await row(booking.booking_id)).status).toBe("confirmed");

      // TEST 5: no signed contract, no deposit transfer.
      const unsigned = await api("/rest/v1/rpc/admin_transfer_deposit", { token: admin, method: "POST", body: { target_booking: booking.booking_id, transfer_reference: "IP-DEP-OUT" } });
      expect(unsigned.status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(unsigned.data)).toContain("contract_not_signed");

      // TEST 6: after signing, one transfer; a second is refused and no duplicate is recorded.
      await api(`/rest/v1/listing_requests?id=eq.${booking.booking_id}`, { token: admin, method: "PATCH", body: { contract_signed_at: new Date().toISOString() } });
      expect((await api("/rest/v1/rpc/admin_transfer_deposit", { token: admin, method: "POST", body: { target_booking: booking.booking_id, transfer_reference: "IP-DEP-OUT" } })).status).toBeLessThan(300);
      const again = await api("/rest/v1/rpc/admin_transfer_deposit", { token: admin, method: "POST", body: { target_booking: booking.booking_id, transfer_reference: "IP-DEP-OUT-2" } });
      expect(again.status).toBeGreaterThanOrEqual(400);
      const transfers = await api<Array<{ amount: number }>>(`/rest/v1/deposit_transfers?select=amount&booking_id=eq.${booking.booking_id}`, { token: admin });
      expect(transfers.data).toEqual([{ amount: 6_000 }]);

      // The host confirms receipt; strangers and visitors see nothing (TEST 8).
      expect((await api("/rest/v1/rpc/host_acknowledge_deposit", { token: booking.host.access_token, method: "POST", body: { target_booking: booking.booking_id } })).status).toBeLessThan(300);
      const stranger = await guestSession();
      for (const table of ["deposit_transfers", "audit_logs", "booking_status_history"]) {
        const seen = await api<unknown[]>(`/rest/v1/${table}?select=*&limit=5`, { token: stranger.access_token });
        expect(seen.status >= 400 || (seen.data as unknown[]).length === 0, table).toBeTruthy();
      }
      expect((await api("/rest/v1/rpc/admin_transfer_deposit", { token: stranger.access_token, method: "POST", body: { target_booking: booking.booking_id, transfer_reference: "X-123" } })).status).toBeGreaterThanOrEqual(400);

      // TEST 10: every step is in the audit log, which can't be edited or deleted.
      const audit = await api<Array<{ id: number; entity: string }>>(`/rest/v1/audit_logs?select=id,entity&entity_id=in.(${booking.booking_id})&order=id`, { token: admin });
      expect(audit.data.length).toBeGreaterThan(0);
      const depositAudit = await api<Array<{ id: number }>>("/rest/v1/audit_logs?select=id&entity=eq.deposit_transfers&order=id.desc&limit=1", { token: admin });
      expect(depositAudit.data.length).toBe(1);
      const edit = await api(`/rest/v1/audit_logs?id=eq.${depositAudit.data[0].id}`, { token: admin, method: "PATCH", body: { action: "hidden" } });
      expect(edit.status).toBeGreaterThanOrEqual(400);
      const remove = await api(`/rest/v1/audit_logs?id=eq.${depositAudit.data[0].id}`, { token: admin, method: "DELETE" });
      expect(remove.status === 401 || remove.status === 403 || remove.status >= 400 || (remove.data as unknown[] | null)?.length === 0).toBeTruthy();
      expect((await api<unknown[]>(`/rest/v1/audit_logs?select=id&id=eq.${depositAudit.data[0].id}`, { token: admin })).data).toHaveLength(1);

      const history = await api<Array<{ to_status: string }>>(`/rest/v1/booking_status_history?select=to_status&booking_id=eq.${booking.booking_id}&order=id`, { token: admin });
      expect(history.data.map((item) => item.to_status)).toEqual(["pending_payment", "payment_review", "confirmed"]);
    } finally {
      await cleanup(booking.listingId);
    }
  });
});
