"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSavedListings } from "@/lib/saved";
import Image from "next/image";
import {
  BadgeCheck,
  ChevronDown,
  GraduationCap,
  House,
  MapPin,
  Heart,
  MessageCircle,
  Search,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { areas, properties as sampleProperties, universities } from "@/lib/data";
import type { Property } from "@/types";
import ContactForm from "@/components/contact-form";
import OwnerPortal from "@/components/owner-portal";
import PropertyCard from "@/components/property-card";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  AMENITY_FILTERS,
  EMPTY_FILTERS,
  fetchApprovedListings,
  fetchListingsByIds,
  hasActiveFilters,
  type AmenityFilter,
  type ListingFilters,
  type ListingSort,
} from "@/lib/supabase/listings";
import { SITE_URL } from "@/lib/site";

type HomePageProps = {
  locale: SiteLocale;
  /** First page of approved listings, rendered on the server. Null when Supabase is not configured. */
  initialListings: Property[] | null;
  initialTotal: number;
  initialError: boolean;
};

function filterSamples(filters: ListingFilters) {
  const maxPrice = Number(filters.maxPrice);
  const matches = sampleProperties.filter((property) =>
    (!filters.university || property.university === filters.university) &&
    (!filters.area || property.area === filters.area) &&
    (!filters.gender || property.gender === filters.gender) &&
    (!filters.propertyType || property.property_type === filters.propertyType) &&
    (!maxPrice || property.monthly_price <= maxPrice) &&
    filters.amenities.every((amenity) => property[amenity]),
  );
  if (filters.sort === "price_asc") matches.sort((a, b) => a.monthly_price - b.monthly_price);
  if (filters.sort === "price_desc") matches.sort((a, b) => b.monthly_price - a.monthly_price);
  return matches;
}

