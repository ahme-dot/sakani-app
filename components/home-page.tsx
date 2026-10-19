"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpLeft,
  BadgeCheck,
  BedDouble,
  Check,
  ChevronDown,
  Clock3,
  MapPin,
  MessageCircle,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Wifi,
  Wind,
} from "lucide-react";
import { areas, properties as sampleProperties, universities } from "@/lib/data";
import type { Property } from "@/types";
import OwnerPortal from "@/components/owner-portal";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  EMPTY_FILTERS,
  fetchApprovedListings,
  hasActiveFilters,
  type ListingFilters,
  type ListingSort,
} from "@/lib/supabase/listings";
import { listingPath, whatsappLink } from "@/lib/site";

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
    (!maxPrice || property.monthly_price <= maxPrice),
  );
  if (filters.sort === "price_asc") matches.sort((a, b) => a.monthly_price - b.monthly_price);
  if (filters.sort === "price_desc") matches.sort((a, b) => b.monthly_price - a.monthly_price);
  return matches;
}

function PropertyCard({ property, locale, linkToDetails }: { property: Property; locale: SiteLocale; linkToDetails: boolean }) {
  const t = SITE_COPY[locale];
  const title = locale === "ar" ? property.title_ar : property.title_en;
  const area = areas.find((candidate) => candidate.name_en === property.area);
  const areaLabel = locale === "ar" ? area?.name ?? property.area : property.area;
  const price = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG").format(property.monthly_price);
  const availableBeds = property.available_beds === 1 ? t.oneBedAvailable : t.bedAvailable(property.available_beds);
  const detailsHref = listingPath(locale, property.id);

  const image = (
    <Image
      className="property-image"
      src={property.images[0]}
      alt={t.sampleImageAlt(title)}
      fill
      sizes="(max-width: 640px) 92vw, (max-width: 900px) 50vw, 360px"
    />
  );

  return (
    <article className="property-card">
      <div className="property-image-wrap">
        {linkToDetails ? <Link href={detailsHref} tabIndex={-1} aria-hidden="true">{image}</Link> : image}
        <div className="property-badges">
          {property.verification_status === "verified" && (
            <span className="verified-badge"><BadgeCheck size={14} /> {t.verified}</span>
          )}
          <span className="gender-badge">{t[property.gender]}</span>
        </div>
        <span className="walking-badge"><Clock3 size={14} /> {t.walkingMinutes(property.walking_distance_minutes)}</span>
      </div>

      <div className="property-content">
        <div className="property-location"><MapPin size={15} /> {locale === "ar" ? `${areaLabel}، ${t.city}` : `${areaLabel}, ${t.city}`}</div>
        <h3 className="property-title">
          {linkToDetails ? <Link href={detailsHref}>{title}</Link> : title}
        </h3>
        <div className="property-amenities">
          {property.furnished && <span><Check size={14} /> {t.furnished}</span>}
          {property.wifi && <span><Wifi size={14} /> {t.wifi}</span>}
          {property.air_conditioning && <span><Wind size={14} /> {t.airConditioning}</span>}
          <span><BedDouble size={14} /> {availableBeds}</span>
        </div>
        <div className="property-bottom">
          <p className="property-price">
            <strong>{price}</strong>
            <span>{t.perMonth}</span>
          </p>
          <div className="property-card-actions">
            {linkToDetails && <Link className="property-details-link" href={detailsHref}>{t.viewDetails}</Link>}
            <a
              className="property-contact"
              href={whatsappLink(property.whatsapp_number, t.whatsappMessage(title))}
              target="_blank"
              rel="noreferrer"
              aria-label={t.whatsappAria(title)}
            >
              <MessageCircle size={17} />
              {t.inquire}
            </a>
          </div>
        </div>
      </div>
    </article>
  );
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
  const filtersActive = hasActiveFilters(filters);
  const extraFilterCount = [filters.propertyType, filters.maxPrice].filter(Boolean).length;

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
        <section className="hero-section">
          <div className="hero-inner">
            <div className="hero-copy">
              <span className="eyebrow"><Sparkles size={15} /> {t.heroBadge}</span>
              <h1>{t.heroFirst}<br /><span>{t.heroSecond}</span></h1>
              <p className="hero-description">{t.heroDescription}</p>
              <div className="hero-actions">
                <a className="button button-primary" href="#search">{t.heroAction} <ArrowLeft size={18} /></a>
                <a className="text-link" href="#why-sakani">{t.heroLearn}</a>
              </div>
              <div className="hero-note">
                <span className="note-icon"><ShieldCheck size={19} /></span>
                <span><strong>{t.heroNoteTitle}</strong><small>{t.heroNoteText}</small></span>
              </div>
            </div>

            <div className="hero-art" aria-hidden="true">
              <Image
                className="hero-photo"
                src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=85"
                alt=""
                fill
                sizes="(max-width: 640px) 90vw, 48vw"
                priority
              />
              <div className="art-card art-card-top"><span className="art-card-icon"><MapPin size={17} /></span><span><b>{t.heroCardTitle}</b><small>{t.heroCardText}</small></span></div>
              <div className="art-card art-card-bottom"><span className="art-card-icon warm"><BedDouble size={17} /></span><span><b>{t.heroCardAltTitle}</b><small>{t.heroCardAltText}</small></span></div>
            </div>
          </div>
          <div className="hero-foot">
            <span>{t.heroFoot}</span>
            <span className="hero-foot-line" />
            <span>{t.city}</span>
          </div>
        </section>

        <section className="search-section" id="search" aria-labelledby="search-title">
          <div className="search-panel">
            <div className="search-heading">
              <span className="search-icon"><SlidersHorizontal size={19} /></span>
              <div><h2 id="search-title">{t.searchTitle}</h2><p>{t.searchDescription}</p></div>
            </div>
            <form className="search-form" onSubmit={handleSearch}>
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
              </div>
            </form>
          </div>
        </section>

        <section className="listings-section section-wrap" id="homes">
          <div className="section-heading">
            <div>
              <span className="section-kicker">{t.featuredKicker}</span>
              <h2>{filtersActive ? t.filteredTitle : t.featuredTitle}</h2>
              <p aria-live="polite">{filtersActive ? t.resultCount(total) : isDemoMode ? t.browseHint : t.approvedListingCount(total)}</p>
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
          {isDemoMode && <p className="demo-notice">{t.demoNotice}</p>}
          {listingError && <p className="owner-feedback owner-feedback-error" role="alert">{t.feedError}</p>}
          {loading === "replace" ? (
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
            <div className="empty-state">
              <Search size={24} />
              <h3>{filtersActive ? t.noMatchTitle : t.noListingsYet}</h3>
              <p>{filtersActive ? t.noMatchText : t.ownerDescription}</p>
              {filtersActive && <button className="button button-outline" type="button" onClick={resetFilters}>{t.showAll}</button>}
            </div>
          )}
        </section>

        <section className="why-section" id="why-sakani">
          <div className="section-wrap">
            <div className="why-heading">
              <span className="section-kicker">{t.whyKicker}</span>
              <h2>{t.whyTitleFirst}<br />{t.whyTitleSecond}</h2>
              <p>{t.whyDescription}</p>
            </div>
            <div className="benefit-grid">
              <article className="benefit-card"><span className="benefit-icon mint"><ShieldCheck size={22} /></span><span className="benefit-index">01</span><h3>{t.benefitOneTitle}</h3><p>{t.benefitOneText}</p></article>
              <article className="benefit-card"><span className="benefit-icon peach"><MapPin size={22} /></span><span className="benefit-index">02</span><h3>{t.benefitTwoTitle}</h3><p>{t.benefitTwoText}</p></article>
              <article className="benefit-card"><span className="benefit-icon lavender"><MessageCircle size={22} /></span><span className="benefit-index">03</span><h3>{t.benefitThreeTitle}</h3><p>{t.benefitThreeText}</p></article>
            </div>
          </div>
        </section>

        <OwnerPortal locale={locale} />

        <section className="contact-section section-wrap" id="contact">
          <div className="contact-panel">
            <span className="contact-orbit orbit-one" />
            <span className="contact-orbit orbit-two" />
            <div className="contact-copy">
              <span className="contact-kicker">{t.journeyKicker}</span>
              <h2>{t.journeyTitle}</h2>
              <p>{t.journeyDescription}</p>
            </div>
            <a className="button button-light" href="#search">{t.startSearch} <ArrowUpLeft size={18} /></a>
          </div>
        </section>
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}
