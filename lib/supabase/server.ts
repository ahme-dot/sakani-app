import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import type { Property } from "@/types";
import { PUBLIC_LISTING_COLUMNS, UUID_PATTERN, toProperty, type MarketplaceListing } from "@/lib/supabase/listings";

/** A session-less client for reading public data on the server. Row-level security limits it to approved listings. */
export function getSupabaseServerClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

/** Loads one approved listing; cached per request so the page and its metadata share one query. */
export const getApprovedListing = cache(async (id: string): Promise<Property | null> => {
  if (!UUID_PATTERN.test(id)) return null;
  const client = getSupabaseServerClient();
  if (!client) return null;

  const { data, error } = await client
    .from("properties")
    .select(PUBLIC_LISTING_COLUMNS)
    .eq("id", id)
    .eq("status", "approved")
    .maybeSingle();

  if (error) {
    console.error("Could not load listing:", error);
    return null;
  }
  return data ? toProperty(data as unknown as MarketplaceListing) : null;
});

export async function getApprovedListingIds(): Promise<Array<{ id: string; updated_at: string }>> {
  const client = getSupabaseServerClient();
  if (!client) return [];

  const { data, error } = await client
    .from("properties")
    .select("id,updated_at")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    console.error("Could not load listings for the sitemap:", error);
    return [];
  }
  return data ?? [];
}
