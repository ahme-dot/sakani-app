import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { getApprovedListingIds } from "@/lib/supabase/server";

// Rebuild hourly so newly approved listings are discoverable.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const listings = await getApprovedListingIds();
  const bilingual = (path: string) => ({
    languages: { ar: `${SITE_URL}/ar${path}`, en: `${SITE_URL}/en${path}` },
  });

  return [
    { url: `${SITE_URL}/ar`, changeFrequency: "daily", priority: 1, alternates: bilingual("") },
    { url: `${SITE_URL}/en`, changeFrequency: "daily", priority: 0.9, alternates: bilingual("") },
    ...(["host", "help"] as const).flatMap((page) => (["ar", "en"] as const).map((locale) => ({
      url: `${SITE_URL}/${locale}/${page}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
      alternates: bilingual(`/${page}`),
    }))),
    ...(["privacy", "terms"] as const).flatMap((page) => (["ar", "en"] as const).map((locale) => ({
      url: `${SITE_URL}/${locale}/${page}`,
      changeFrequency: "yearly" as const,
      priority: 0.2,
      alternates: bilingual(`/${page}`),
    }))),
    ...listings.flatMap((listing) => (["ar", "en"] as const).map((locale) => ({
      url: `${SITE_URL}/${locale}/listings/${listing.id}`,
      lastModified: listing.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.7,
      alternates: bilingual(`/listings/${listing.id}`),
    }))),
  ];
}
