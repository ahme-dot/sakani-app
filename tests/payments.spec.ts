import { expect, test } from "@playwright/test";
import { SUPABASE_KEY, adminToken, api, guestSession, hasAdmin, sampleListing } from "./helpers";

// Success fee rules, checked straight against Supabase. Skipped until the payments migration is installed.
test.describe("success fee", () => {
  test("owner reports a rental, pays by transfer, admin confirms", async () => {
    test.skip(!hasAdmin, "needs admin login to publish the test listing");
    const settings = await api<Array<{ fee_percent: number; fee_minimum: number }>>("/rest/v1/app_settings?select=fee_percent,fee_minimum&id=eq.1");
    test.skip(settings.status >= 400, "payments migration not installed yet");

    const admin = await adminToken();
    const owner = await guestSession();
    const stranger = await guestSession();
    const created = await api<Array<{ id: string }>>("/rest/v1/properties?select=id", {
      token: owner.access_token, method: "POST", body: sampleListing(owner.user.id, "Success fee", { monthly_price: 4000 }),
    });
    const id = created.data[0].id;
    const rpc = (name: string, body: Record<string, unknown>, token: string) => api<Record<string, unknown>>(`/rest/v1/rpc/${name}`, { token, method: "POST", body });
    let feeId = "";
    try {
      // Not published yet: cannot report a rental.
      expect((await rpc("owner_report_rental", { target_listing: id, via_sakani: true }, owner.access_token)).status).toBeGreaterThanOrEqual(400);
      await api(`/rest/v1/properties?id=eq.${id}`, { token: admin, method: "PATCH", body: { status: "approved" } });

      // Someone else cannot report it; a visitor cannot either.
      expect((await rpc("owner_report_rental", { target_listing: id, via_sakani: true }, stranger.access_token)).status).toBeGreaterThanOrEqual(400);
      expect((await rpc("owner_report_rental", { target_listing: id, via_sakani: true }, SUPABASE_KEY)).status).toBeGreaterThanOrEqual(400);

      const report = await rpc("owner_report_rental", { target_listing: id, via_sakani: true }, owner.access_token);
      expect(report.status).toBe(200);
      const { fee_percent, fee_minimum } = settings.data[0];
      expect(report.data.amount).toBe(Math.max(Number(fee_minimum), Math.round((4000 * Number(fee_percent)) / 100)));
      feeId = String(report.data.fee_id);
      expect((await api<unknown[]>(`/rest/v1/properties?id=eq.${id}&select=id`)).data).toHaveLength(0); // hidden

      // Reporting again does not create a second fee.
      const again = await rpc("owner_report_rental", { target_listing: id, via_sakani: true }, owner.access_token);
      expect(again.data.fee_id).toBe(feeId);

      // Only the owner sees the fee; the owner cannot mark it paid directly.
      expect((await api<unknown[]>(`/rest/v1/rental_fees?id=eq.${feeId}&select=id`, { token: stranger.access_token })).data).toHaveLength(0);
      const selfPaid = await api<unknown[]>(`/rest/v1/rental_fees?id=eq.${feeId}`, { token: owner.access_token, method: "PATCH", body: { status: "paid" } });
      expect(selfPaid.status >= 400 || (selfPaid.data as unknown[]).length === 0).toBeTruthy();

      // Bad details are refused; good ones move the fee to "submitted".
      expect((await rpc("owner_submit_payment", { target_fee: feeId, pay_method: "cash", pay_reference: "123456", pay_phone: "01000000000" }, owner.access_token)).status).toBeGreaterThanOrEqual(400);
      expect((await rpc("owner_submit_payment", { target_fee: feeId, pay_method: "instapay", pay_reference: "TX-123456", pay_phone: "01000000000" }, owner.access_token)).status).toBeLessThan(300);

      // Owners cannot decide; admins can.
      expect((await rpc("admin_decide_fee", { target_fee: feeId, decision: "paid" }, owner.access_token)).status).toBeGreaterThanOrEqual(400);
      expect((await rpc("admin_decide_fee", { target_fee: feeId, decision: "paid" }, admin)).status).toBeLessThan(300);
      const fee = await api<Array<{ status: string; reference: string }>>(`/rest/v1/rental_fees?id=eq.${feeId}&select=status,reference`, { token: owner.access_token });
      expect(fee.data[0]).toEqual({ status: "paid", reference: "TX-123456" });
    } finally {
      if (feeId) await api(`/rest/v1/rental_fees?id=eq.${feeId}`, { token: admin, method: "DELETE" });
      await api(`/rest/v1/properties?id=eq.${id}`, { token: admin, method: "DELETE" });
    }
  });

  test("visitors can read payment details but not change them", async () => {
    const settings = await api<unknown[]>("/rest/v1/app_settings?select=instapay_address&id=eq.1");
    test.skip(settings.status >= 400, "payments migration not installed yet");
    expect(settings.data).toHaveLength(1);
    const owner = await guestSession();
    const change = await api<unknown[]>("/rest/v1/app_settings?id=eq.1", { token: owner.access_token, method: "PATCH", body: { instapay_address: "attacker@instapay" } });
    expect(change.status >= 400 || (change.data as unknown[]).length === 0).toBeTruthy();
  });
});
