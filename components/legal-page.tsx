import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { LEGAL_COPY, LEGAL_UPDATED } from "@/messages/legal";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

/** The top of every legal page: back to the policies page, heading, date and the draft note. */
export function LegalHead({ locale, title, updated = LEGAL_UPDATED, draft }: { locale: SiteLocale; title: string; updated?: string; draft?: string }) {
  const date = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "long" }).format(new Date(updated));
  return (
    <header className="legal-head">
      <Link className="listing-back no-print" href={`/${locale}/legal`}><ArrowRight size={16} /> {SITE_COPY[locale].legalHubTitle}</Link>
      <h1>{title}</h1>
      <p className="legal-updated">{LEGAL_COPY[locale].updatedLabel}: <time dateTime={updated}>{date}</time></p>
      {draft && <p className="document-draft">{draft}</p>}
    </header>
  );
}

export default function LegalPage({ locale, kind }: { locale: SiteLocale; kind: "privacy" | "terms" }) {
  const t = SITE_COPY[locale];
  const legal = LEGAL_COPY[locale];
  const page = legal[kind];
  const otherLocale: SiteLocale = locale === "ar" ? "en" : "ar";

  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader locale={locale} switchHref={`/${otherLocale}/${kind}`} />
      <main className="legal-page section-wrap">
        <article className="legal-article">
          <LegalHead locale={locale} title={page.title} draft={t.legalDraftNotice} />
          <p className="legal-intro">{page.intro}</p>
          {page.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>
          ))}
          <Link className="button button-primary legal-contact" href={`/${locale}/help#contact`}>{legal.contactCta}</Link>
        </article>
      </main>
      <SiteFooter locale={locale} switchHref={`/${otherLocale}/${kind}`} />
    </div>
  );
}
