"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Heart, House, Search, Share2 } from "lucide-react";
import { properties as sampleProperties } from "@/lib/data";
import type { Property } from "@/types";
import CategoryBar from "@/components/category-bar";
import FiltersModal from "@/components/filters-modal";
import PropertyCard from "@/components/property-card";
import SearchPill from "@/components/search-pill";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { useSavedListings } from "@/lib/saved";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  EMPTY_FILTERS,
  fetchApprovedListings,
  fetchListingsByIds,
  filtersToParams,
  hasActiveFilters,
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
  /** Filters from the page address (?university=…), so searches from other pages and shared links work. */
  initialFilters: ListingFilters;
  initialSaved: boolean;
};

const FAQ_PREVIEW = 4;

function filterSamples(filters: ListingFilters) {
  const minPrice = Number(filters.minPrice);
  const maxPrice = Number(filters.maxPrice);
  const matches = sampleProperties.filter((property) =>
    (!filters.governorate || property.city === filters.governorate) &&
    (!filters.university || property.university === filters.university) &&
    (!filters.area || property.area.toLowerCase().includes(filters.area.trim().toLowerCase())) &&
    (!filters.gender || property.gender === filters.gender) &&
    (!filters.propertyType || property.property_type === filters.propertyType) &&
    (!minPrice || property.monthly_price >= minPrice) &&
    (!maxPrice || property.monthly_price <= maxPrice) &&
    (!filters.verified || property.verification_status === "verified") &&
    filters.amenities.every((amenity) => property[amenity]),
  );
  if (filters.sort === "price_asc") matches.sort((a, b) => a.monthly_price - b.monthly_price);
  if (filters.sort === "price_desc") matches.sort((a, b) => b.monthly_price - a.monthly_price);
  return matches;
}

