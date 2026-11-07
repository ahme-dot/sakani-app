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
  Star,
  CalendarX,
  Venus,
  Wallet,
} from "lucide-react";
import { AMENITIES } from "@/lib/amenities";
import AskTeam from "@/components/ask-team";
import ListingBar from "@/components/listing-bar";
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
import { fetchBookedRanges, fetchListingReviews, fetchSimilarListings, listingRef } from "@/lib/supabase/listings";
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
  const dateFormat = new Intl.DateTimeFormat(intlLocale, { dateStyle: "long" });
  const monthYear = new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric" });
  const verified = listing.verification_status === "verified";
  const wholePlace = listing.property_type === "apartment" || listing.property_type === "studio";
  const ref = listingRef(listing.id);
  const pageUrl = `${SITE_URL}${listingPath(locale, listing.id)}`;
  const serverClient = getSupabaseServerClient();
  // Asked only where it can matter. If the check itself fails, the booking step still refuses.
  const hostCheck = serverClient && !listing.is_demo
    ? Promise.resolve(serverClient.rpc("listing_host_ready", { target_listing: listing.id })).then(({ data, error }) => (error ? true : data !== false))
    : Promise.resolve(true);
  const [similar, settings, host, reviews, booked, hostReady] = serverClient
    ? await Promise.all([
        fetchSimilarListings(serverClient, listing),
        fetchPaymentSettings(serverClient),
        listing.host_id && !listing.is_demo ? fetchPublicProfile(serverClient, listing.host_id) : Promise.resolve(null),
        fetchListingReviews(serverClient, listing.id),
        fetchBookedRanges(serverClient, listing.id),
        hostCheck,
      ])
    : [[], null, null, [], [], true];
  const average = reviews.length ? Math.round((reviews.reduce((total, review) => total + review.rating, 0) / reviews.length) * 10) / 10 : 0;
  const fees = settings ?? DEFAULT_PAYMENT_SETTINGS;
  // Guests reach the Sakani team, never the host directly; the team checks with the host first.
  const teamHref = fees.team_whatsapp ? whatsappLink(fees.team_whatsapp, t.askSakaniMessage(ref, title, pageUrl)) : null;
  const mapQuery = encodeURIComponent(`${listing.area}, ${listing.city}, Egypt`);

  // What the place has first, then what it doesn't; amenities the owner hasn't answered yet are left out.
  const amenityList = AMENITIES
    .map((amenity) => ({ icon: amenity.icon, label: amenity[locale], value: listing[amenity.key] }))
    .filter((amenity) => amenity.value === true || amenity.value === false)
    .sort((a, b) => Number(b.value) - Number(a.value))
    .map(({ value, ...amenity }) => ({ ...amenity, available: value === true }));
  const amenitiesUnknown = AMENITIES.some((amenity) => listing[amenity.key] == null);
  const rented = listing.status === "rented";
  const rentedLabel = rented ? (listing.rented_until ? t.rentedBannerUntil(dateFormat.format(new Date(listing.rented_until))) : t.rentedBanner) : "";
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
    "@type": "Offer",
    url: pageUrl,
    price: listing.monthly_price,
    priceCurrency: "EGP",
    availability: listing.status === "rented" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
    itemOffered: {
      "@type": "Accommodation",
      name: title,
      description,
      image: listing.images,
      ...(listing.bedrooms ? { numberOfBedrooms: listing.bedrooms } : {}),
      address: { "@type": "PostalAddress", addressLocality: listing.area, addressRegion: governorateLabel("en", listing.city), addressCountry: "EG" },
      amenityFeature: amenityList.filter((amenity) => amenity.available).map((amenity) => ({ "@type": "LocationFeatureSpecification", name: amenity.label, value: true })),
    },
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
        {rented && <p className="listing-rented-banner" role="status"><CalendarX size={18} aria-hidden="true" /> {rentedLabel}</p>}

        <ListingGallery locale={locale} images={listing.images} altFor={listing.images.map((_, index) => t.photoAlt(title, index + 1))} />

        <div className="listing3-layout">
          <div className="listing3-main">
            <section className="listing3-summary">
              <h2>{t.homesIn(t[listing.property_type], areaLabel)} · {t[listing.gender]}</h2>
              <p>
                {[
                  // A flat or studio is rented whole: its rooms describe it, not "1 free of 1".
                  wholePlace ? null : t.bedsSummary(listing.available_beds, listing.total_beds),
                  listing.bedrooms ? t.bedroomsCount(listing.bedrooms) : null,
                  listing.bathrooms ? t.bathroomsCount(listing.bathrooms) : null,
                  listing.area_sqm ? t.areaSqm(numberFormat.format(listing.area_sqm)) : null,
                ].filter(Boolean).join(" · ")}
              </p>
              <p>
                {t.minStay(t.monthsCount(listing.min_months ?? 1))}
                {listing.available_from ? ` · ${t.availableFrom(dateFormat.format(new Date(listing.available_from)))}` : ""}
              </p>
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

            <section className="listing3-section listing-reviews" id="reviews" aria-labelledby="listing-reviews-title">
              <h2 id="listing-reviews-title">
                {reviews.length ? <><Star size={20} className="listing-reviews-star" /> {t.reviewsHeading(numberFormat.format(average), reviews.length)}</> : t.reviewsTitle}
              </h2>
              {reviews.length === 0 ? (
                <p className="field-hint">{t.reviewsEmpty}</p>
              ) : (
                <ul className="listing-reviews-list">
                  {reviews.slice(0, 12).map((review, index) => (
                    <li key={`${review.created_at}-${index}`}>
                      <span className="listing-review-stars" aria-label={t.reviewStarsValue(review.rating)}>{"★".repeat(review.rating)}<span aria-hidden="true">{"★".repeat(5 - review.rating)}</span></span>
                      {review.body && <p>{review.body}</p>}
                      <small>{review.guest_first_name || t.roleGuest} · {monthYear.format(new Date(review.created_at))}</small>
                    </li>
                  ))}
                </ul>
              )}
            </section>

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
              {amenitiesUnknown && <p className="listing3-offers-note">{t.amenitiesUnknown}</p>}
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
                {wholePlace
                  ? listing.bedrooms ? <div><dt>{t.bedroomsLabel}</dt><dd>{numberFormat.format(listing.bedrooms)}</dd></div> : null
                  : <div><dt>{t.beds}</dt><dd>{t.bedsSummary(listing.available_beds, listing.total_beds)}</dd></div>}
              </dl>
              <p className="listing3-ref">{t.listingRefLabel}: <strong dir="ltr">{ref}</strong></p>
              {booked.length > 0 && (
                <div className="listing-booked">
                  <strong>{t.bookedTitle}</strong>
                  <ul>
                    {booked.map((range) => <li key={range.starts}>{t.bookedRange(dateFormat.format(new Date(range.starts)), dateFormat.format(new Date(range.ends)))}</li>)}
                  </ul>
                </div>
              )}
              {listing.is_demo && <p className="demo-pill-line"><span className="demo-pill">{t.demoBadge}</span></p>}
              {rented ? (
                <div className="listing-rented-box">
                  <strong><CalendarX size={18} aria-hidden="true" /> {rentedLabel}</strong>
                  <p>{t.rentedAsideText}</p>
                  {similar.length > 0 && <a className="button button-primary" href="#similar-title">{t.rentedSeeSimilar}</a>}
                </div>
              ) : <BookHome locale={locale} listingId={listing.id} booked={booked} monthlyPrice={listing.monthly_price} deposit={listing.deposit} fees={fees} isDemo={listing.is_demo} minMonths={listing.min_months ?? 1} availableFrom={listing.available_from ?? null} freeBeds={wholePlace ? undefined : listing.available_beds} hostReady={hostReady} gender={listing.gender} />}
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
      <ListingBar>
        <p className="listing3-price"><strong>{numberFormat.format(listing.monthly_price)}</strong> {t.perMonth}</p>
        <div className="listing2-bar-actions">
          <AskTeam locale={locale} listingId={listing.id} whatsappHref={teamHref} className="button button-outline listing2-bar-ask" compact />
          {!listing.is_demo && !rented && hostReady && <a className="button button-primary" href="#book"><CalendarCheck size={17} /> {t.bookNow}</a>}
        </div>
      </ListingBar>

      <SiteFooter locale={locale} switchHref={listingPath(otherLocale, listing.id)} tab={false} />
    </div>
  );
}
