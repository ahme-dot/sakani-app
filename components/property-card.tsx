import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, BedDouble, Check, Clock3, MapPin, MessageCircle, Wifi, Wind } from "lucide-react";
import { WhatsAppLink } from "@/components/listing-tracking";
import { areas } from "@/lib/data";
import { listingPath, whatsappLink } from "@/lib/site";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import type { Property } from "@/types";

/** Listing card used on the home page and in "More homes near…" on listing pages. */
export default function PropertyCard({ property, locale, linkToDetails = true }: { property: Property; locale: SiteLocale; linkToDetails?: boolean }) {
  const t = SITE_COPY[locale];
  const title = locale === "ar" ? property.title_ar : property.title_en;
  const area = areas.find((candidate) => candidate.name_en === property.area);
  const areaLabel = locale === "ar" ? area?.name ?? property.area : property.area;
  const price = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG").format(property.monthly_price);
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
            <WhatsAppLink
              listingId={property.id}
              className="property-contact"
              href={whatsappLink(property.whatsapp_number, t.whatsappMessage(title))}
              ariaLabel={t.whatsappAria(title)}
            >
              <MessageCircle size={17} />
              {t.inquire}
            </WhatsAppLink>
          </div>
        </div>
      </div>
    </article>
  );
}
