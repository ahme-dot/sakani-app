import Link from "next/link";
import { BadgeCheck, CalendarCheck, MapPin, Mars, Venus } from "lucide-react";
import PhotoCarousel from "@/components/photo-carousel";
import SaveButton from "@/components/save-button";
import { placeLabel } from "@/lib/egypt";
import { listingPath } from "@/lib/site";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import type { Property } from "@/types";

/** Listing card: photos with the heart and Men/Women chip, then place, title, details, a clear price and two actions. */
export default function PropertyCard({ property, locale, linkToDetails = true }: { property: Property; locale: SiteLocale; linkToDetails?: boolean }) {
  const t = SITE_COPY[locale];
  const title = locale === "ar" ? property.title_ar : property.title_en;
  const place = placeLabel(locale, property.area, property.city);
  const price = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG").format(property.monthly_price);
  const detailsHref = linkToDetails ? listingPath(locale, property.id) : undefined;
  const verified = property.verification_status === "verified";
  const GenderIcon = property.gender === "female" ? Venus : Mars;

  return (
    <article className="property-card">
      <div className="property-media">
        <PhotoCarousel
          locale={locale}
          images={property.images}
          alt={t.sampleImageAlt(title)}
          href={detailsHref}
          sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, (max-width: 1400px) 33vw, 25vw"
        />
        {verified && <span className="property-pill"><BadgeCheck size={14} /> {t.verified}</span>}
        {(property.gender === "male" || property.gender === "female") && (
          <span className={`property-gender is-${property.gender}`}><GenderIcon size={13} /> {t[property.gender]}</span>
        )}
        {linkToDetails && <SaveButton locale={locale} listingId={property.id} title={title} />}
      </div>

      <div className="property-content">
        <p className="property-location"><MapPin size={14} /> {place}</p>
        <h3 className="property-title">
          {detailsHref ? <Link href={detailsHref}>{title}</Link> : title}
        </h3>
        <p className="property-meta">{t[property.property_type]} · {t.bedsSummary(property.available_beds, property.total_beds)}</p>
        <p className="property-price"><strong>{price}</strong> <span>{t.perMonth}</span></p>
        {detailsHref && (
          <div className="property-actions">
            <Link className="button button-outline property-details" href={detailsHref}>{t.viewDetails}</Link>
            <Link className="button button-primary property-book" href={`${detailsHref}#book`}><CalendarCheck size={15} /> {t.bookNow}</Link>
          </div>
        )}
      </div>
    </article>
  );
}
