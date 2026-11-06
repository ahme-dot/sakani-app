import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, adminToken, api, guestSession, hasAdmin, testHostListing, watchErrors } from "./helpers";

// Phase 2: documents and the rental agreement. The deposit can be sent only after both sides accept the agreement.
const VERSION = "2026-11-draft-1";

function tomorrow() {
  return new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

test.describe("documents and the rental agreement", () => {
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

  test("both sides accept the agreement, then the deposit can be sent; documents are private", async ({ page }) => {
    const ready = await api("/rest/v1/rpc/accept_document", { token: admin, method: "POST", body: { target_booking: null, doc: "guest_platform", doc_version: VERSION } });
    test.skip(ready.status === 404, "contracts migration not installed yet");
    const errors = watchErrors(page);

    const { host, listingId } = await testHostListing(admin, "Contract", { monthly_price: 10_000, deposit: 10_000 });
    try {
      const booking = (await api<{ booking_id: string; pay_token: string; total: number }>("/rest/v1/rpc/guest_create_booking", {
        token: admin, method: "POST", body: { target_listing: listingId, move_in_date: tomorrow(), stay_months: 12, people: 1, guest_note: "" },
      })).data;
      expect(booking.total).toBe(20_800);
      const id = booking.booking_id;

      // Before the booking is confirmed, nobody can accept the rental agreement.
      const early = await api("/rest/v1/rpc/accept_document", { token: admin, method: "POST", body: { target_booking: id, doc: "rental_agreement", doc_version: VERSION } });
      expect(early.status).toBeGreaterThanOrEqual(400);

      await api("/rest/v1/rpc/host_decide_booking", { token: host.access_token, method: "POST", body: { target_booking: id, accept: true } });
      await api("/rest/v1/rpc/submit_payment_by_token", { method: "POST", body: { token: booking.pay_token, pay_method: "instapay", pay_reference: "IP-DOC-1", pay_phone: "01112223334" } });
      await api("/rest/v1/rpc/admin_confirm_booking_payment", { token: admin, method: "POST", body: { target_booking: id } });

      // A stranger can't accept it or read the booking's documents.
      const stranger = await guestSession();
      expect((await api("/rest/v1/rpc/accept_document", { token: stranger.access_token, method: "POST", body: { target_booking: id, doc: "rental_agreement", doc_version: VERSION } })).status).toBeGreaterThanOrEqual(400);
      expect((await api("/rest/v1/rpc/booking_document_data", { token: stranger.access_token, method: "POST", body: { target_booking: id } })).status).toBeGreaterThanOrEqual(400);

      // The guest accepts (twice changes nothing); the contract is not signed until the host accepts too.
      const signed = async () => (await api<Array<{ contract_signed_at: string | null }>>(`/rest/v1/listing_requests?select=contract_signed_at&id=eq.${id}`, { token: admin })).data[0].contract_signed_at;
      const guestAccept = await api<{ contract_signed: boolean }>("/rest/v1/rpc/accept_document", { token: admin, method: "POST", body: { target_booking: id, doc: "rental_agreement", doc_version: VERSION } });
      expect(guestAccept.data.contract_signed).toBe(false);
      await api("/rest/v1/rpc/accept_document", { token: admin, method: "POST", body: { target_booking: id, doc: "rental_agreement", doc_version: VERSION } });
      expect(await signed()).toBeNull();
      expect((await api("/rest/v1/rpc/admin_transfer_deposit", { token: admin, method: "POST", body: { target_booking: id, transfer_reference: "IP-DEP-DOC" } })).status).toBeGreaterThanOrEqual(400);

      const hostAccept = await api<{ contract_signed: boolean }>("/rest/v1/rpc/accept_document", { token: host.access_token, method: "POST", body: { target_booking: id, doc: "rental_agreement", doc_version: VERSION } });
      expect(hostAccept.data.contract_signed).toBe(true);
      expect(await signed()).not.toBeNull();
      const acceptances = await api<Array<{ party: string; document_version: string }>>(`/rest/v1/contract_acceptances?select=party,document_version&booking_id=eq.${id}&order=party`, { token: admin });
      expect(acceptances.data).toEqual([{ party: "guest", document_version: VERSION }, { party: "host", document_version: VERSION }]);
      expect((await api("/rest/v1/rpc/admin_transfer_deposit", { token: admin, method: "POST", body: { target_booking: id, transfer_reference: "IP-DEP-DOC" } })).status).toBeLessThan(300);

      // The guest sees the payment receipt with the right amounts, ready to print.
      await page.goto(`/en/account?next=${encodeURIComponent(`/en/documents/${id}?doc=payment_receipt`)}`);
      await page.fill('input[name="email"]', ADMIN_EMAIL);
      await page.fill('input[name="password"]', ADMIN_PASSWORD);
      await page.locator(".auth-submit").click();
      await expect(page.locator(".document h1")).toHaveText("Payment receipt");
      await expect(page.locator(".document-table")).toContainText("20,800");
      await expect(page.locator(".document-table")).toContainText("10,000");
      await expect(page.locator(".document-draft")).toBeVisible();
      await expect(page.locator(".document-actions .button")).toBeVisible();

      await page.goto(`/en/documents/${id}?doc=deposit_receipt`);
      await expect(page.locator(".document h1")).toHaveText("Deposit transfer receipt and acknowledgement");
      await page.goto(`/en/documents/${id}`);
      await expect(page.locator(".documents-index .profile-list li")).toHaveCount(8);
      expect(errors).toEqual([]);
    } finally {
      await api(`/rest/v1/listing_requests?listing_id=eq.${listingId}`, { token: admin, method: "DELETE" });
      await api(`/rest/v1/rental_fees?listing_id=eq.${listingId}`, { token: admin, method: "DELETE" });
      await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "DELETE" });
    }
  });
});

test("the platform agreements can be read by anyone", async ({ page }) => {
  for (const type of ["guest", "host"]) {
    await page.goto(`/ar/agreements/${type}`);
    await expect(page.locator(".document h1")).toBeVisible();
    await expect(page.locator(".document-draft")).toBeVisible();
  }
});
