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
    property_type: "room" | "apartment" | "bed";
    monthly_price: number;
    deposit: number;
    furnished: boolean;
    wifi: boolean;
    private_bathroom: boolean;
    washing_machine: boolean;
    air_conditioning: boolean;
    parking: boolean;
    kitchen: boolean;
    security: boolean;
    available_beds: number;
    total_beds: number;
    verification_status: "verified" | "pending" | "rejected";
    walking_distance_minutes: number;
    address_text: string;
    whatsapp_number: string;
    phone_number: string;
    images: string[];
    amenities: string[];
    rules: string[];
    created_at: string;
    updated_at: string;
  }
  
  export interface Inquiry {
    id: string;
    property_id: string;
    full_name: string;
    phone: string;
    email: string;
    message: string;
    preferred_visit_date: string;
    status: "pending" | "contacted" | "scheduled" | "completed";
    created_at: string;
  }
  
  export interface User {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: "student" | "landlord" | "admin";
    university?: string;
    properties?: string[];
    created_at: string;
  }
  
  export interface SearchFilters {
    university?: string;
    area?: string;
    gender?: "male" | "female" | "mixed";
    property_type?: "room" | "apartment" | "bed";
    min_price?: number;
    max_price?: number;
    furnished?: boolean;
    wifi?: boolean;
  }