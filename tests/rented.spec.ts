import { expect, test } from "@playwright/test";
import { SUPABASE_KEY, adminToken, api, guestSession, hasAdmin, sampleListing } from "./helpers";

// Rented places (migration 20261108000000): "rented until" a date, out of the search but the page stays
// open, back in the search by itself once the date passes (with a notice to the owner), or earlier by
// hand. Plus the new amenities and the dates the admin sees.

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

test.describe("rented places", () => {
  test.skip(!hasAdmin, "needs admin login");

  test("rented until a date, page still open, back in the search on its own", async ({ page }) => {
    const admin = await adminToken();
    const ready = await api("/rest/v1/rpc/admin_release_ended_rentals", { token: admin, method: "POST", body: {} });
    test.skip(ready.status >= 400, "migration 20261108000000 not installed yet");

    const owner = await guestSession();
    const created = await api<Array<{ id: string }>>("/rest/v1/properties?select=id", {
      token: owner.access_token, method: "POST",
      body: sampleListing(owner.user.id, "Rented cycle", { kitchen: true, fridge: false, furnished: true, published_at: "2020-01-01T00:00:00Z" }),
    });
    const id = created.data[0].id;
    const place = async () => (await api<Array<Record<string, unknown>>>(`/rest/v1/properties?id=eq.${id}&select=status,rented_until,rented_source,published_at,available_since,kitchen,fridge,furnished`, { token: admin })).data[0];
    const rpc = (name: string, body: Record<string, unknown>, token: string) => api<Record<string, unknown>>(`/rest/v1/rpc/${name}`, { token, method: "POST", body });
    try {
      // The owner can't set the dates themselves; publishing sets them.
      expect((await place()).published_at).toBeNull();
      await api(`/rest/v1/properties?id=eq.${id}`, { token: admin, method: "PATCH", body: { status: "approved" } });
      const published = await place();
      expect(published).toMatchObject({ status: "approved", kitchen: true, fridge: false, furnished: true });
      expect(published.published_at).not.toBeNull();
      expect(published.available_since).not.toBeNull();

      // New amenities are searchable.
      expect((await api<unknown[]>(`/rest/v1/properties?id=eq.${id}&kitchen=eq.true&select=id`)).data).toHaveLength(1);
      expect((await api<unknown[]>(`/rest/v1/properties?id=eq.${id}&fridge=eq.true&select=id`)).data).toHaveLength(0);

      // Rented outside Sakani until a date: no past dates, then out of the search but still readable.
      expect((await rpc("owner_report_rental", { target_listing: id, via_sakani: false, rented_until: day(-1) }, owner.access_token)).status).toBeGreaterThanOrEqual(400);
      expect((await rpc("owner_report_rental", { target_listing: id, via_sakani: false, rented_until: day(10) }, owner.access_token)).status).toBe(200);
      expect(await place()).toMatchObject({ status: "rented", rented_until: day(10), rented_source: "owner" });
      expect((await api<unknown[]>(`/rest/v1/properties?id=eq.${id}&status=eq.approved&select=id`, { token: SUPABASE_KEY })).data).toHaveLength(0);
      expect((await api<Array<{ status: string }>>(`/rest/v1/properties?id=eq.${id}&select=status`, { token: SUPABASE_KEY })).data[0].status).toBe("rented");

      // Reporting a rental costs nothing: the old success fee is gone, even on the old "via Sakani" path.
      expect((await rpc("owner_report_rental", { target_listing: id, via_sakani: true, rented_until: day(10) }, owner.access_token)).status).toBe(200);
      expect((await api<unknown[]>(`/rest/v1/rental_fees?listing_id=eq.${id}&select=id`, { token: admin })).data).toHaveLength(0);

      // Its page opens for visitors with "Rented until" and no booking form.
      await page.goto(`/en/listings/${id}`);
      await expect(page.locator(".listing-rented-banner")).toContainText("Rented until");
      await expect(page.locator("input[name=move_in], .sakani-date-display")).toHaveCount(0);

      // Nobody else can put it back; the daily job leaves it while the date hasn't passed.
      const stranger = await guestSession();
      expect((await rpc("release_listing", { target_listing: id }, stranger.access_token)).status).toBeGreaterThanOrEqual(400);
      await rpc("admin_release_ended_rentals", {}, admin);
      expect((await place()).status).toBe("rented");

      // The date passes: the daily job brings it back and tells the owner.
      await api(`/rest/v1/properties?id=eq.${id}`, { token: admin, method: "PATCH", body: { rented_until: day(0) } });
      await rpc("admin_release_ended_rentals", {}, admin);
      expect(await place()).toMatchObject({ status: "approved", rented_until: null, rented_source: null });
      const notices = await api<Array<{ kind: string }>>("/rest/v1/notifications?select=kind&kind=eq.listing_available", { token: owner.access_token });
      expect(notices.data.length).toBeGreaterThanOrEqual(1);

      // Rented again, then the tenant leaves early: the owner puts it back by hand.
      expect((await rpc("owner_report_rental", { target_listing: id, via_sakani: false, rented_until: day(30) }, owner.access_token)).status).toBe(200);
      expect((await rpc("release_listing", { target_listing: id }, owner.access_token)).status).toBeLessThan(300);
      expect((await place()).status).toBe("approved");
    } finally {
      await api(`/rest/v1/rental_fees?listing_id=eq.${id}`, { token: admin, method: "DELETE" });
      await api(`/rest/v1/notifications?data->>listing_id=eq.${id}`, { token: admin, method: "DELETE" });
      await api(`/rest/v1/properties?id=eq.${id}`, { token: admin, method: "DELETE" });
    }
  });
});
