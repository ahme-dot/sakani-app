import { adminToken, api, guestSession, hasAdmin, sampleListing } from "./helpers";

// Seeds two published test listings (the first one verified) when admin login is available.
export default async function globalSetup() {
  if (!hasAdmin) {
    console.log("SAKANI_ADMIN_EMAIL / SAKANI_ADMIN_PASSWORD not set: tests that need listings or admin are skipped.");
    return;
  }
  const token = await adminToken();
  await api("/rest/v1/properties?title_en=like.*E2E%20TEST*", { token, method: "DELETE" });
  const owner = await guestSession();
  const titles = ["Quiet room in Dokki", "Bed in a quiet residence"];
  for (const [index, title] of titles.entries()) {
    const created = await api<Array<{ id: string }>>("/rest/v1/properties?select=id", {
      token: owner.access_token, method: "POST", body: sampleListing(owner.user.id, title),
    });
    await api(`/rest/v1/properties?id=eq.${created.data[0].id}`, { token, method: "PATCH", body: { status: "approved", verified: index === 0 } });
  }
}
