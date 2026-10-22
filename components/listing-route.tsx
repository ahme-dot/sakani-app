import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  Clock3,
  Flag,
  Info,
  Map as MapIcon,
  MapPin,
  Mars,
  MessageCircle,
  ShieldAlert,
  ShieldCheck,
  Sofa,
  Users,
  Venus,
  Wallet,
  Wifi,
  Wind,
} from "lucide-react";
import ListingGallery from "@/components/listing-gallery";
import { ReportListing, ShareListingButton } from "@/components/listing-actions";
import { TrackListingView, WhatsAppLink } from "@/components/listing-tracking";
import PropertyCard from "@/components/property-card";
import SaveButton from "@/components/save-button";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { areas, universities } from "@/lib/data";
import { bilingualMetadata } from "@/lib/metadata";
import { SITE_URL, listingPath, whatsappLink } from "@/lib/site";
import { fetchSimilarListings } from "@/lib/supabase/listings";
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
  const area = areas.find((candidate) => candidate.name_en === listing.area);
  const university = universities.find((candidate) => candidate.name_en === listing.university);
  const areaLabel = locale === "ar" ? area?.name ?? listing.area : listing.area;
  const universityLabel = locale === "ar" ? university?.name ?? listing.university : listing.university;
  const place = locale === "ar" ? `${areaLabel}، ${t.city}` : `${areaLabel}, ${t.city}`;
  const intlLocale = locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG";
  const numberFormat = new Intl.NumberFormat(intlLocale);
  const dateFormat = new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium" });
  const monthYear = new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric" });
  const verified = listing.verification_status === "verified";
  const whatsappHref = whatsappLink(listing.whatsapp_number, t.whatsappMessage(title));
  const pageUrl = `${SITE_URL}${listingPath(locale, listing.id)}`;
  const serverClient = getSupabaseServerClient();
  const similar = serverClient ? await fetchSimilarListings(serverClient, listing) : [];
  const mapQuery = encodeURIComponent(`${listing.area}, Giza, Egypt`);

  const amenityList = [
    { icon: Sofa, label: t.furnished, available: listing.furnished },
    { icon: Wifi, label: t.wifi, available: listing.wifi },
    { icon: Wind, label: t.airConditioning, available: listing.air_conditioning },
    { icon: ShieldCheck, label: t.secure, available: listing.security },
  ];
  const genderHighlight = t.highlightGender[listing.gender];
  const highlights = [
    verified
      ? { icon: BadgeCheck, title: t.highlightVerifiedTitle, text: listing.verified_at ? t.highlightVerifiedText(monthYear.format(new Date(listing.verified_at))) : t.listingVerifiedNote }
      : { icon: Info, title: t.highlightReviewedTitle, text: t.listingUnverifiedNote },
    { icon: listing.gender === "female" ? Venus : listing.gender === "male" ? Mars : Users, title: genderHighlight.title, text: genderHighlight.text },
    { icon: Clock3, title: t.highlightWalkTitle(listing.walking_distance_minutes), text: universityLabel },
  ];

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Accommodation",
    name: title,
    description,
    url: pageUrl,
    image: listing.images,
    numberOfBedrooms: listing.total_beds,
    address: { "@type": "PostalAddress", addressLocality: listing.area, addressRegion: "Giza", addressCountry: "EG" },
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
              <p>{t.bedsSummary(listing.available_beds, listing.total_beds)} · {t.walkTo(listing.walking_distance_minutes, universityLabel)}</p>
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
              <WhatsAppLink listingId={listing.id} className="button button-primary listing2-whatsapp" href={whatsappHref}>
                <MessageCircle size={18} /> {t.contactOwner}
              </WhatsAppLink>
              <p className="listing3-nofee">{t.noFees}</p>
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
            <h2 id="similar-title">{t.similarListings(universityLabel)}</h2>
            <div className="property-grid">
              {similar.map((item) => <PropertyCard key={item.id} property={item} locale={locale} />)}
            </div>
          </section>
        )}
      </main>

      {/* Phones: price and contact always within reach. */}
      <div className="listing2-bar">
        <p className="listing3-price"><strong>{numberFormat.format(listing.monthly_price)}</strong> {t.perMonth}</p>
        <WhatsAppLink listingId={listing.id} className="button button-primary" href={whatsappHref}>
          <MessageCircle size={18} /> {t.contactShort}
        </WhatsAppLink>
      </div>

      <SiteFooter locale={locale} switchHref={listingPath(otherLocale, listing.id)} tab={false} />
    </div>
  );
}
