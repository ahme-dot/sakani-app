import { SUPABASE_KEY, SUPABASE_URL, adminToken, api, hasAdmin } from "./helpers";

const BUCKET = "sakani-listings";

// Removes every listing the tests created, and the photos uploaded for them.
export default async function globalTeardown() {
  if (!hasAdmin) return;
  const token = await adminToken();
  const { data } = await api<Array<{ image_urls: string[] | null }>>("/rest/v1/properties?title_en=like.*E2E%20TEST*&select=image_urls", { token });
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const paths = (data ?? []).flatMap((row) => row.image_urls ?? []).filter((url) => url.includes(marker)).map((url) => url.split(marker)[1]);
  if (paths.length) await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
  });
  await api("/rest/v1/properties?title_en=like.*E2E%20TEST*", { token, method: "DELETE" });
}
