import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import PhotoCarousel from "@/components/photo-carousel";
import SaveButton from "@/components/save-button";
import { placeLabel, universityLabel as universityName } from "@/lib/egypt";
import { listingPath } from "@/lib/site";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import type { Property } from "@/types";

/** Airbnb-style listing card: photos, heart, then location, title, details and price. The whole card opens the listing. */
export default function PropertyCard({ property, locale, linkToDetails = true }: { property: Property; locale: SiteLocale; linkToDetails?: boolean }) {
  const t = SITE_COPY[locale];
  const title = locale === "ar" ? property.title_ar : property.title_en;
  const place = placeLabel(locale, property.area, property.city);
  const universityLabel = universityName(locale, property.university);
  const price = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG").format(property.monthly_price);
  const detailsHref = linkToDetails ? listingPath(locale, property.id) : undefined;
  const verified = property.verification_status === "verified";

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
        {linkToDetails && <SaveButton locale={locale} listingId={property.id} title={title} />}
      </div>

      <div className="property-content">
        <p className="property-location">{place}</p>
        <h3 className="property-title">
          {detailsHref ? <Link href={detailsHref}>{title}</Link> : title}
        </h3>
        <p className="property-meta">{t[property.property_type]} · {t[property.gender]} · {t.walkTo(property.walking_distance_minutes, universityLabel)}</p>
        <p className="property-price"><strong>{price}</strong> {t.perMonth}</p>
      </div>
    </article>
  );
}
