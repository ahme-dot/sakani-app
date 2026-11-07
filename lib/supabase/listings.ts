import type { SupabaseClient } from "@supabase/supabase-js";
import type { Property } from "@/types";
import { AMENITIES, AMENITY_KEYS, type AmenityKey } from "@/lib/amenities";

export type MarketplaceListing = {
  id: string;
  owner_id: string;
  title_ar: string;
  title_en: string;
  description_ar: string;
  description_en: string;
  governorate: string;
  area: string;
  university: string;
  gender: Property["gender"];
  property_type: Property["property_type"];
  monthly_price: number;
  deposit: number;
  furnished: boolean | null;
  wifi: boolean;
  air_conditioning: boolean;
  security: boolean;
  /** Added 2026-11-05: null on older places until the owner says. */
  kitchen?: boolean | null;
  washing_machine?: boolean | null;
  fridge?: boolean | null;
  water_heater?: boolean | null;
  elevator?: boolean | null;
  available_beds: number;
  total_beds: number;
  walking_distance_minutes: number;
  /** Private: only the owner and admins can read it (see listing_private_contacts). */
  whatsapp_number?: string;
  image_url: string;
  image_urls: string[];
  verified: boolean;
  verified_at: string | null;
  is_demo?: boolean;
  bedrooms?: number | null;
  bathrooms?: number | null;
  area_sqm?: number | null;
  min_months?: number;
  available_from?: string | null;
  /** While rented: the day it becomes free again. */
  rented_until?: string | null;
  /** First time it was published, and the last time it became free (for the admin). */
  published_at?: string | null;
  available_since?: string | null;
  rejection_reason: string | null;
  status: ListingStatus;
  created_at: string;
  updated_at: string;
};

/** Published listings are "approved"; reserved / rented / suspended / paused ones are hidden from search. */
export type ListingStatus = "pending" | "approved" | "rejected" | "paused" | "reserved" | "rented" | "suspended";
/** Hidden from search but kept: the admin "Paused" tab shows all of these. */
export const HIDDEN_STATUSES = ["paused", "reserved", "rented", "suspended"] as const;

/** Columns that are safe to show to anyone. Excludes owner_id and review notes. */
export const PUBLIC_LISTING_COLUMNS =
  "id,title_ar,title_en,description_ar,description_en,governorate,area,university,gender,property_type,monthly_price,deposit,furnished,wifi,air_conditioning,security,available_beds,total_beds,walking_distance_minutes,image_url,image_urls,verified,verified_at,is_demo,bedrooms,bathrooms,area_sqm,min_months,available_from,status,created_at,updated_at,kitchen,washing_machine,fridge,water_heater,elevator,rented_until,published_at,available_since";

/** The same without the long descriptions: everything a card shows (up to 4,000 fewer characters per card). */
export const CARD_LISTING_COLUMNS = PUBLIC_LISTING_COLUMNS.replace(",description_ar,description_en", "");

/** What an owner can change on a published or paused place without a new review (properties_guard has the same list). */
const NO_REVIEW_FIELDS: readonly string[] = ["monthly_price", "deposit", "available_from", "min_months", "available_beds", ...AMENITY_KEYS];

/** Would saving these values send this published or paused place back to review? */
export function editNeedsReview(listing: Record<string, unknown>, values: Record<string, unknown>) {
  if (listing.status !== "approved" && listing.status !== "paused") return false;
  return Object.entries(values).some(([key, value]) => key !== "status" && !NO_REVIEW_FIELDS.includes(key) && JSON.stringify(value ?? null) !== JSON.stringify(listing[key] ?? null));
}

