"use client";

import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowUpLeft,
  BadgeCheck,
  BedDouble,
  Building2,
  Check,
  ChevronDown,
  Clock3,
  MapPin,
  Menu,
  MessageCircle,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Wifi,
  Wind,
} from "lucide-react";
import { areas, properties, universities } from "@/lib/data";
import type { Property } from "@/types";
import OwnerPortal from "@/components/owner-portal";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { toProperty, type MarketplaceListing } from "@/lib/supabase/listings";

const SUPABASE_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
const LISTING_COLUMNS =
  "id,owner_id,title_ar,title_en,description_ar,description_en,area,university,gender,property_type,monthly_price,deposit,furnished,wifi,air_conditioning,security,available_beds,total_beds,walking_distance_minutes,whatsapp_number,image_url,status,created_at";

type Filters = {
  university: string;
  area: string;
  gender: string;
};

const initialFilters: Filters = { university: "", area: "", gender: "" };

function Brand({ locale }: { locale: SiteLocale }) {
  const t = SITE_COPY[locale];
  return (
    <a className="brand" href="#top" aria-label={t.brandAria}>
      <span className="brand-mark"><Building2 size={21} strokeWidth={2.2} /></span>
      <span className={`brand-name${locale === "en" ? " brand-name-latin" : ""}`}>{t.brandLabel}<span className="brand-period">.</span></span>
    </a>
  );
}

function PropertyCard({ property, locale }: { property: Property; locale: SiteLocale }) {
  const t = SITE_COPY[locale];
  const title = locale === "ar" ? property.title_ar : property.title_en;
  const genderLabel = t[property.gender];
  const area = areas.find((candidate) => candidate.name_en === property.area);
  const areaLabel = locale === "ar" ? area?.name ?? property.area : property.area;
  const whatsappNumber = property.whatsapp_number.replace(/\D/g, "");
  const whatsappMessage = encodeURIComponent(
    locale === "ar" ? `مرحباً، أود الاستفسار عن: ${title}` : `Hello, I’m interested in: ${title}`,
  );
  const price = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG").format(property.monthly_price);
  const availableBeds = property.available_beds === 1
    ? t.oneBedAvailable
    : t.bedAvailable(property.available_beds);

  return (
    <article className="property-card">
      <div className="property-image-wrap">
        <Image
          className="property-image"
          src={property.images[0]}
          alt={t.sampleImageAlt(title)}
          fill
          sizes="(max-width: 640px) 40vw, (max-width: 900px) 50vw, 33vw"
          unoptimized
          loading="lazy"
          decoding="async"
        />
        <div className="property-badges">
          {property.verification_status === "verified" && (
            <span className="verified-badge"><BadgeCheck size={14} /> {t.verified}</span>
          )}
          <span className="gender-badge">{genderLabel}</span>
        </div>
        <span className="walking-badge"><Clock3 size={14} /> {t.walkingMinutes(property.walking_distance_minutes)}</span>
      </div>

      <div className="property-content">
        <div className="property-location"><MapPin size={15} /> {locale === "ar" ? `${areaLabel}، ${t.city}` : `${areaLabel}, ${t.city}`}</div>
        <h3 className="property-title">{title}</h3>
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
          <a
            className="property-contact"
            href={`https://wa.me/${whatsappNumber}?text=${whatsappMessage}`}
            target="_blank"
            rel="noreferrer"
            aria-label={t.whatsappAria(title)}
          >
            <MessageCircle size={17} />
            {t.inquire}
          </a>
        </div>
      </div>
    </article>
  );
}

