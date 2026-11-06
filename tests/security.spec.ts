import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, SUPABASE_KEY, adminToken, api, guestSession, hasAdmin, sampleListing, testHost } from "./helpers";

// Database rules, checked straight against Supabase (no browser).
test.describe("database rules", () => {
  test("visitors cannot read private tables", async () => {
    for (const table of ["listing_verifications", "contact_messages", "listing_reports", "listing_events", "listing_transfers"]) {
      const { status, data } = await api<unknown[]>(`/rest/v1/${table}?select=*&limit=1`);
      expect(status >= 400 || (Array.isArray(data) && data.length === 0), table).toBeTruthy();
    }
    const directory = await api("/rest/v1/rpc/admin_user_directory", { method: "POST", body: {} });
    expect(directory.status).toBeGreaterThanOrEqual(400);
  });

  test("owners cannot publish or verify their own listing", async () => {
    const owner = await guestSession();
    const created = await api<Array<{ id: string; status: string; verified: boolean; verified_at: string | null }>>(
      "/rest/v1/properties?select=id,status,verified,verified_at",
      { token: owner.access_token, method: "POST", body: sampleListing(owner.user.id, "Self-verify attempt", { status: "approved", verified: true, verified_at: "2026-01-01T00:00:00Z" }) },
    );
    const row = created.data[0];
    try {
      expect(row.status).toBe("pending");
      expect(row.verified).toBe(false);
      expect(row.verified_at).toBeNull();
      const patch = await api<unknown[]>(`/rest/v1/properties?id=eq.${row.id}&select=status`, { token: owner.access_token, method: "PATCH", body: { status: "approved" } });
      expect((patch.data as Array<{ status: string }>)?.[0]?.status ?? "pending").toBe("pending");
    } finally {
      await api(`/rest/v1/properties?id=eq.${row.id}`, { token: owner.access_token, method: "DELETE" });
    }
  });

  test("owners pause, resume and confirm only their own published listing", async () => {
    test.skip(!hasAdmin, "needs admin login to publish the test listing");
    const admin = await adminToken();
    const owner = await guestSession();
    const stranger = await guestSession();
    const created = await api<Array<{ id: string }>>("/rest/v1/properties?select=id", {
      token: owner.access_token, method: "POST", body: sampleListing(owner.user.id, "Availability rules"),
    });
    const id = created.data[0].id;
    const rpc = (name: string, body: Record<string, unknown>, token: string) => api(`/rest/v1/rpc/${name}`, { token, method: "POST", body });
    const isPublic = async () => ((await api<unknown[]>(`/rest/v1/properties?id=eq.${id}&select=id`)).data as unknown[]).length === 1;
    try {
      expect((await rpc("owner_set_listing_paused", { target_listing: id, pause: false }, owner.access_token)).status).toBeGreaterThanOrEqual(400);
      await api(`/rest/v1/properties?id=eq.${id}`, { token: admin, method: "PATCH", body: { status: "approved" } });
      expect(await isPublic()).toBe(true);

      expect((await rpc("owner_set_listing_paused", { target_listing: id, pause: true }, stranger.access_token)).status).toBeGreaterThanOrEqual(400);
      expect((await rpc("confirm_listing", { target_listing: id }, stranger.access_token)).status).toBeGreaterThanOrEqual(400);
      expect((await rpc("owner_set_listing_paused", { target_listing: id, pause: true }, SUPABASE_KEY)).status).toBeGreaterThanOrEqual(400);

      expect((await rpc("confirm_listing", { target_listing: id }, owner.access_token)).status).toBe(200);
      expect((await rpc("owner_set_listing_paused", { target_listing: id, pause: true }, owner.access_token)).data).toBe("paused");
      expect(await isPublic()).toBe(false);
      expect((await rpc("owner_set_listing_paused", { target_listing: id, pause: false }, owner.access_token)).data).toBe("approved");
      expect(await isPublic()).toBe(true);
    } finally {
      await api(`/rest/v1/properties?id=eq.${id}`, { token: admin, method: "DELETE" });
    }
  });
});

