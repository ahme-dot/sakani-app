import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  BedDouble,
  Building2,
  Check,
  Clock3,
  GraduationCap,
  Info,
  MapPin,
  MessageCircle,
  ShieldAlert,
  ShieldCheck,
  Users,
  Wallet,
  Wifi,
  Wind,
} from "lucide-react";
import ListingGallery from "@/components/listing-gallery";
import { ReportListing, ShareListingButton } from "@/components/listing-actions";
import PropertyCard from "@/components/property-card";
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
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG");
  const verified = listing.verification_status === "verified";
  const whatsappHref = whatsappLink(listing.whatsapp_number, t.whatsappMessage(title));
  const pageUrl = `${SITE_URL}${listingPath(locale, listing.id)}`;
  const serverClient = getSupabaseServerClient();
  const similar = serverClient ? await fetchSimilarListings(serverClient, listing) : [];

  const facts = [
    { icon: Building2, label: t.propertyType, value: t[listing.property_type] },
    { icon: Users, label: t.adminDetailsGender, value: t[listing.gender] },
    { icon: BedDouble, label: t.beds, value: t.bedsSummary(listing.available_beds, listing.total_beds) },
    { icon: Clock3, label: t.walkingDistance, value: t.walkingMinutes(listing.walking_distance_minutes) },
    { icon: GraduationCap, label: t.university, value: universityLabel },
    { icon: Wallet, label: t.deposit, value: listing.deposit > 0 ? numberFormat.format(listing.deposit) : t.noDeposit },
  ];
  const amenities: Array<{ icon: typeof Check; label: string }> = [
    ...(listing.furnished ? [{ icon: Check, label: t.furnished }] : []),
    ...(listing.wifi ? [{ icon: Wifi, label: t.wifi }] : []),
    ...(listing.air_conditioning ? [{ icon: Wind, label: t.airConditioning }] : []),
    ...(listing.security ? [{ icon: ShieldCheck, label: t.secure }] : []),
  ];

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Accommodation",
    name: title,
    description,
    url: `${SITE_URL}${listingPath(locale, listing.id)}`,
    image: listing.images,
    numberOfBedrooms: listing.total_beds,
    address: { "@type": "PostalAddress", addressLocality: listing.area, addressRegion: "Giza", addressCountry: "EG" },
    amenityFeature: amenities.map((amenity) => ({ "@type": "LocationFeatureSpecification", name: amenity.label, value: true })),
    offers: { "@type": "Offer", price: listing.monthly_price, priceCurrency: "EGP", availability: "https://schema.org/InStock" },
  };

  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader locale={locale} sectionBase={`/${locale}`} switchHref={listingPath(otherLocale, listing.id)} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />

      <main className="listing2 section-wrap">
        <Link className="listing-back" href={`/${locale}#homes`}>
          <ArrowRight size={16} /> {t.backToListings}
        </Link>

        <ListingGallery images={listing.images} altFor={listing.images.map((_, index) => t.photoAlt(title, index + 1))} />

        <div className="listing2-layout">
          <div className="listing2-main">
            <div className="listing2-badges">
              {verified && <span className="listing2-badge is-verified"><BadgeCheck size={14} /> {t.verified}</span>}
              <span className="listing2-badge">{t[listing.property_type]}</span>
              <span className="listing2-badge">{t[listing.gender]}</span>
            </div>
            <h1>{title}</h1>
            <p className="listing2-location">
              <span><MapPin size={16} /> {locale === "ar" ? `${areaLabel}، ${t.city}` : `${areaLabel}, ${t.city}`}</span>
              <span><GraduationCap size={16} /> {universityLabel}</span>
            </p>

            <dl className="listing2-facts" aria-label={t.listingDetails}>
              {facts.map(({ icon: Icon, label, value }) => (
                <div key={label}>
                  <span className="listing2-fact-icon"><Icon size={18} /></span>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

            <section className="listing2-section" aria-labelledby="listing-description-title">
              <h2 id="listing-description-title">{t.listingDetails}</h2>
              <p className="listing-description">{description}</p>
            </section>

            {amenities.length > 0 && (
              <section className="listing2-section" aria-labelledby="listing-amenities-title">
                <h2 id="listing-amenities-title">{t.amenitiesTitle}</h2>
                <ul className="listing-amenities">
                  {amenities.map(({ icon: Icon, label }) => <li key={label}><Icon size={16} /> {label}</li>)}
                </ul>
              </section>
            )}

            <div className="listing-safety">
              <ShieldAlert size={18} />
              <div><strong>{t.safetyTitle}</strong><p>{t.safetyText}</p></div>
            </div>
          </div>

          <aside className="listing2-aside">
            <div className="listing2-card">
              <p className="listing2-price">
                <strong>{numberFormat.format(listing.monthly_price)}</strong>
                <span>{t.perMonth}</span>
              </p>
              <ul className="listing2-card-meta">
                <li><Wallet size={15} /> {listing.deposit > 0 ? t.depositLine(numberFormat.format(listing.deposit)) : t.noDeposit}</li>
                <li><BedDouble size={15} /> {t.availableBedsLine(listing.available_beds, listing.total_beds)}</li>
              </ul>
              <a className="button button-primary listing2-whatsapp" href={whatsappHref} target="_blank" rel="noreferrer">
                <MessageCircle size={18} /> {t.contactOwner}
              </a>
              <ShareListingButton locale={locale} title={title} url={pageUrl} className="listing2-share" />
              <p className={`listing-trust ${verified ? "is-verified" : ""}`}>
                {verified ? <BadgeCheck size={16} /> : <Info size={16} />}
                {verified ? t.listingVerifiedNote : t.listingUnverifiedNote}
              </p>
              <p className="listing-listed">
                {t.listedOn}: <time dateTime={listing.created_at}>{new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-EG", { dateStyle: "medium" }).format(new Date(listing.created_at))}</time>
              </p>
            </div>
            <ReportListing locale={locale} listingId={listing.id} />
          </aside>
        </div>

        {similar.length > 0 && (
          <section className="listing2-similar" aria-labelledby="similar-title">
            <h2 id="similar-title">{t.similarListings(universityLabel)}</h2>
            <div className="property-grid">
              {similar.map((item) => <PropertyCard key={item.id} property={item} locale={locale} />)}
            </div>
          </section>
        )}
      </main>

      {/* Phones: price and contact always within reach. */}
      <div className="listing2-bar">
        <p className="listing2-price">
          <strong>{numberFormat.format(listing.monthly_price)}</strong>
          <span>{t.perMonth}</span>
        </p>
        <a className="button button-primary" href={whatsappHref} target="_blank" rel="noreferrer">
          <MessageCircle size={18} /> {t.contactShort}
        </a>
      </div>

      <SiteFooter locale={locale} sectionBase={`/${locale}`} switchHref={listingPath(otherLocale, listing.id)} />
    </div>
  );
}
