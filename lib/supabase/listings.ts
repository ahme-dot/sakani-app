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
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

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
    verification_status: "verified",
    walking_distance_minutes: listing.walking_distance_minutes,
    address_text: `${listing.area}, Giza, Egypt`,
    whatsapp_number: listing.whatsapp_number,
    phone_number: listing.whatsapp_number,
    images: [listing.image_url],
    amenities: [
      ...(listing.wifi ? ["Wi-Fi"] : []),
      ...(listing.furnished ? ["Furnished"] : []),
      ...(listing.air_conditioning ? ["Air Conditioning"] : []),
      ...(listing.security ? ["Security"] : []),
    ],
    rules: [],
    created_at: listing.created_at || now,
    updated_at: listing.created_at || now,
  };
}