// Fixes from the 2026-11-05 review (migration 20261109000000).
test.describe("security fixes", () => {
  test.skip(!hasAdmin, "needs admin login");

  test("only admins run the release; a password without the two-step code is not an admin", async () => {
    const admin = await adminToken();
    const ready = await api("/rest/v1/rpc/admin_release_ended_rentals", { token: admin, method: "POST", body: {} });
    test.skip(ready.status === 404, "migration 20261109000000 not installed yet");
    expect(ready.status).toBe(200);
    const stranger = await guestSession();
    expect((await api("/rest/v1/rpc/release_ended_rentals", { method: "POST", body: {} })).status).toBeGreaterThanOrEqual(400);
    expect((await api("/rest/v1/rpc/release_ended_rentals", { token: stranger.access_token, method: "POST", body: {} })).status).toBeGreaterThanOrEqual(400);
    expect((await api("/rest/v1/rpc/admin_release_ended_rentals", { token: stranger.access_token, method: "POST", body: {} })).status).toBeGreaterThanOrEqual(400);
    expect((await api("/rest/v1/rpc/expire_unpaid_bookings_job", { token: stranger.access_token, method: "POST", body: {} })).status).toBeGreaterThanOrEqual(400);

    // A pending listing: the full admin sees it, a password-only admin session doesn't.
    const owner = await guestSession();
    const created = await api<Array<{ id: string }>>("/rest/v1/properties?select=id", {
      token: owner.access_token, method: "POST", body: sampleListing(owner.user.id, "Two-step rule"),
    });
    const id = created.data[0].id;
    try {
      const seen = async (token: string) => ((await api<unknown[]>(`/rest/v1/properties?id=eq.${id}&select=id`, { token })).data as unknown[]).length;
      expect(await seen(admin)).toBe(1);
      const passwordOnly = await api<{ access_token: string }>("/auth/v1/token?grant_type=password", {
        method: "POST", body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
      const factors = await api<{ factors?: Array<{ status: string }> }>("/auth/v1/user", { token: passwordOnly.data.access_token });
      if (factors.data.factors?.some((factor) => factor.status === "verified")) {
        expect(await seen(passwordOnly.data.access_token)).toBe(0);
        const edit = await api<unknown[]>(`/rest/v1/properties?id=eq.${id}&select=id`, { token: passwordOnly.data.access_token, method: "PATCH", body: { title_en: "Changed" } });
        expect((edit.data as unknown[] | null)?.length ?? 0).toBe(0);
      }
    } finally {
      await api(`/rest/v1/properties?id=eq.${id}`, { token: admin, method: "DELETE" });
    }
  });

  test("a guest can hold at most 2 unpaid bookings", async () => {
    const admin = await adminToken();
    const ready = await api("/rest/v1/rpc/admin_release_ended_rentals", { token: admin, method: "POST", body: {} });
    test.skip(ready.status === 404, "migration 20261109000000 not installed yet");
    const me = (await api<{ id: string }>("/auth/v1/user", { token: admin })).data.id;
    const saved = (await api<Array<{ role: string; phone: string }>>(`/rest/v1/profiles?select=role,phone&id=eq.${me}`, { token: admin })).data?.[0] ?? null;
    await api(`/rest/v1/profiles?id=eq.${me}`, { token: admin, method: "PATCH", body: { role: "guest", phone: saved?.phone || "01000000009" } });
    const listings: string[] = [];
    try {
      const owner = await guestSession();
      const host = await testHost();
      for (let i = 0; i < 3; i += 1) {
        const created = await api<Array<{ id: string }>>("/rest/v1/properties?select=id", {
          token: owner.access_token, method: "POST", body: sampleListing(owner.user.id, `Unpaid limit ${i}`, { property_type: "studio" }),
        });
        listings.push(created.data[0].id);
        await api(`/rest/v1/properties?id=eq.${created.data[0].id}`, { token: admin, method: "PATCH", body: { status: "approved", owner_id: host.user.id } });
      }
      const book = (listing: string) => api("/rest/v1/rpc/guest_create_booking", {
        token: admin, method: "POST", body: { target_listing: listing, move_in_date: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10), stay_months: 1, people: 1, guest_note: "E2E" },
      });
      const results = [];
      for (const listing of listings) results.push(await book(listing));
      const refused = results.find((result) => result.status >= 400);
      test.skip(JSON.stringify(refused?.data ?? "").includes("request_limit"), "hourly booking limit reached by other tests");
      expect(refused, "the third unpaid booking is refused").toBeTruthy();
      expect(JSON.stringify(refused?.data)).toContain("too_many_unpaid");
    } finally {
      for (const listing of listings) {
        await api(`/rest/v1/listing_requests?listing_id=eq.${listing}`, { token: admin, method: "DELETE" });
        await api(`/rest/v1/rental_fees?listing_id=eq.${listing}`, { token: admin, method: "DELETE" });
        await api(`/rest/v1/properties?id=eq.${listing}`, { token: admin, method: "DELETE" });
      }
      if (saved) await api(`/rest/v1/profiles?id=eq.${me}`, { token: admin, method: "PATCH", body: saved });
    }
  });
});
