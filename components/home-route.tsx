import HomePage from "@/components/home-page";
import { fetchApprovedListings, filtersFromParams } from "@/lib/supabase/listings";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { SiteLocale } from "@/messages/site";

export type HomeSearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Server-renders the first page of approved listings (with any search from the address) so they load instantly. */
export default async function HomeRoute({ locale, searchParams }: { locale: SiteLocale; searchParams: HomeSearchParams }) {
  const params = await searchParams;
  const filters = filtersFromParams(params);
  const saved = params.saved === "1";
  // A new search in the address (e.g. from the header on another page) starts a fresh home page.
  const key = new URLSearchParams(Object.entries(params).flatMap(([name, value]) => (typeof value === "string" ? [[name, value]] : []))).toString();

  const client = getSupabaseServerClient();
  if (!client) {
    return <HomePage key={key} locale={locale} initialListings={null} initialTotal={0} initialError={false} initialFilters={filters} initialSaved={saved} />;
  }

  const { listings, total, error } = await fetchApprovedListings(client, filters, 0);
  if (error) console.error("Could not load published listings:", error);

  return <HomePage key={key} locale={locale} initialListings={listings} initialTotal={total} initialError={Boolean(error)} initialFilters={filters} initialSaved={saved} />;
}
