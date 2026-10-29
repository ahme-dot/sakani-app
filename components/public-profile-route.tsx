import Image from "next/image";
import { notFound } from "next/navigation";
import { BadgeCheck, Briefcase, Languages, MapPin } from "lucide-react";
import PropertyCard from "@/components/property-card";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { governorateLabel } from "@/lib/egypt";
import { fetchPublicProfile } from "@/lib/profiles";
import { PUBLIC_LISTING_COLUMNS, UUID_PATTERN, toProperty, type MarketplaceListing } from "@/lib/supabase/listings";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

/** A host's or guest's public page: what they chose to share, and (for hosts) their published places. No contact details. */
export default async function PublicProfileRoute({ locale, params }: { locale: SiteLocale; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseServerClient();
  if (!client || !UUID_PATTERN.test(id)) notFound();
  const profile = await fetchPublicProfile(client, id);
  if (!profile) notFound();

  const t = SITE_COPY[locale];
  const otherLocale: SiteLocale = locale === "ar" ? "en" : "ar";
  const monthYear = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { month: "long", year: "numeric" });
  const name = profile.first_name || (profile.role === "host" ? t.roleHost : t.roleGuest);
  const { data } = profile.role === "host"
    ? await client.from("properties").select(PUBLIC_LISTING_COLUMNS).eq("owner_id", id).eq("status", "approved").eq("is_demo", false).order("created_at", { ascending: false }).limit(12)
    : { data: [] };
  const places = ((data ?? []) as unknown as MarketplaceListing[]).map(toProperty);
  const languageNames = new Intl.DisplayNames([locale], { type: "language" });

  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader locale={locale} switchHref={`/${otherLocale}/users/${id}`} />
      <main className="profile-page public-profile section-wrap">
        <section className="profile-card">
          <span className="profile-avatar" aria-hidden="true">
            {profile.avatar_url ? <Image src={profile.avatar_url} alt="" width={64} height={64} /> : name.charAt(0).toUpperCase()}
          </span>
          <div className="profile-who">
            <h1>{name}</h1>
            <span className={`role-chip is-${profile.role}`}>{profile.role === "host" ? t.roleHost : t.roleGuest}</span>
            {profile.id_verified && <span className="role-chip is-verified"><BadgeCheck size={13} /> {t.idVerified}</span>}
          </div>
          <ul className="profile-facts">
            <li>{t.memberSince(monthYear.format(new Date(profile.member_since)))}</li>
            {profile.governorate && <li><MapPin size={15} /> {governorateLabel(locale, profile.governorate)}</li>}
            {profile.occupation && <li><Briefcase size={15} /> {profile.occupation}</li>}
            {profile.languages.length > 0 && <li><Languages size={15} /> {profile.languages.map((code) => languageNames.of(code) ?? code).join("، ")}</li>}
            {profile.role === "host" && <li>{t.placesCount(profile.places)}</li>}
            <li>{t.completedStays(profile.completed_stays)}</li>
          </ul>
          {profile.bio && <p className="profile-bio">{profile.bio}</p>}
          <p className="field-hint">{t.hostContactNote}</p>
        </section>

        {places.length > 0 && (
          <section className="profile-section" aria-labelledby="host-places-title">
            <h2 id="host-places-title">{t.hostPlacesTitle(name)}</h2>
            <div className="property-grid">
              {places.map((property) => <PropertyCard key={property.id} property={property} locale={locale} />)}
            </div>
          </section>
        )}
      </main>
      <SiteFooter locale={locale} switchHref={`/${otherLocale}/users/${id}`} tab="explore" />
    </div>
  );
}
