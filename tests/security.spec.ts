import { expect, test } from "@playwright/test";
import { SUPABASE_KEY, adminToken, api, guestSession, hasAdmin, sampleListing } from "./helpers";

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
