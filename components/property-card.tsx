"use client";

import { Property } from "@/types";
import Link from "next/link";
import {
  MapPin,
  Clock,
  Bed,
  Wifi,
  Wind,
  Shield,
  Check,
} from "lucide-react";

interface PropertyCardProps {
  property: Property;
  locale: string;
}

export default function PropertyCard({
  property,
  locale,
}: PropertyCardProps) {
  const genderLabels: Record<string, string> = {
    male: locale === "ar" ? "شباب" : "Male",
    female: locale === "ar" ? "بنات" : "Female",
    mixed: locale === "ar" ? "مختلط" : "Mixed",
  };

  const genderColors: Record<string, string> = {
    male: "bg-blue-100 text-blue-700",
    female: "bg-pink-100 text-pink-700",
    mixed: "bg-purple-100 text-purple-700",
  };

  return (
    <div className="group overflow-hidden rounded-2xl bg-white shadow-md transition hover:shadow-2xl hover:-translate-y-1">
      {/* Image */}
      <div className="relative h-56 overflow-hidden bg-slate-200">
        <img
          src={property.images[0] as string}
          alt={locale === "ar" ? property.title_ar : property.title_en}
          className="h-full w-full object-cover transition group-hover:scale-110"
        />

        {/* Badge */}
        <div className="absolute top-4 right-4 flex gap-2">
          {property.verification_status === "verified" && (
            <div className="flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-white">
              <Check size={14} />
              {locale === "ar" ? "موثق" : "Verified"}
            </div>
          )}

          <div
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              genderColors[property.gender as string]
            }`}
          >
            {genderLabels[property.gender as string]}
          </div>
        </div>

        {/* Distance */}
        <div className="absolute bottom-4 right-4 rounded-lg bg-black/70 px-3 py-1 text-xs font-semibold text-white flex items-center gap-1">
          <Clock size={14} />
          {property.walking_distance_minutes}{" "}
          {locale === "ar" ? "دقيقة" : "min"}
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        {/* Title */}
        <h3 className="line-clamp-2 text-lg font-bold text-slate-900">
          {locale === "ar" ? property.title_ar : property.title_en}
        </h3>

        {/* Location */}
        <div className="mt-2 flex items-start gap-2 text-sm text-slate-600">
          <MapPin size={16} className="mt-0.5 flex-shrink-0" />
          <span>
            {property.area}, {property.city}
          </span>
        </div>

        {/* Amenities */}
        <div className="mt-3 flex flex-wrap gap-2">
          {property.wifi && (
            <div className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
              <Wifi size={12} />
              {locale === "ar" ? "واي فاي" : "Wi-Fi"}
            </div>
          )}
          {property.air_conditioning && (
            <div className="flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-1 text-xs text-cyan-700">
              <Wind size={12} />
              {locale === "ar" ? "تكييف" : "AC"}
            </div>
          )}
          {property.security && (
            <div className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-xs text-green-700">
              <Shield size={12} />
              {locale === "ar" ? "أمان" : "Secure"}
            </div>
          )}
          {property.available_beds > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">
              <Bed size={12} />
              {property.available_beds}{" "}
              {locale === "ar" ? "أسرة" : "beds"}
            </div>
          )}
        </div>

        {/* Price & Button */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-600">
              {locale === "ar" ? "السعر الشهري" : "Monthly"}
            </p>
            <p className="text-2xl font-extrabold text-indigo-600">
              EGP {property.monthly_price.toLocaleString()}
            </p>
          </div>

          <Link
            href={`/listings/${property.id}`}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition"
          >
            {locale === "ar" ? "التفاصيل" : "View"}
          </Link>
        </div>
      </div>
    </div>
  );
}