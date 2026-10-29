import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  CalendarCheck,
  Flag,
  Info,
  Map as MapIcon,
  MapPin,
  Mars,
  ShieldAlert,
  ShieldCheck,
  Venus,
  Wallet,
  Wifi,
  Wind,
} from "lucide-react";
import AskTeam from "@/components/ask-team";
import BookHome from "@/components/book-home";
import Image from "next/image";
import Link from "next/link";
import ListingGallery from "@/components/listing-gallery";
import { ReportListing, ShareListingButton } from "@/components/listing-actions";
import { TrackListingView } from "@/components/listing-tracking";
import PropertyCard from "@/components/property-card";
import SaveButton from "@/components/save-button";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { areaLabel as areaName, governorateLabel, placeLabel } from "@/lib/egypt";
import { bilingualMetadata } from "@/lib/metadata";
import { SITE_URL, listingPath, whatsappLink } from "@/lib/site";
import { DEFAULT_PAYMENT_SETTINGS, fetchPaymentSettings } from "@/lib/payments";
import { fetchPublicProfile } from "@/lib/profiles";
import { fetchSimilarListings, listingRef } from "@/lib/supabase/listings";
import { getApprovedListing, getSupabaseServerClient } from "@/lib/supabase/server";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type ListingParams = { params: Promise<{ id: string }> };

export async function generateListingMetadata(locale: SiteLocale, { params }: ListingParams): Promise<Metadata> {
  const { id } = await params;
  const listing = await getApprovedListing(id);
  if (!listing) return { title: SITE_COPY[locale].notFoundTitle, robots: { index: false } };

  const t = SITE_COPY[locale];
  const title = locale === "ar" ? listing.title_ar : listing.title_en;
  const description = (locale === "ar" ? listing.description_ar : listing.description_en).slice(0, 160);
  return bilingualMetadata(locale, `/listings/${listing.id}`, {
    title: `${title} | ${t.brandLabel}`,
    description,
    image: listing.images[0],
  });
}

