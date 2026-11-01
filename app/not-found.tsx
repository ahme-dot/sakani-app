import Link from "next/link";
import { headers } from "next/headers";
import { Home, SearchX } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { SITE_COPY } from "@/messages/site";

/** A missing page or listing, inside the normal site header and footer so the visitor isn't lost. */
export default async function NotFound() {
  const locale = (await headers()).get("x-sakani-locale") === "en" ? "en" : "ar";
  const t = SITE_COPY[locale];
  const otherLocale = locale === "ar" ? "en" : "ar";

  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader locale={locale} switchHref={`/${otherLocale}`} />
      <main className="section-wrap not-found-page">
        <section className="not-found-card">
          <span className="not-found-icon"><SearchX size={28} /></span>
          <h1>{t.notFoundTitle}</h1>
          <p>{t.notFoundText}</p>
          <div className="not-found-actions">
            <Link className="button button-primary" href={`/${locale}#homes`}>{t.notFoundAction}</Link>
            <Link className="button button-outline" href={`/${locale}/help`}>{t.footerHelp}</Link>
          </div>
          <Link className="not-found-home" href={`/${locale}`}><Home size={15} /> {t.errorHome}</Link>
        </section>
      </main>
      <SiteFooter locale={locale} switchHref={`/${otherLocale}`} />
    </div>
  );
}