export default function HomePage({ locale, initialListings, initialTotal, initialError, initialFilters, initialSaved }: HomePageProps) {
  const t = SITE_COPY[locale];
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const isDemoMode = initialListings === null;
  const [filters, setFilters] = useState<ListingFilters>(initialFilters);
  const [listings, setListings] = useState<Property[]>(initialListings ?? filterSamples(initialFilters));
  const [total, setTotal] = useState(initialListings ? initialTotal : filterSamples(initialFilters).length);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState<"none" | "replace" | "more">("none");
  const [listingError, setListingError] = useState(initialError);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const requestId = useRef(0);
  const savedIds = useSavedListings();
  const savedKey = savedIds.join(",");
  const [showSaved, setShowSaved] = useState(initialSaved);
  const [savedListings, setSavedListings] = useState<Property[] | null>(null);
  const filtersActive = hasActiveFilters(filters);
  const otherLocale: SiteLocale = locale === "ar" ? "en" : "ar";

  // Old links to sections that moved to their own pages (QR codes, shared messages).
  useEffect(() => {
    const hash = window.location.hash;
    if (hash === "#owner") router.replace(`/${locale}/host`);
    else if (hash === "#contact" || hash === "#faq") router.replace(`/${locale}/help${hash}`);
  }, [locale, router]);

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

  /** Keeps the address bar in step with the search, so it can be shared or reloaded. */
  function syncAddress(next: ListingFilters, saved: boolean) {
    const params = filtersToParams(next);
    if (saved) params.set("saved", "1");
    const query = params.toString();
    window.history.replaceState(null, "", `/${locale}${query ? `?${query}` : ""}${window.location.hash}`);
  }

  async function loadListings(nextFilters: ListingFilters, nextPage: number) {
    if (isDemoMode) {
      const matches = filterSamples(nextFilters);
      setListings(matches);
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

  function applyFilters(next: ListingFilters) {
    setShowSaved(false);
    setFilters(next);
    syncAddress(next, false);
    void loadListings(next, 0);
  }

  function updateFilters(patch: Partial<ListingFilters>) {
    applyFilters({ ...filters, ...patch });
  }

  function toggleSaved() {
    const next = !showSaved;
    setSavedListings(null);
    setShowSaved(next);
    syncAddress(filters, next);
  }

  const closeFilters = useCallback(() => setFiltersOpen(false), []);

  // Count of Filters-window settings not visible as a category or in the search pill.
  const extraCount = [filters.minPrice, filters.maxPrice].filter(Boolean).length + filters.amenities.filter((item) => item !== "furnished").length;
  const hasMore = !isDemoMode && listings.length < total;
  const searchValue = { governorate: filters.governorate, university: filters.university, gender: filters.gender };

  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader
        locale={locale}
        switchHref={`/${otherLocale}`}
        search={(
          <SearchPill
            key={`${searchValue.governorate}|${searchValue.university}|${searchValue.gender}`}
            locale={locale}
            value={searchValue}
            onSearch={(values) => {
              updateFilters(values);
              document.getElementById("homes")?.scrollIntoView({ behavior: "smooth" });
            }}
          />
        )}
      >
        <CategoryBar
          locale={locale}
          filters={filters}
          onChange={updateFilters}
          onOpenFilters={() => setFiltersOpen(true)}
          extraCount={extraCount}
          savedCount={isDemoMode ? 0 : savedIds.length}
          showSaved={showSaved}
          onToggleSaved={toggleSaved}
        />
      </SiteHeader>

      <main>
        <section className="home-intro section-wrap">
          <h1>{t.heroFirst} {t.heroSecond}</h1>
          <p className="home-trust">{t.trustReviewed} · {t.trustDirect} · {t.trustFree}</p>
        </section>

        <section className="listings-section section-wrap" id="homes" aria-labelledby="homes-title">
          <div className="listings-head">
            <div>
              <h2 id="homes-title">{showSaved ? t.savedTitle : filtersActive ? t.filteredTitle : t.featuredTitle}</h2>
              <p aria-live="polite">{showSaved ? t.savedCount(savedIds.length) : filtersActive ? t.resultCount(total) : isDemoMode ? t.browseHint : t.approvedListingCount(total)}</p>
            </div>
            {!showSaved && (
              <label className="listing-sort">
                <span className="visually-hidden">{t.sortLabel}</span>
                <span className="select-wrap">
                  <select value={filters.sort} aria-label={t.sortLabel} onChange={(event) => updateFilters({ sort: event.target.value as ListingSort })}>
                    <option value="newest">{t.sortNewest}</option>
                    <option value="price_asc">{t.sortPriceAsc}</option>
                    <option value="price_desc">{t.sortPriceDesc}</option>
                  </select>
                  <ChevronDown size={16} />
                </span>
              </label>
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
                <Heart size={26} />
                <h3>{t.savedEmptyTitle}</h3>
                <p>{t.savedEmptyText}</p>
                <button className="button button-outline" type="button" onClick={toggleSaved}>{t.savedBack}</button>
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
          ) : filtersActive ? (
            <div className="empty-state">
              <Search size={26} />
              <h3>{t.noMatchTitle}</h3>
              <p>{t.noMatchText}</p>
              <button className="button button-outline" type="button" onClick={() => applyFilters(EMPTY_FILTERS)}>{t.showAll}</button>
            </div>
          ) : (
            <div className="empty-launch">
              <span className="empty-launch-icon"><House size={26} /></span>
              <h3>{t.emptyTitle}</h3>
              <p>{t.emptyText}</p>
              <div className="empty-launch-actions">
                <Link className="button button-primary" href={`/${locale}/host`}>{t.emptyOwnerCta}</Link>
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
          )}
        </section>

        <section className="host-banner section-wrap" aria-labelledby="host-banner-title">
          <div className="host-banner-card">
            <div className="host-banner-copy">
              <h2 id="host-banner-title">{t.hostBannerTitle}</h2>
              <p>{t.hostBannerText}</p>
              <Link className="button button-primary" href={`/${locale}/host`}>{t.navOwner}</Link>
            </div>
            <div className="host-banner-photo">
              <Image
                src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=75"
                alt=""
                fill
                sizes="(max-width: 760px) 100vw, 50vw"
              />
            </div>
          </div>
        </section>

        <section className="faq-section section-wrap" id="faq" aria-labelledby="faq-title">
          <h2 id="faq-title">{t.faqTitle}</h2>
          <div className="faq-list">
            {t.faqItems.slice(0, FAQ_PREVIEW).map((item) => (
              <details className="faq-item" key={item.q}>
                <summary>{item.q}<ChevronDown size={18} aria-hidden="true" /></summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
          <Link className="text-link" href={`/${locale}/help#faq`}>{t.menuHelp} {locale === "ar" ? "←" : "→"}</Link>
        </section>
      </main>

      <SiteFooter locale={locale} switchHref={`/${otherLocale}`} tab={showSaved ? "saved" : "explore"} />

      {filtersOpen && (
        <FiltersModal
          locale={locale}
          filters={filters}
          supabase={isDemoMode ? null : supabase}
          onClose={closeFilters}
          onApply={(next) => {
            setFiltersOpen(false);
            applyFilters(next);
          }}
        />
      )}
    </div>
  );
}
