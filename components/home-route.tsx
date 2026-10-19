import HomePage from "@/components/home-page";
import { EMPTY_FILTERS, fetchApprovedListings } from "@/lib/supabase/listings";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { SiteLocale } from "@/messages/site";

/** Server-renders the first page of approved listings so they are visible to search engines and load instantly. */
export default async function HomeRoute({ locale }: { locale: SiteLocale }) {
  const client = getSupabaseServerClient();
  if (!client) {
    return <HomePage locale={locale} initialListings={null} initialTotal={0} initialError={false} />;
  }

  const { listings, total, error } = await fetchApprovedListings(client, EMPTY_FILTERS, 0);
  if (error) console.error("Could not load published listings:", error);

  return <HomePage locale={locale} initialListings={listings} initialTotal={total} initialError={Boolean(error)} />;
}
