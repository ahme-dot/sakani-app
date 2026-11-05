export interface Property {
    id: string;
    title_ar: string;
    title_en: string;
    description_ar: string;
    description_en: string;
    city: string;
    area: string;
    university: string;
    gender: "male" | "female" | "mixed";
    property_type: "room" | "apartment" | "bed" | "studio";
    monthly_price: number;
    deposit: number;
    furnished: boolean | null;
    wifi: boolean;
    private_bathroom: boolean;
    washing_machine: boolean | null;
    air_conditioning: boolean;
    parking: boolean;
    kitchen: boolean | null;
    fridge?: boolean | null;
    water_heater?: boolean | null;
    elevator?: boolean | null;
    security: boolean;
    available_beds: number;
    total_beds: number;
    verification_status: "verified" | "pending" | "rejected";
    verified_at?: string | null;
    walking_distance_minutes: number;
    address_text: string;
    whatsapp_number: string;
    phone_number: string;
    images: string[];
    amenities: string[];
    rules: string[];
    created_at: string;
    updated_at: string;
    /** Demo listings (for previewing the site) can't be booked. */
    is_demo?: boolean;
    /** The host's account, for "Hosted by" on the listing page. */
    host_id?: string;
    bedrooms?: number | null;
    bathrooms?: number | null;
    area_sqm?: number | null;
    /** Shortest stay the host accepts, in months. */
    min_months?: number;
    available_from?: string | null;
    status?: "pending" | "approved" | "rejected" | "paused" | "reserved" | "rented" | "suspended";
    /** While rented: the day it becomes free again. */
    rented_until?: string | null;
    published_at?: string | null;
    available_since?: string | null;
  }
