import { ArrowUpDown, CookingPot, Refrigerator, ShieldCheck, ShowerHead, Snowflake, Sofa, WashingMachine, Wifi, type LucideIcon } from "lucide-react";

/**
 * The amenities a place can have, in the order they are asked and shown: the listing form, the listing
 * page, the search filters and the admin editor all use this one list. Each is a yes/no column on
 * public.properties. The ones added on 2026-11-05 may be null on older places (the owner hasn't said).
 */
export const AMENITIES = [
  { key: "furnished", icon: Sofa, ar: "مفروش", en: "Furnished" },
  { key: "wifi", icon: Wifi, ar: "واي فاي", en: "Wi-Fi" },
  { key: "air_conditioning", icon: Snowflake, ar: "تكييف", en: "Air conditioning" },
  { key: "kitchen", icon: CookingPot, ar: "مطبخ", en: "Kitchen" },
  { key: "washing_machine", icon: WashingMachine, ar: "غسالة", en: "Washing machine" },
  { key: "fridge", icon: Refrigerator, ar: "تلاجة", en: "Fridge" },
  { key: "water_heater", icon: ShowerHead, ar: "سخان", en: "Water heater" },
  { key: "elevator", icon: ArrowUpDown, ar: "أسانسير", en: "Elevator" },
  { key: "security", icon: ShieldCheck, ar: "بواب / أمن", en: "Doorman / security" },
] as const satisfies ReadonlyArray<{ key: string; icon: LucideIcon; ar: string; en: string }>;

export type AmenityKey = (typeof AMENITIES)[number]["key"];
export const AMENITY_KEYS = AMENITIES.map((amenity) => amenity.key) as AmenityKey[];
/** Yes / no / not said yet, per amenity. */
export type AmenityValues = Partial<Record<AmenityKey, boolean | null>>;

export function amenityLabel(key: AmenityKey, locale: "ar" | "en") {
  const amenity = AMENITIES.find((item) => item.key === key);
  return amenity ? amenity[locale] : key;
}
