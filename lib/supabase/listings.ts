import type { SupabaseClient } from "@supabase/supabase-js";
import type { Property } from "@/types";

export type MarketplaceListing = {
  id: string;
  owner_id: string;
  title_ar: string;
  title_en: string;
  description_ar: string;
  description_en: string;
  area: string;
  university: string;
  gender: Property["gender"];
  property_type: Property["property_type"];
  monthly_price: number;
  deposit: number;
  furnished: boolean;
  wifi: boolean;
  air_conditioning: boolean;
  security: boolean;
  available_beds: number;
  total_beds: number;
  walking_distance_minutes: number;
  whatsapp_number: string;
  image_url: string;
  image_urls: string[];
  verified: boolean;
  verified_at: string | null;
  rejection_reason: string | null;
  status: "pending" | "approved" | "rejected" | "paused";
  created_at: string;
  updated_at: string;
};

/** Columns that are safe to show to anyone. Excludes owner_id and review notes. */
export const PUBLIC_LISTING_COLUMNS =
  "id,title_ar,title_en,description_ar,description_en,area,university,gender,property_type,monthly_price,deposit,furnished,wifi,air_conditioning,security,available_beds,total_beds,walking_distance_minutes,whatsapp_number,image_url,image_urls,verified,verified_at,status,created_at,updated_at";

export const LISTINGS_PAGE_SIZE = 12;

export type ListingSort = "newest" | "price_asc" | "price_desc";

export const AMENITY_FILTERS = ["furnished", "wifi", "air_conditioning", "security"] as const;
export type AmenityFilter = (typeof AMENITY_FILTERS)[number];

export type ListingFilters = {
  university: string;
  area: string;
  gender: string;
  propertyType: string;
  maxPrice: string;
  amenities: AmenityFilter[];
  sort: ListingSort;
};

export const EMPTY_FILTERS: ListingFilters = {
  university: "",
  area: "",
  gender: "",
  propertyType: "",
  maxPrice: "",
  amenities: [],
  sort: "newest",
};

export function hasActiveFilters(filters: ListingFilters) {
  return Boolean(filters.university || filters.area || filters.gender || filters.propertyType || filters.maxPrice || filters.amenities.length);
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Other approved listings near the same university, for "More homes near…" on a listing page. */
export async function fetchSimilarListings(client: SupabaseClient, listing: Pick<Property, "id" | "university">, limit = 3) {
  const { data, error } = await client
    .from("properties")
    .select(PUBLIC_LISTING_COLUMNS)
    .eq("status", "approved")
    .eq("university", listing.university)
    .neq("id", listing.id)
    .order("verified", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) console.error("Could not load similar listings:", error);
  return ((data ?? []) as unknown as MarketplaceListing[]).map(toProperty);
}

/** Published listings by id (for the visitor's saved homes), in the order given; unpublished ones are left out. */
export async function fetchListingsByIds(client: SupabaseClient, ids: string[]) {
  const valid = ids.filter((id) => UUID_PATTERN.test(id)).slice(0, 100);
  if (!valid.length) return { listings: [] as Property[], error: null };
  const { data, error } = await client
    .from("properties")
    .select(PUBLIC_LISTING_COLUMNS)
    .eq("status", "approved")
    .in("id", valid);
  const byId = new Map(((data ?? []) as unknown as MarketplaceListing[]).map((listing) => [listing.id, toProperty(listing)]));
  return { listings: valid.flatMap((id) => byId.get(id) ?? []), error };
}

/** Runs the public feed query with filtering, sorting and pagination done by the database. */
export async function fetchApprovedListings(
  client: SupabaseClient,
  filters: ListingFilters,
  page: number,
): Promise<{ listings: Property[]; total: number; error: unknown }> {
  let query = client
    .from("properties")
    .select(PUBLIC_LISTING_COLUMNS, { count: "exact" })
    .eq("status", "approved");

  if (filters.university) query = query.eq("university", filters.university);
  if (filters.area) query = query.eq("area", filters.area);
  if (filters.gender) query = query.eq("gender", filters.gender);
  if (filters.propertyType) query = query.eq("property_type", filters.propertyType);
  const maxPrice = Number(filters.maxPrice);
  if (filters.maxPrice && Number.isFinite(maxPrice) && maxPrice > 0) query = query.lte("monthly_price", maxPrice);
  for (const amenity of filters.amenities) query = query.eq(amenity, true);

  if (filters.sort === "price_asc") query = query.order("monthly_price", { ascending: true });
  else if (filters.sort === "price_desc") query = query.order("monthly_price", { ascending: false });
  query = query.order("created_at", { ascending: false });

  const from = page * LISTINGS_PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + LISTINGS_PAGE_SIZE - 1);

  return {
    listings: ((data ?? []) as unknown as MarketplaceListing[]).map(toProperty),
    total: count ?? 0,
    error,
  };
}

export function listingImages(listing: Pick<MarketplaceListing, "image_url" | "image_urls">) {
  return listing.image_urls?.length ? listing.image_urls : [listing.image_url].filter(Boolean);
}

export function toProperty(listing: MarketplaceListing): Property {
  const now = new Date().toISOString();

  return {
    id: listing.id,
    title_ar: listing.title_ar,
    title_en: listing.title_en,
    description_ar: listing.description_ar,
    description_en: listing.description_en,
    city: "Giza",
    area: listing.area,
    university: listing.university,
    gender: listing.gender,
    property_type: listing.property_type,
    monthly_price: listing.monthly_price,
    deposit: listing.deposit,
    furnished: listing.furnished,
    wifi: listing.wifi,
    private_bathroom: false,
    washing_machine: false,
    air_conditioning: listing.air_conditioning,
    parking: false,
    kitchen: false,
    security: listing.security,
    available_beds: listing.available_beds,
    total_beds: listing.total_beds,
    verification_status: listing.verified ? "verified" : "pending",
    verified_at: listing.verified_at ?? null,
    walking_distance_minutes: listing.walking_distance_minutes,
    address_text: `${listing.area}, Giza, Egypt`,
    whatsapp_number: listing.whatsapp_number,
    phone_number: listing.whatsapp_number,
    images: listingImages(listing),
    amenities: [
      ...(listing.wifi ? ["Wi-Fi"] : []),
      ...(listing.furnished ? ["Furnished"] : []),
      ...(listing.air_conditioning ? ["Air Conditioning"] : []),
      ...(listing.security ? ["Security"] : []),
    ],
    rules: [],
    created_at: listing.created_at || now,
    updated_at: listing.updated_at || listing.created_at || now,
  };
}
