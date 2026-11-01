"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SiteLocale } from "@/messages/site";

/**
 * Bookings and payments keep the title the listing had when they were made (in English).
 * This loads each listing's current title in the page's language; anything it can't read
 * (a listing that was removed, or one this person may not see) keeps the saved title.
 */
export function useListingTitles(supabase: SupabaseClient | null, ids: Array<string | null | undefined>, locale: SiteLocale) {
  const key = [...new Set(ids.filter((id): id is string => Boolean(id)))].sort().join(",");
  const [titles, setTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!supabase || !key) return;
    let active = true;
    void supabase.from("properties").select("id,title_ar,title_en").in("id", key.split(",")).then(({ data }) => {
      if (!active || !data) return;
      setTitles(Object.fromEntries((data as Array<{ id: string; title_ar: string; title_en: string }>).map((row) => [row.id, locale === "ar" ? row.title_ar : row.title_en])));
    });
    return () => {
      active = false;
    };
  }, [supabase, key, locale]);

  return (listingId: string | null | undefined, saved: string) => (listingId && titles[listingId]) || saved;
}
