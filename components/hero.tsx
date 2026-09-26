"use client";

import { SearchIcon } from "lucide-react";
import Link from "next/link";

export default function Hero({ locale }: { locale: string }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-r from-indigo-600 via-blue-500 to-blue-600 py-20 md:py-32">
      <div className="relative mx-auto max-w-7xl px-4 text-center text-white">
        <h1 className="text-4xl font-extrabold md:text-6xl lg:text-7xl">
          {locale === "ar"
            ? "اعثر على سكنك المثالي"
            : "Find Your Perfect Housing"}
        </h1>

        <p className="mx-auto mt-6 max-w-3xl text-lg md:text-xl text-blue-50">
          {locale === "ar"
            ? "منصة حديثة وآمنة للعثور على سكن طلابي موثّق بالقرب من جامعتك في الجيزة. معلومات واضحة، صور حقيقية، وتجربة سهلة."
            : "A modern and secure platform to find verified student housing near your university in Giza. Clear information, real photos, and easy experience."}
        </p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Link
            href={`/${locale}/listings`}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-8 py-4 font-bold text-indigo-600 hover:bg-slate-100 transition transform hover:scale-105"
          >
            <SearchIcon size={20} />
            {locale === "ar" ? "ابدأ البحث" : "Start Searching"}
          </Link>
          <Link
            href={`/${locale}/add-property`}
            className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-white px-8 py-4 font-bold text-white hover:bg-white/10 transition"
          >
            {locale === "ar" ? "أضف سكنك" : "List Your Property"}
          </Link>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          <div>
            <div className="text-4xl font-bold">250+</div>
            <p className="mt-2 text-blue-50">
              {locale === "ar" ? "وحدة سكنية" : "Properties"}
            </p>
          </div>
          <div>
            <div className="text-4xl font-bold">1000+</div>
            <p className="mt-2 text-blue-50">
              {locale === "ar" ? "طالب مرتاح" : "Happy Students"}
            </p>
          </div>
          <div>
            <div className="text-4xl font-bold">100%</div>
            <p className="mt-2 text-blue-50">
              {locale === "ar" ? "موثقة" : "Verified"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}