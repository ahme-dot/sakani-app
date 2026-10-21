import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { LEGAL_COPY, LEGAL_UPDATED } from "@/messages/legal";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

export default function LegalPage({ locale, kind }: { locale: SiteLocale; kind: "privacy" | "terms" }) {
  const t = SITE_COPY[locale];
  const legal = LEGAL_COPY[locale];
  const page = legal[kind];
  const otherLocale: SiteLocale = locale === "ar" ? "en" : "ar";
  const updated = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "long" }).format(new Date(LEGAL_UPDATED));

  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader locale={locale} sectionBase={`/${locale}`} switchHref={`/${otherLocale}/${kind}`} />
      <main className="legal-page section-wrap">
        <Link className="listing-back" href={`/${locale}`}><ArrowRight size={16} /> {t.adminBackHome}</Link>
        <article className="legal-article">
          <h1>{page.title}</h1>
          <p className="legal-updated">{legal.updatedLabel}: <time dateTime={LEGAL_UPDATED}>{updated}</time></p>
          <p className="legal-intro">{page.intro}</p>
          {page.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>
          ))}
          <a className="button button-primary legal-contact" href={`/${locale}#contact`}>{legal.contactCta}</a>
        </article>
      </main>
      <SiteFooter locale={locale} sectionBase={`/${locale}`} switchHref={`/${otherLocale}/${kind}`} />
    </div>
  );
}
