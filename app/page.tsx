"use client";

import Hero from "@/components/hero";
import SearchSection from "@/components/search-section";
import FeaturedListings from "@/components/featured-listings";
import Features from "@/components/features";
import CTA from "@/components/cta";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";

export default function HomePage() {
  const locale = "ar";

  return (
    <>
      <Navbar locale={locale} />
      <div className="min-h-screen bg-slate-50">
        <Hero locale={locale} />
        <SearchSection locale={locale} />
        <FeaturedListings locale={locale} />
        <Features locale={locale} />
        <CTA locale={locale} />
      </div>
      <Footer locale={locale} />
    </>
  );
}