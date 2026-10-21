import { SiteHeader } from "@/components/site-chrome";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

/** Page outline shown while a listing loads on a slow connection. */
export default function ListingSkeleton({ locale }: { locale: SiteLocale }) {
  const t = SITE_COPY[locale];

  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader locale={locale} sectionBase={`/${locale}`} switchHref={locale === "ar" ? "/en" : "/ar"} />
      <main className="listing2 section-wrap" aria-busy="true">
        <span className="visually-hidden" role="status">{t.loading}</span>
        <div className="skeleton skeleton-gallery" />
        <div className="listing2-layout">
          <div className="listing2-main">
            <div className="skeleton skeleton-line is-short" />
            <div className="skeleton skeleton-title" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton-facts">
              {Array.from({ length: 6 }, (_, index) => <div className="skeleton skeleton-fact" key={index} />)}
            </div>
          </div>
          <aside className="listing2-aside">
            <div className="skeleton skeleton-card" />
          </aside>
        </div>
      </main>
    </div>
  );
}
