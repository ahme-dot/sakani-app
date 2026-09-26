"use client";

import { properties } from "@/lib/data";
import PropertyCard from "./property-card";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function FeaturedListings({ locale }: { locale: string }) {
  const featured = properties.slice(0, 3);

  return (
    <section className="mx-auto max-w-7xl px-4 py-16">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">
            {locale === "ar" ? "السكن المميز" : "Featured Listings"}
          </h2>
          <p className="mt-2 text-slate-600">
            {locale === "ar"
              ? "أفضل العروض الموثقة هذا الأسبوع"
              : "Best verified offers this week"}
          </p>
        </div>
        <Link
          href={`/${locale}/listings`}
          className="flex items-center gap-2 font-bold text-indigo-600 hover:text-indigo-700"
        >
          {locale === "ar" ? "عرض الكل" : "View All"}
          <ArrowLeft size={20} />
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {featured.map((property) => (
          <PropertyCard
            key={property.id}
            property={property}
            locale={locale}
          />
        ))}
      </div>
    </section>
  );
}