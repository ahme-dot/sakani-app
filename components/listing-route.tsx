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
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { areas, universities } from "@/lib/data";
import { bilingualMetadata } from "@/lib/metadata";
import { SITE_URL, listingPath, whatsappLink } from "@/lib/site";
import { getApprovedListing } from "@/lib/supabase/server";
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

  const facts = [
    { icon: Building2, label: t.propertyType, value: t[listing.property_type] },
    { icon: Users, label: t.housing, value: t[listing.gender] },
    { icon: GraduationCap, label: t.university, value: universityLabel },
    { icon: Clock3, label: t.walkingDistance, value: t.walkingMinutes(listing.walking_distance_minutes) },
    { icon: BedDouble, label: t.beds, value: t.bedsSummary(listing.available_beds, listing.total_beds) },
    { icon: Wallet, label: t.deposit, value: numberFormat.format(listing.deposit) },
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

      <main className="listing-page section-wrap">
        <Link className="listing-back" href={`/${locale}#homes`}>
          <ArrowRight size={16} /> {t.backToListings}
        </Link>

        <div className="listing-layout">
          <div className="listing-main">
            <ListingGallery images={listing.images} altFor={listing.images.map((_, index) => t.photoAlt(title, index + 1))} />

            <div className="listing-heading">
              <div className="property-location"><MapPin size={15} /> {locale === "ar" ? `${areaLabel}، ${t.city}` : `${areaLabel}, ${t.city}`}</div>
              <h1>{title}</h1>
              {verified && <span className="verified-badge"><BadgeCheck size={14} /> {t.verified}</span>}
            </div>

            <section className="listing-section" aria-labelledby="listing-details-title">
              <h2 id="listing-details-title">{t.listingDetails}</h2>
              <dl className="listing-facts">
                {facts.map(({ icon: Icon, label, value }) => (
                  <div key={label}>
                    <dt><Icon size={15} /> {label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="listing-section">
              <p className="listing-description">{description}</p>
            </section>

            {amenities.length > 0 && (
              <section className="listing-section" aria-labelledby="listing-amenities-title">
                <h2 id="listing-amenities-title">{t.amenitiesTitle}</h2>
                <ul className="listing-amenities">
                  {amenities.map(({ icon: Icon, label }) => <li key={label}><Icon size={16} /> {label}</li>)}
                </ul>
              </section>
            )}
          </div>

          <aside className="listing-aside">
            <div className="listing-price-card">
              <p className="property-price">
                <strong>{numberFormat.format(listing.monthly_price)}</strong>
                <span>{t.perMonth}</span>
              </p>
              <a className="button button-primary listing-contact" href={whatsappHref} target="_blank" rel="noreferrer">
                <MessageCircle size={18} /> {t.contactOwner}
              </a>
              <p className={`listing-trust ${verified ? "is-verified" : ""}`}>
                {verified ? <BadgeCheck size={16} /> : <Info size={16} />}
                {verified ? t.listingVerifiedNote : t.listingUnverifiedNote}
              </p>
              <p className="listing-listed">
                {t.listedOn}: <time dateTime={listing.created_at}>{new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-EG", { dateStyle: "medium" }).format(new Date(listing.created_at))}</time>
              </p>
            </div>
            <div className="listing-safety">
              <ShieldAlert size={18} />
              <div><strong>{t.safetyTitle}</strong><p>{t.safetyText}</p></div>
            </div>
          </aside>
        </div>
      </main>

      <SiteFooter locale={locale} sectionBase={`/${locale}`} switchHref={listingPath(otherLocale, listing.id)} />
    </div>
  );
}