/** Short reference guests quote to the Sakani team, e.g. "SK-3F9A2C". */
export function listingRef(id: string) {
  return `SK-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/** Owner phone numbers for listings the signed-in user owns (or all, for admins). */
export async function fetchPrivateContacts(client: SupabaseClient, ids: string[]) {
  if (!ids.length) return {} as Record<string, string>;
  const { data, error } = await client.rpc("listing_private_contacts", { listing_ids: ids });
  if (error) {
    console.error("Could not load owner numbers:", error);
    return {} as Record<string, string>;
  }
  return Object.fromEntries(((data ?? []) as Array<{ listing_id: string; whatsapp_number: string }>).map((row) => [row.listing_id, row.whatsapp_number]));
}

export const LISTINGS_PAGE_SIZE = 12;

export type ListingSort = "newest" | "price_asc" | "price_desc";

export const AMENITY_FILTERS = ["furnished", "wifi", "air_conditioning", "kitchen", "washing_machine", "fridge", "water_heater", "elevator", "security"] as const satisfies readonly AmenityKey[];
export type AmenityFilter = (typeof AMENITY_FILTERS)[number];

export type ListingFilters = {
  governorate: string;
  area: string;
  gender: string;
  propertyType: string;
  minPrice: string;
  maxPrice: string;
  /** At least this many bedrooms / bathrooms. */
  bedrooms: string;
  bathrooms: string;
  /** The guest wants to stay this many months: places whose minimum stay is longer are left out. */
  stay: string;
  amenities: AmenityFilter[];
  verified: boolean;
  sort: ListingSort;
};

export const EMPTY_FILTERS: ListingFilters = {
  governorate: "",
  area: "",
  gender: "",
  propertyType: "",
  minPrice: "",
  maxPrice: "",
  bedrooms: "",
  bathrooms: "",
  stay: "",
  amenities: [],
  verified: false,
  sort: "newest",
};

export function hasActiveFilters(filters: ListingFilters) {
  return Boolean(filters.governorate || filters.area || filters.gender || filters.propertyType || filters.minPrice || filters.maxPrice || filters.bedrooms || filters.bathrooms || filters.stay || filters.amenities.length || filters.verified);
}

const SORTS: ListingSort[] = ["newest", "price_asc", "price_desc"];
const PRICE_PATTERN = /^\d{1,7}$/;

/** Filters from the page address (?gov=…&area=…), so searches can be linked and shared. */
export function filtersFromParams(params: Record<string, string | string[] | undefined>): ListingFilters {
  const one = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  };
  const amenities = one("amenities").split(",").filter((item): item is AmenityFilter => (AMENITY_FILTERS as readonly string[]).includes(item));
  const sort = one("sort") as ListingSort;
  return {
    governorate: one("gov").slice(0, 40),
    area: one("area").slice(0, 80),
    gender: ["female", "male"].includes(one("gender")) ? one("gender") : "",
    propertyType: ["room", "apartment", "bed", "studio"].includes(one("type")) ? one("type") : "",
    minPrice: PRICE_PATTERN.test(one("min")) ? one("min") : "",
    maxPrice: PRICE_PATTERN.test(one("max")) ? one("max") : "",
    bedrooms: /^[1-9]$/.test(one("beds")) ? one("beds") : "",
    bathrooms: /^[1-9]$/.test(one("baths")) ? one("baths") : "",
    stay: /^([1-9]|1\d|2[0-4])$/.test(one("stay")) ? one("stay") : "",
    amenities,
    verified: one("verified") === "1",
    sort: SORTS.includes(sort) ? sort : "newest",
  };
}

/** The reverse of filtersFromParams; empty values are left out. */
export function filtersToParams(filters: ListingFilters) {
  const params = new URLSearchParams();
  if (filters.governorate) params.set("gov", filters.governorate);
  if (filters.area) params.set("area", filters.area);
  if (filters.gender) params.set("gender", filters.gender);
  if (filters.propertyType) params.set("type", filters.propertyType);
  if (filters.minPrice) params.set("min", filters.minPrice);
  if (filters.maxPrice) params.set("max", filters.maxPrice);
  if (filters.bedrooms) params.set("beds", filters.bedrooms);
  if (filters.bathrooms) params.set("baths", filters.bathrooms);
  if (filters.stay) params.set("stay", filters.stay);
  if (filters.amenities.length) params.set("amenities", filters.amenities.join(","));
  if (filters.verified) params.set("verified", "1");
  if (filters.sort !== "newest") params.set("sort", filters.sort);
  return params;
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Other approved listings in the same governorate, for "More places in…" on a listing page. */
export async function fetchSimilarListings(client: SupabaseClient, listing: Pick<Property, "id" | "city" | "gender" | "is_demo">, limit = 3) {
  let query = client
    .from("properties")
    .select(CARD_LISTING_COLUMNS)
    .eq("status", "approved")
    .eq("governorate", listing.city)
    .eq("gender", listing.gender)
    .neq("id", listing.id);
  // A real place never suggests demo places (demo pages may suggest each other).
  if (!listing.is_demo) query = query.eq("is_demo", false);
  const { data, error } = await query
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
    .select(CARD_LISTING_COLUMNS)
    .eq("status", "approved")
    .in("id", valid);
  const byId = new Map(((data ?? []) as unknown as MarketplaceListing[]).map((listing) => [listing.id, toProperty(listing)]));
  return { listings: valid.flatMap((id) => byId.get(id) ?? []), error };
}

/** The filter methods shared by list and count queries (each returns the same builder). */
interface Filterable {
  eq(column: string, value: unknown): Filterable;
  ilike(column: string, pattern: string): Filterable;
  gte(column: string, value: unknown): Filterable;
  lte(column: string, value: unknown): Filterable;
}

// Typed loosely on purpose: Supabase's fully generic builder types are too deep for TypeScript here.
function applyFilters<T>(query: T, filters: ListingFilters): T {
  let next = query as unknown as Filterable;
  if (filters.governorate) next = next.eq("governorate", filters.governorate);
  // Neighbourhoods are typed by owners, so match part of the name ("Dokki" finds "Dokki, Tahrir St").
  const areaTerm = filters.area.replace(/[%_\\,()*]/g, " ").trim();
  if (areaTerm) next = next.ilike("area", `%${areaTerm}%`);
  if (filters.gender) next = next.eq("gender", filters.gender);
  if (filters.propertyType) next = next.eq("property_type", filters.propertyType);
  const minPrice = Number(filters.minPrice);
  if (filters.minPrice && Number.isFinite(minPrice) && minPrice > 0) next = next.gte("monthly_price", minPrice);
  const maxPrice = Number(filters.maxPrice);
  if (filters.maxPrice && Number.isFinite(maxPrice) && maxPrice > 0) next = next.lte("monthly_price", maxPrice);
  if (filters.bedrooms) next = next.gte("bedrooms", Number(filters.bedrooms));
  if (filters.bathrooms) next = next.gte("bathrooms", Number(filters.bathrooms));
  if (filters.stay) next = next.lte("min_months", Number(filters.stay));
  for (const amenity of filters.amenities) next = next.eq(amenity, true);
  if (filters.verified) next = next.eq("verified", true);
  return next as unknown as T;
}

/** How many published listings match, for the "Show N homes" button in the filters window. */
export async function countApprovedListings(client: SupabaseClient, filters: ListingFilters) {
  const { count, error } = await applyFilters(client.from("properties").select("id", { count: "exact", head: true }).eq("status", "approved"), filters);
  return error ? null : count ?? 0;
}

/** Runs the public feed query with filtering, sorting and pagination done by the database. */
export async function fetchApprovedListings(
  client: SupabaseClient,
  filters: ListingFilters,
  page: number,
): Promise<{ listings: Property[]; total: number; error: unknown }> {
  let query = applyFilters(client
    .from("properties")
    // Counting every match is the slow part, so only the first page asks; "load more" keeps that total.
    .select(CARD_LISTING_COLUMNS, page === 0 ? { count: "exact" } : undefined)
    .eq("status", "approved"), filters);

  // Real places always come before demo places.
  query = query.order("is_demo", { ascending: true });
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
    description_ar: listing.description_ar ?? "",
    description_en: listing.description_en ?? "",
    city: listing.governorate || "Giza",
    area: listing.area,
    university: listing.university,
    gender: listing.gender,
    property_type: listing.property_type,
    monthly_price: listing.monthly_price,
    deposit: listing.deposit,
    furnished: listing.furnished,
    wifi: listing.wifi,
    private_bathroom: false,
    washing_machine: listing.washing_machine ?? null,
    air_conditioning: listing.air_conditioning,
    parking: false,
    kitchen: listing.kitchen ?? null,
    fridge: listing.fridge ?? null,
    water_heater: listing.water_heater ?? null,
    elevator: listing.elevator ?? null,
    security: listing.security,
    available_beds: listing.available_beds,
    total_beds: listing.total_beds,
    verification_status: listing.verified ? "verified" : "pending",
    verified_at: listing.verified_at ?? null,
    walking_distance_minutes: listing.walking_distance_minutes,
    address_text: `${listing.area}, ${listing.governorate || "Giza"}, Egypt`,
    whatsapp_number: listing.whatsapp_number ?? "",
    phone_number: listing.whatsapp_number ?? "",
    images: listingImages(listing),
    amenities: AMENITIES.filter((amenity) => listing[amenity.key] === true).map((amenity) => amenity.en),
    rules: [],
    created_at: listing.created_at || now,
    updated_at: listing.updated_at || listing.created_at || now,
    is_demo: Boolean(listing.is_demo),
    bedrooms: listing.bedrooms ?? null,
    bathrooms: listing.bathrooms ?? null,
    area_sqm: listing.area_sqm ?? null,
    min_months: listing.min_months ?? 1,
    available_from: listing.available_from ?? null,
    status: listing.status,
    rented_until: listing.rented_until ?? null,
    published_at: listing.published_at ?? null,
    available_since: listing.available_since ?? null,
    host_id: (listing as { owner_id?: string }).owner_id,
  };
}

export type ListingReview = { rating: number; body: string; guest_first_name: string | null; created_at: string };

/** Public reviews of a place (empty until the reviews migration is installed). */
export async function fetchListingReviews(client: SupabaseClient, listingId: string): Promise<ListingReview[]> {
  const { data, error } = await client.rpc("listing_reviews", { target_listing: listingId });
  if (error) {
    if (error.code !== "PGRST202") console.error("Could not load reviews:", error);
    return [];
  }
  return (data ?? []) as ListingReview[];
}

/** The months already booked on a place, for its availability (dates only). */
export async function fetchBookedRanges(client: SupabaseClient, listingId: string): Promise<Array<{ starts: string; ends: string }>> {
  const { data, error } = await client.rpc("listing_booked_ranges", { target_listing: listingId });
  if (error) {
    if (error.code !== "PGRST202") console.error("Could not load booked dates:", error);
    return [];
  }
  return (data ?? []) as Array<{ starts: string; ends: string }>;
}