export default function HomePage({ locale }: { locale: SiteLocale }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [listingProperties, setListingProperties] = useState<Property[]>(
    SUPABASE_CONFIGURED ? [] : properties.slice(0, 4),
  );
  const [isLoadingListings, setIsLoadingListings] = useState(SUPABASE_CONFIGURED);
  const [listingError, setListingError] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(!SUPABASE_CONFIGURED);
  const t = SITE_COPY[locale];

  useEffect(() => {
    if (!supabase) return;

    let isMounted = true;
    void supabase
      .from("properties")
      .select(LISTING_COLUMNS)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(24)
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          console.error("Could not load published listings:", error);
          setListingError(true);
          setListingProperties([]);
          setIsDemoMode(false);
        } else {
          setListingProperties(((data ?? []) as MarketplaceListing[]).map(toProperty));
          setListingError(false);
          setIsDemoMode(false);
        }
        setIsLoadingListings(false);
      });

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const matchingProperties = listingProperties.filter((property) =>
    (!filters.university || property.university === filters.university) &&
    (!filters.area || property.area === filters.area) &&
    (!filters.gender || property.gender === filters.gender),
  );
  const visibleProperties = Object.values(filters).some(Boolean)
    ? matchingProperties
    : matchingProperties.slice(0, 6);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    document.getElementById("homes")?.scrollIntoView({ behavior: "smooth" });
  }

  function resetFilters() {
    setFilters(initialFilters);
  }

  function closeMobileMenu(event: MouseEvent<HTMLAnchorElement>) {
    event.currentTarget.closest("details")?.removeAttribute("open");
  }

  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <header className="site-header" id="top">
        <div className="header-inner">
          <Brand locale={locale} />
          <div className="mobile-menu">
            <details>
              <summary className="menu-toggle" aria-label={t.openMenu}>
                <Menu size={21} />
              </summary>
              <nav className="main-nav" aria-label={t.navLabel}>
                <a href="#homes" onClick={closeMobileMenu}>{t.navListings}</a>
                <a href="#why-sakani" onClick={closeMobileMenu}>{t.navWhy}</a>
                <a href="#owner" onClick={closeMobileMenu}>{t.navOwner}</a>
                <a href="#contact" onClick={closeMobileMenu}>{t.navContact}</a>
              </nav>
            </details>
          </div>
          <nav className="main-nav desktop-nav" aria-label={t.navLabel}>
            <a href="#homes">{t.navListings}</a>
            <a href="#why-sakani">{t.navWhy}</a>
            <a href="#owner">{t.navOwner}</a>
            <a href="#contact">{t.navContact}</a>
          </nav>
          <div className="header-actions">
            <a className="language-toggle" href={locale === "ar" ? "/en" : "/ar"} aria-label={`${t.languageName} language`}>
              {t.localeLabel}
            </a>
            <a className="header-cta" href="#search" aria-label={t.headerSearch}>
              <span className="header-cta-label">{t.headerSearch}</span>
              <ArrowUpLeft size={17} />
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-inner">
            <div className="hero-copy">
              <span className="eyebrow"><Sparkles size={15} /> {t.heroBadge}</span>
              <h1>{t.heroFirst}<br /><span>{t.heroSecond}</span></h1>
              <p className="hero-description">
                {t.heroDescription}
              </p>
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
                unoptimized
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
              <label className="field">
                <span>{t.university}</span>
                <span className="select-wrap">
                  <select value={filters.university} onChange={(event) => setFilters({ ...filters, university: event.target.value })}>
                    <option value="">{t.allUniversities}</option>
                    {universities.map((university) => <option key={university.id} value={university.name_en}>{locale === "ar" ? university.name : university.name_en}</option>)}
                  </select>
                  <ChevronDown size={16} />
                </span>
              </label>
              <label className="field">
                <span>{t.area}</span>
                <span className="select-wrap">
                  <select value={filters.area} onChange={(event) => setFilters({ ...filters, area: event.target.value })}>
                    <option value="">{t.allAreas}</option>
                    {areas.map((area) => <option key={area.id} value={area.name_en}>{locale === "ar" ? area.name : area.name_en}</option>)}
                  </select>
                  <ChevronDown size={16} />
                </span>
              </label>
              <label className="field">
                <span>{t.housing}</span>
                <span className="select-wrap">
                  <select value={filters.gender} onChange={(event) => setFilters({ ...filters, gender: event.target.value })}>
                    <option value="">{t.all}</option>
                    <option value="female">{t.female}</option>
                    <option value="male">{t.male}</option>
                    <option value="mixed">{t.mixed}</option>
                  </select>
                  <ChevronDown size={16} />
                </span>
              </label>
              <div className="search-actions">
                <button className="button button-primary search-button" type="submit"><Search size={18} /> {t.searchButton}</button>
                {Object.values(filters).some(Boolean) && <button className="reset-button" type="button" onClick={resetFilters}>{t.clearFilters}</button>}
              </div>
            </form>
          </div>
        </section>

        <section className="listings-section section-wrap" id="homes">
          <div className="section-heading">
            <div>
              <span className="section-kicker">{t.featuredKicker}</span>
              <h2>{Object.values(filters).some(Boolean) ? t.filteredTitle : t.featuredTitle}</h2>
              <p>{Object.values(filters).some(Boolean) ? t.resultCount(matchingProperties.length) : isDemoMode ? t.browseHint : t.approvedListingCount(matchingProperties.length)}</p>
            </div>
            <a href="#search" className="section-link">{t.customizeSearch} <ArrowLeft size={17} /></a>
          </div>
          {isDemoMode && <p className="demo-notice">{t.demoNotice}</p>}
          {listingError && <p className="owner-feedback owner-feedback-error" role="alert">{t.feedError}</p>}
          {isLoadingListings ? (
            <div className="listings-loading">{t.loadingListings}</div>
          ) : visibleProperties.length > 0 ? (
            <div className="property-grid">
              {visibleProperties.map((property) => <PropertyCard key={property.id} property={property} locale={locale} />)}
            </div>
          ) : (
            <div className="empty-state">
              <Search size={24} />
              <h3>{Object.values(filters).some(Boolean) ? t.noMatchTitle : t.noListingsYet}</h3>
              <p>{Object.values(filters).some(Boolean) ? t.noMatchText : t.ownerDescription}</p>
              {Object.values(filters).some(Boolean) && <button className="button button-outline" type="button" onClick={resetFilters}>{t.showAll}</button>}
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

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand"><Brand locale={locale} /><p>{t.footerText}</p></div>
          <div className="footer-links"><a href="#homes">{t.navListings}</a><a href="#why-sakani">{t.footerAbout}</a><a href="#search">{t.headerSearch}</a><a href="#owner">{t.navOwner}</a><a href={`/${locale}/sign-in`}>{t.adminNav}</a></div>
          <p className="copyright">© {new Date().getFullYear()} {t.brandLabel}. {t.allRights}</p>
        </div>
      </footer>
    </div>
  );
}
