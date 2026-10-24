import { expect, test } from "@playwright/test";
import { SUPABASE_KEY, SUPABASE_URL, adminToken, api, guestSession, hasAdmin, sampleListing } from "./helpers";

// Sakani as middleman: students contact the team, owner numbers stay private, a rental creates fees on both sides.
test.describe("visit requests", () => {
  test("a student requests a visit from the listing page", async ({ page }) => {
    test.skip(!hasAdmin, "needs admin login to read and clean up the request");
    const admin = await adminToken();
    const ready = await api("/rest/v1/listing_requests?select=id&limit=1", { token: admin });
    test.skip(ready.status >= 400, "middleman migration not installed yet");

    await page.goto("/en");
    const link = page.locator(".property-title a", { hasText: "E2E TEST" }).first();
    test.skip(await link.count() === 0, "no test listing published");
    await page.goto((await link.getAttribute("href"))!);

    // The contact button goes to the Sakani team with the home reference, never to the owner.
    const ask = page.locator(".listing2-whatsapp");
    if (await ask.count()) {
      const href = decodeURIComponent((await ask.getAttribute("href")) ?? "");
      expect(href).not.toContain("01000000000");
      expect(href).toMatch(/SK-[0-9A-F]{6}/);
    }
    expect(await page.content()).not.toContain("01000000000");

    await page.locator(".request-visit summary").click();
    await page.fill("#request-name", "E2E Student");
    await page.fill("#request-contact", "01112223334");
    await page.fill("#request-time", "Saturday afternoon");
    await page.locator(".request-visit button[type=submit]").click();
    await expect(page.locator(".request-sent")).toBeVisible();

    const saved = await api<Array<{ status: string; name: string }>>("/rest/v1/listing_requests?select=status,name&name=eq.E2E%20Student", { token: admin });
    expect(saved.data[0]).toEqual({ status: "new", name: "E2E Student" });
  });

  test("visitors cannot read requests; marking a request rented creates both fees", async () => {
    test.skip(!hasAdmin, "needs admin login");
    const admin = await adminToken();
    const ready = await api("/rest/v1/listing_requests?select=id&limit=1", { token: admin });
    test.skip(ready.status >= 400, "middleman migration not installed yet");

    const owner = await guestSession();
    const created = await api<Array<{ id: string }>>("/rest/v1/properties?select=id", {
      token: owner.access_token, method: "POST", body: sampleListing(owner.user.id, "Request flow", { monthly_price: 4000 }),
    });
    const listingId = created.data[0].id;
    try {
      await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "PATCH", body: { status: "approved" } });

      // Anyone can send a request; nobody but admins can read it back.
      const sent = await api<Array<{ id: string }>>("/rest/v1/listing_requests?select=id", {
        token: admin, method: "POST",
        body: { listing_id: listingId, listing_title: "[E2E TEST] Request flow", name: "E2E Student", contact: "01112223334", locale: "en" },
      });
      const requestId = sent.data[0].id;
      // Like the site's form: insert without asking for the row back (visitors may not read requests).
      const anonInsert = await fetch(`${SUPABASE_URL}/rest/v1/listing_requests`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ listing_id: listingId, listing_title: "[E2E TEST] Request flow", name: "E2E Visitor", contact: "01112223335", locale: "en" }),
      });
      expect(anonInsert.status).toBeLessThan(300);
      const anonRead = await api<unknown[]>("/rest/v1/listing_requests?select=id", { token: SUPABASE_KEY });
      expect(anonRead.status >= 400 || (anonRead.data as unknown[]).length === 0).toBeTruthy();
      const ownerRead = await api<unknown[]>("/rest/v1/listing_requests?select=id", { token: owner.access_token });
      expect(ownerRead.status >= 400 || (ownerRead.data as unknown[]).length === 0).toBeTruthy();

      // Only admins can close a request; doing so creates the owner fee and the student fee.
      const byOwner = await api(`/rest/v1/rpc/admin_close_request`, { token: owner.access_token, method: "POST", body: { target_request: requestId } });
      expect(byOwner.status).toBeGreaterThanOrEqual(400);
      const closed = await api<{ owner_fee: number; student_fee: number }>(`/rest/v1/rpc/admin_close_request`, { token: admin, method: "POST", body: { target_request: requestId } });
      expect(closed.status).toBe(200);

      const settings = (await api<Array<Record<string, number>>>("/rest/v1/app_settings?select=fee_percent,fee_minimum,student_fee_percent,student_fee_minimum&id=eq.1")).data[0];
      expect(closed.data.owner_fee).toBe(Math.max(Number(settings.fee_minimum), Math.round((4000 * Number(settings.fee_percent)) / 100)));
      expect(closed.data.student_fee).toBe(Math.max(Number(settings.student_fee_minimum), Math.round((4000 * Number(settings.student_fee_percent)) / 100)));

      const fees = await api<Array<{ payer: string }>>(`/rest/v1/rental_fees?select=payer&request_id=eq.${requestId}&order=payer`, { token: admin });
      expect(fees.data.map((fee) => fee.payer)).toEqual(["owner", "student"]);
      // Owners only see their own fee, never the student's.
      const ownerFees = await api<Array<{ payer: string }>>(`/rest/v1/rental_fees?select=payer&request_id=eq.${requestId}`, { token: owner.access_token });
      expect(ownerFees.data.map((fee) => fee.payer)).toEqual(["owner"]);

      // Closing twice does not create more fees.
      await api(`/rest/v1/rpc/admin_close_request`, { token: admin, method: "POST", body: { target_request: requestId } });
      expect((await api<unknown[]>(`/rest/v1/rental_fees?select=id&request_id=eq.${requestId}`, { token: admin })).data).toHaveLength(2);
    } finally {
      await api(`/rest/v1/rental_fees?listing_id=eq.${listingId}`, { token: admin, method: "DELETE" });
      await api(`/rest/v1/listing_requests?listing_id=eq.${listingId}`, { token: admin, method: "DELETE" });
      await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "DELETE" });
    }
  });

  test("owner phone numbers are private", async () => {
    test.skip(!hasAdmin, "needs admin login");
    const admin = await adminToken();
    const hidden = await api("/rest/v1/properties?select=whatsapp_number&limit=1");
    test.skip(hidden.status < 400, "private-numbers migration (20261030010000) not installed yet");
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
});
