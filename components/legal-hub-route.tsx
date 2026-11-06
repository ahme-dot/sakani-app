import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { LEGAL_SLUGS } from "@/messages/legal-pages";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

/** One page that lists every policy, agreement and legal page, so the footer needs a single link. */
export default function LegalHubRoute({ locale }: { locale: SiteLocale }) {
  const t = SITE_COPY[locale];
  const otherLocale: SiteLocale = locale === "ar" ? "en" : "ar";
  const Arrow = locale === "ar" ? ChevronLeft : ChevronRight;
  const items = [
    { href: `/${locale}/terms`, title: t.termsLink, text: t.legalHubText.terms },
    { href: `/${locale}/privacy`, title: t.privacyLink, text: t.legalHubText.privacy },
    ...LEGAL_SLUGS.map((slug) => ({ href: `/${locale}/legal/${slug}`, title: t.legalTitles[slug], text: t.legalHubText[slug] })),
    { href: `/${locale}/agreements/guest`, title: t.footerGuestAgreement, text: t.legalHubText.guestAgreement },
    { href: `/${locale}/agreements/host`, title: t.footerHostAgreement, text: t.legalHubText.hostAgreement },
  ];

  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader locale={locale} switchHref={`/${otherLocale}/legal`} />
      <main className="legal-hub section-wrap">
        <h1>{t.legalHubTitle}</h1>
        <p className="legal-hub-intro">{t.legalHubIntro}</p>
        <ul className="legal-hub-grid">
          {items.map((item) => (
            <li key={item.href}>
              <Link href={item.href}>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.text}</small>
                </span>
                <Arrow size={18} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter locale={locale} switchHref={`/${otherLocale}/legal`} />
    </div>
  );
}