export default function HomePage({ locale, initialListings, initialTotal, initialError }: HomePageProps) {
  const t = SITE_COPY[locale];
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const isDemoMode = initialListings === null;
  const [filters, setFilters] = useState<ListingFilters>(EMPTY_FILTERS);
  const [listings, setListings] = useState<Property[]>(initialListings ?? sampleProperties.slice(0, 6));
  const [total, setTotal] = useState(initialListings ? initialTotal : sampleProperties.length);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState<"none" | "replace" | "more">("none");
  const [listingError, setListingError] = useState(initialError);
  const requestId = useRef(0);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const savedIds = useSavedListings();
  const savedKey = savedIds.join(",");
  const [showSaved, setShowSaved] = useState(false);
  const [savedListings, setSavedListings] = useState<Property[] | null>(null);

  // Saved view: load the saved homes, and reload when one is un-saved.
  useEffect(() => {
    if (!showSaved || !supabase) return;
    let mounted = true;
    void fetchListingsByIds(supabase, savedKey ? savedKey.split(",") : []).then(({ listings: saved, error }) => {
      if (!mounted) return;
      if (error) console.error("Could not load saved listings:", error);
      setSavedListings(saved);
    });
    return () => {
      mounted = false;
    };
  }, [showSaved, savedKey, supabase]);
  const filtersActive = hasActiveFilters(filters);
  const extraFilterCount = [filters.propertyType, filters.maxPrice].filter(Boolean).length + filters.amenities.length;
  const amenityLabels: Record<AmenityFilter, string> = {
    furnished: t.furnished,
    wifi: t.wifi,
    air_conditioning: t.airConditioning,
    security: t.secure,
  };

  function toggleAmenity(amenity: AmenityFilter) {
    const amenities = filters.amenities.includes(amenity)
      ? filters.amenities.filter((item) => item !== amenity)
      : [...filters.amenities, amenity];
    updateFilters({ amenities });
  }

  async function loadListings(nextFilters: ListingFilters, nextPage: number) {
    if (isDemoMode) {
      const matches = filterSamples(nextFilters);
      setListings(hasActiveFilters(nextFilters) ? matches : matches.slice(0, 6));
      setTotal(matches.length);
      return;
    }
    if (!supabase) return;

    const id = ++requestId.current;
    setLoading(nextPage === 0 ? "replace" : "more");
    const result = await fetchApprovedListings(supabase, nextFilters, nextPage);
    if (id !== requestId.current) return;

    if (result.error) {
      console.error("Could not load published listings:", result.error);
      setListingError(true);
    } else {
      setListingError(false);
      setListings((current) => (nextPage === 0 ? result.listings : [...current, ...result.listings]));
      setTotal(result.total);
      setPage(nextPage);
    }
    setLoading("none");
  }

  function updateFilters(patch: Partial<ListingFilters>, { reload = true } = {}) {
    setShowSaved(false);
    const next = { ...filters, ...patch };
    setFilters(next);
    if (reload) void loadListings(next, 0);
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadListings(filters, 0);
    document.getElementById("homes")?.scrollIntoView({ behavior: "smooth" });
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    void loadListings(EMPTY_FILTERS, 0);
  }

  const hasMore = !isDemoMode && listings.length < total;

  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader locale={locale} switchHref={locale === "ar" ? "/en" : "/ar"} />

      <main>
        <section className="hero2" id="search" aria-labelledby="hero-title">
          <Image
            className="hero2-photo"
            src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=2000&q=80"
            alt=""
            fill
            sizes="100vw"
            priority
          />
          <div className="hero2-inner section-wrap">
            <span className="hero2-badge"><Sparkles size={15} /> {t.heroBadge}</span>
            <h1 id="hero-title">{t.heroFirst} <span>{t.heroSecond}</span></h1>
            <p className="hero2-text">{t.heroDescription}</p>

          <div className="search-panel hero2-search">
            <form className="search-form" onSubmit={handleSearch} aria-label={t.searchTitle}>
              <div className="search-main">
              <label className="field">
                <span>{t.university}</span>
                <span className="select-wrap">
                  <select value={filters.university} onChange={(event) => updateFilters({ university: event.target.value })}>
                    <option value="">{t.allUniversities}</option>
                    {universities.map((university) => <option key={university.id} value={university.name_en}>{locale === "ar" ? university.name : university.name_en}</option>)}
                  </select>
                  <ChevronDown size={16} />
                </span>
              </label>
              <label className="field">
                <span>{t.area}</span>
                <span className="select-wrap">
                  <select value={filters.area} onChange={(event) => updateFilters({ area: event.target.value })}>
                    <option value="">{t.allAreas}</option>
                    {areas.map((area) => <option key={area.id} value={area.name_en}>{locale === "ar" ? area.name : area.name_en}</option>)}
                  </select>
                  <ChevronDown size={16} />
                </span>
              </label>
              <label className="field">
                <span>{t.housing}</span>
                <span className="select-wrap">
                  <select value={filters.gender} onChange={(event) => updateFilters({ gender: event.target.value })}>
                    <option value="">{t.all}</option>
                    <option value="female">{t.female}</option>
                    <option value="male">{t.male}</option>
                    <option value="mixed">{t.mixed}</option>
                  </select>
                  <ChevronDown size={16} />
                </span>
              </label>
              <button className="button button-primary search-button" type="submit"><Search size={18} /> {t.searchButton}</button>
              </div>

              <div className="search-extra-bar">
                <button className="search-more-toggle" type="button" aria-expanded={showMoreFilters} aria-controls="search-extra" onClick={() => setShowMoreFilters((value) => !value)}>
                  <SlidersHorizontal size={15} /> {showMoreFilters ? t.hideFilters : t.moreFilters}
                  {extraFilterCount > 0 && <span className="search-more-count">{extraFilterCount}</span>}
                </button>
                {filtersActive && <button className="reset-button" type="button" onClick={resetFilters}>{t.clearFilters}</button>}
              </div>

              <div className="search-extra" id="search-extra" hidden={!showMoreFilters}>
              <label className="field">
                <span>{t.propertyType}</span>
                <span className="select-wrap">
                  <select value={filters.propertyType} onChange={(event) => updateFilters({ propertyType: event.target.value })}>
                    <option value="">{t.allTypes}</option>
                    <option value="room">{t.room}</option>
                    <option value="apartment">{t.apartment}</option>
                    <option value="bed">{t.bed}</option>
                  </select>
                  <ChevronDown size={16} />
                </span>
              </label>
              <label className="field">
                <span>{t.maxPrice}</span>
                <input
                  className="field-input"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="100"
                  placeholder={t.anyPrice}
                  value={filters.maxPrice}
                  onChange={(event) => updateFilters({ maxPrice: event.target.value }, { reload: false })}
                  dir="ltr"
                />
              </label>
              <div className="field search-amenities" role="group" aria-label={t.filterAmenities}>
                <span>{t.filterAmenities}</span>
                <div className="choice-row">
                  {AMENITY_FILTERS.map((amenity) => (
                    <label className="choice" key={amenity}>
                      <input type="checkbox" checked={filters.amenities.includes(amenity)} onChange={() => toggleAmenity(amenity)} />
                      <span>{amenityLabels[amenity]}</span>
                    </label>
                  ))}
                </div>
              </div>
              </div>
            </form>
          </div>

            <ul className="hero2-trust">
              <li><ShieldCheck size={17} /> {t.trustReviewed}</li>
              <li><MessageCircle size={17} /> {t.trustDirect}</li>
              <li><BadgeCheck size={17} /> {t.trustFree}</li>
            </ul>
          </div>
        </section>

        <section className="listings-section section-wrap" id="homes">
          <div className="section-heading">
            <div>
              <span className="section-kicker">{t.featuredKicker}</span>
              <h2>{showSaved ? t.savedTitle : filtersActive ? t.filteredTitle : t.featuredTitle}</h2>
              <p aria-live="polite">{showSaved ? t.savedCount(savedIds.length) : filtersActive ? t.resultCount(total) : isDemoMode ? t.browseHint : t.approvedListingCount(total)}</p>
            </div>
            <label className="listing-sort">
              <span>{t.sortLabel}</span>
              <span className="select-wrap">
                <select value={filters.sort} onChange={(event) => updateFilters({ sort: event.target.value as ListingSort })}>
                  <option value="newest">{t.sortNewest}</option>
                  <option value="price_asc">{t.sortPriceAsc}</option>
                  <option value="price_desc">{t.sortPriceDesc}</option>
                </select>
                <ChevronDown size={16} />
              </span>
            </label>
          </div>
          <div className="uni-chips" role="group" aria-label={t.university}>
            <button type="button" className={!showSaved && !filters.university ? "is-active" : ""} aria-pressed={!showSaved && !filters.university} onClick={() => updateFilters({ university: "" })}>
              {t.allUniversities}
            </button>
            {universities.map((university) => (
              <button
                key={university.id}
                type="button"
                className={!showSaved && filters.university === university.name_en ? "is-active" : ""}
                aria-pressed={!showSaved && filters.university === university.name_en}
                onClick={() => updateFilters({ university: university.name_en })}
              >
                <GraduationCap size={15} /> {locale === "ar" ? university.name : university.name_en}
              </button>
            ))}
            {!isDemoMode && (savedIds.length > 0 || showSaved) && (
              <button type="button" className={`uni-chip-saved${showSaved ? " is-active" : ""}`} aria-pressed={showSaved} onClick={() => { setSavedListings(null); setShowSaved((value) => !value); }}>
                <Heart size={15} fill={showSaved ? "currentColor" : "none"} /> {t.savedFilter(savedIds.length)}
              </button>
            )}
          </div>
          {isDemoMode && <p className="demo-notice">{t.demoNotice}</p>}
          {listingError && <p className="owner-feedback owner-feedback-error" role="alert">{t.feedError}</p>}
          {showSaved ? (
            savedListings === null ? (
              <div className="listings-loading">{t.loadingListings}</div>
            ) : savedListings.length > 0 ? (
              <div className="property-grid">
                {savedListings.map((property) => <PropertyCard key={property.id} property={property} locale={locale} />)}
              </div>
            ) : (
              <div className="empty-state">
                <Heart size={24} />
                <h3>{t.savedEmptyTitle}</h3>
                <p>{t.savedEmptyText}</p>
                <button className="button button-outline" type="button" onClick={() => setShowSaved(false)}>{t.savedBack}</button>
              </div>
            )
          ) : loading === "replace" ? (
            <div className="listings-loading">{t.loadingListings}</div>
          ) : listings.length > 0 ? (
            <>
              <div className="property-grid">
                {listings.map((property) => <PropertyCard key={property.id} property={property} locale={locale} linkToDetails={!isDemoMode} />)}
              </div>
              {hasMore && (
                <div className="load-more">
                  <button className="button button-outline" type="button" disabled={loading === "more"} onClick={() => void loadListings(filters, page + 1)}>
                    {loading === "more" ? t.loadingMore : t.loadMore}
                  </button>
                </div>
              )}
            </>
          ) : (
            filtersActive ? (
              <div className="empty-state">
                <Search size={24} />
                <h3>{t.noMatchTitle}</h3>
                <p>{t.noMatchText}</p>
                <button className="button button-outline" type="button" onClick={resetFilters}>{t.showAll}</button>
              </div>
            ) : (
              <div className="empty-launch">
                <span className="empty-launch-icon"><House size={26} /></span>
                <h3>{t.emptyTitle}</h3>
                <p>{t.emptyText}</p>
                <div className="empty-launch-actions">
                  <a className="button button-primary" href="#owner">{t.emptyOwnerCta}</a>
                  <a
                    className="button button-outline"
                    href={`https://wa.me/?text=${encodeURIComponent(`${t.emptyShareMessage} ${SITE_URL}/${locale}`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Share2 size={16} /> {t.emptyShareCta}
                  </a>
                </div>
              </div>
            )
          )}
        </section>

        <section className="why2" id="why-sakani">
          <div className="section-wrap">
            <div className="why2-heading">
              <span className="section-kicker">{t.whyKicker}</span>
              <h2>{t.whyTitleFirst} {t.whyTitleSecond}</h2>
              <p>{t.whyDescription}</p>
            </div>
            <div className="why2-grid">
              {[
                { icon: ShieldCheck, tone: "mint", title: t.benefitOneTitle, text: t.benefitOneText },
                { icon: MapPin, tone: "peach", title: t.benefitTwoTitle, text: t.benefitTwoText },
                { icon: MessageCircle, tone: "lavender", title: t.benefitThreeTitle, text: t.benefitThreeText },
              ].map(({ icon: Icon, tone, title, text }, index) => (
                <article className="why2-card" key={title}>
                  <span className={`why2-icon ${tone}`}><Icon size={24} /></span>
                  <span className="why2-step">{String(index + 1).padStart(2, "0")}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <OwnerPortal locale={locale} />

        <section className="faq-section section-wrap" id="faq" aria-labelledby="faq-title">
          <div className="faq-heading">
            <span className="section-kicker">{t.faqKicker}</span>
            <h2 id="faq-title">{t.faqTitle}</h2>
          </div>
          <div className="faq-list">
            {t.faqItems.map((item, index) => (
              <details className="faq-item" key={item.q} open={index === 0}>
                <summary>{item.q}<ChevronDown size={18} aria-hidden="true" /></summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: t.faqItems.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
              }).replace(/</g, "\\u003c"),
            }}
          />
        </section>

        <ContactForm locale={locale} />
      </main>

      <SiteFooter locale={locale} switchHref={locale === "ar" ? "/en" : "/ar"} />
    </div>
  );
}