/** Airbnb-style listing page: title, photo grid, details on one side and a sticky contact card on the other. */
export default async function ListingRoute({ locale, params }: { locale: SiteLocale } & ListingParams) {
  const { id } = await params;
  const listing = await getApprovedListing(id);
  if (!listing) notFound();

  const t = SITE_COPY[locale];
  const otherLocale: SiteLocale = locale === "ar" ? "en" : "ar";
  const title = locale === "ar" ? listing.title_ar : listing.title_en;
  const description = locale === "ar" ? listing.description_ar : listing.description_en;
  const areaLabel = areaName(locale, listing.area);
  const governorate = governorateLabel(locale, listing.city);
  const place = placeLabel(locale, listing.area, listing.city);
  const intlLocale = locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG";
  const numberFormat = new Intl.NumberFormat(intlLocale);
  const dateFormat = new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium" });
  const monthYear = new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric" });
  const verified = listing.verification_status === "verified";
  const ref = listingRef(listing.id);
  const pageUrl = `${SITE_URL}${listingPath(locale, listing.id)}`;
  const serverClient = getSupabaseServerClient();
  const [similar, settings, host] = serverClient
    ? await Promise.all([
        fetchSimilarListings(serverClient, listing),
        fetchPaymentSettings(serverClient),
        listing.host_id && !listing.is_demo ? fetchPublicProfile(serverClient, listing.host_id) : Promise.resolve(null),
      ])
    : [[], null, null];
  const fees = settings ?? DEFAULT_PAYMENT_SETTINGS;
  // Guests reach the Sakani team, never the host directly; the team checks with the host first.
  const teamHref = fees.team_whatsapp ? whatsappLink(fees.team_whatsapp, t.askSakaniMessage(ref, title, pageUrl)) : null;
  const mapQuery = encodeURIComponent(`${listing.area}, ${listing.city}, Egypt`);

  const amenityList = [
    { icon: Wifi, label: t.wifi, available: listing.wifi },
    { icon: Wind, label: t.airConditioning, available: listing.air_conditioning },
    { icon: ShieldCheck, label: t.secure, available: listing.security },
  ];
  const genderHighlight = t.highlightGender[listing.gender];
  const highlights = [
    verified
      ? { icon: BadgeCheck, title: t.highlightVerifiedTitle, text: listing.verified_at ? t.highlightVerifiedText(monthYear.format(new Date(listing.verified_at))) : t.listingVerifiedNote }
      : { icon: Info, title: t.highlightReviewedTitle, text: t.listingUnverifiedNote },
    { icon: listing.gender === "female" ? Venus : Mars, title: genderHighlight.title, text: genderHighlight.text },
    { icon: MapPin, title: areaLabel, text: governorate },
  ];

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Accommodation",
    name: title,
    description,
    url: pageUrl,
    image: listing.images,
    numberOfBedrooms: listing.total_beds,
    address: { "@type": "PostalAddress", addressLocality: listing.area, addressRegion: governorateLabel("en", listing.city), addressCountry: "EG" },
    amenityFeature: amenityList.filter((amenity) => amenity.available).map((amenity) => ({ "@type": "LocationFeatureSpecification", name: amenity.label, value: true })),
    offers: { "@type": "Offer", price: listing.monthly_price, priceCurrency: "EGP", availability: "https://schema.org/InStock" },
  };

  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader locale={locale} switchHref={listingPath(otherLocale, listing.id)} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />

      <TrackListingView listingId={listing.id} />
      <main className="listing3 section-wrap">
        <div className="listing3-top">
          <h1>{title}</h1>
          <div className="listing3-actions">
            <ShareListingButton locale={locale} title={title} url={pageUrl} className="listing3-action" />
            <SaveButton locale={locale} listingId={listing.id} title={title} variant="page" />
          </div>
        </div>

        <ListingGallery locale={locale} images={listing.images} altFor={listing.images.map((_, index) => t.photoAlt(title, index + 1))} />

        <div className="listing3-layout">
          <div className="listing3-main">
            <section className="listing3-summary">
              <h2>{t.homesIn(t[listing.property_type], areaLabel)} · {t[listing.gender]}</h2>
              <p>{t.bedsSummary(listing.available_beds, listing.total_beds)}</p>
              <p className="listing3-location"><MapPin size={15} /> {place}</p>
            </section>

            <ul className="listing3-highlights">
              {highlights.map(({ icon: Icon, title: highlightTitle, text }) => (
                <li key={highlightTitle}>
                  <Icon size={24} strokeWidth={1.6} />
                  <div><strong>{highlightTitle}</strong><span>{text}</span></div>
                </li>
              ))}
            </ul>

            <section className="listing3-section" aria-labelledby="listing-description-title">
              <h2 id="listing-description-title">{t.aboutHome}</h2>
              <p className="listing-description">{description}</p>
            </section>

            {host && (
              <section className="listing3-section listing-host" aria-labelledby="listing-host-title">
                <h2 id="listing-host-title">{t.hostedBy(host.first_name || t.roleHost)}</h2>
                <Link className="host-card" href={`/${locale}/users/${host.id}`}>
                  <span className="host-card-avatar">
                    {host.avatar_url ? <Image src={host.avatar_url} alt="" width={56} height={56} /> : (host.first_name || "?").charAt(0).toUpperCase()}
                  </span>
                  <span className="host-card-text">
                    <strong>{host.first_name || t.roleHost}{host.id_verified && <BadgeCheck size={16} aria-label={t.idVerified} />}</strong>
                    <small>{t.memberSince(monthYear.format(new Date(host.member_since)))} · {t.placesCount(host.places)}</small>
                  </span>
                </Link>
                <p className="field-hint">{t.hostContactNote}</p>
              </section>
            )}

            <section className="listing3-section" aria-labelledby="listing-amenities-title">
              <h2 id="listing-amenities-title">{t.offersTitle}</h2>
              <ul className="listing3-offers">
                {amenityList.map(({ icon: Icon, label, available }) => (
                  <li key={label} className={available ? "" : "is-missing"}>
                    <Icon size={22} strokeWidth={1.6} />
                    <span>{label}</span>
                    {!available && <span className="visually-hidden">({t.notAvailable})</span>}
                  </li>
                ))}
              </ul>
            </section>

            <section className="listing3-section" aria-labelledby="listing-map-title">
              <h2 id="listing-map-title">{t.whereTitle}</h2>
              <p className="listing3-map-place">{place}</p>
              <div className="listing3-map">
                <iframe
                  title={t.mapTitle(areaLabel)}
                  src={`https://maps.google.com/maps?q=${mapQuery}&z=14&hl=${locale}&output=embed`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <p className="listing2-maps">
                <small>{t.mapsHint}</small>
                <a href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noreferrer">
                  <MapIcon size={16} /> {t.openInMaps}
                </a>
              </p>
            </section>
          </div>

          <aside className="listing3-aside">
            <div className="listing3-card">
              <p className="listing3-price"><strong>{numberFormat.format(listing.monthly_price)}</strong> {t.perMonth}</p>
              <dl className="listing3-terms">
                <div><dt>{t.deposit}</dt><dd>{listing.deposit > 0 ? numberFormat.format(listing.deposit) : t.noDeposit}</dd></div>
                <div><dt>{t.beds}</dt><dd>{t.bedsSummary(listing.available_beds, listing.total_beds)}</dd></div>
              </dl>
              <p className="listing3-ref">{t.listingRefLabel}: <strong dir="ltr">{ref}</strong></p>
              {listing.is_demo && <p className="demo-pill-line"><span className="demo-pill">{t.demoBadge}</span></p>}
              <BookHome locale={locale} listingId={listing.id} monthlyPrice={listing.monthly_price} fees={fees} isDemo={listing.is_demo} />
              <AskTeam locale={locale} listingId={listing.id} whatsappHref={teamHref} className="button button-outline listing2-whatsapp" />
              <p className="listing3-middleman"><ShieldCheck size={16} /> {t.middlemanNote}</p>
              <p className={`listing-trust ${verified ? "is-verified" : ""}`}>
                {verified ? <BadgeCheck size={16} /> : <Info size={16} />}
                {verified ? t.listingVerifiedNote : t.listingUnverifiedNote}
              </p>
              <p className="listing-listed">
                {t.listedOn}: <time dateTime={listing.created_at}>{dateFormat.format(new Date(listing.created_at))}</time>
                {listing.updated_at && listing.updated_at.slice(0, 10) !== listing.created_at.slice(0, 10) && (
                  <> · {t.updatedOn}: <time dateTime={listing.updated_at}>{dateFormat.format(new Date(listing.updated_at))}</time></>
                )}
              </p>
            </div>
          </aside>
        </div>

        <section className="listing3-know" aria-labelledby="know-title">
          <h2 id="know-title">{t.thingsToKnow}</h2>
          <div className="listing3-know-grid">
            <div><ShieldAlert size={22} strokeWidth={1.6} /><strong>{t.safetyTitle}</strong><p>{t.safetyText}</p></div>
            <div><Wallet size={22} strokeWidth={1.6} /><strong>{t.beforePayTitle}</strong><p>{t.beforePayText}</p></div>
            <div><Flag size={22} strokeWidth={1.6} /><strong>{t.knowReportTitle}</strong><p>{t.knowReportText}</p><ReportListing locale={locale} listingId={listing.id} /></div>
          </div>
        </section>

        {similar.length > 0 && (
          <section className="listing3-similar" aria-labelledby="similar-title">
            <h2 id="similar-title">{t.similarListings(governorate)}</h2>
            <div className="property-grid">
              {similar.map((item) => <PropertyCard key={item.id} property={item} locale={locale} />)}
            </div>
          </section>
        )}
      </main>

      {/* Phones: price, booking and the team's WhatsApp always within reach. */}
      <div className="listing2-bar">
        <p className="listing3-price"><strong>{numberFormat.format(listing.monthly_price)}</strong> {t.perMonth}</p>
        <div className="listing2-bar-actions">
          <AskTeam locale={locale} listingId={listing.id} whatsappHref={teamHref} className="button button-outline listing2-bar-ask" compact />
          <a className="button button-primary" href="#book"><CalendarCheck size={17} /> {t.bookNow}</a>
        </div>
      </div>

      <SiteFooter locale={locale} switchHref={listingPath(otherLocale, listing.id)} tab={false} />
    </div>
  );
}
