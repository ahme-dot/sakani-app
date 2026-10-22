import { ChevronDown } from "lucide-react";
import ContactForm from "@/components/contact-form";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

/** Help centre: every question and answer, then the contact form. */
export default function HelpPage({ locale }: { locale: SiteLocale }) {
  const t = SITE_COPY[locale];
  const otherLocale: SiteLocale = locale === "ar" ? "en" : "ar";

  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader locale={locale} switchHref={`/${otherLocale}/help`} />
      <main>
        <section className="help-hero section-wrap">
          <h1>{t.helpTitle}</h1>
          <p>{t.helpIntro}</p>
        </section>

        <section className="faq-section section-wrap" id="faq" aria-labelledby="faq-title">
          <h2 id="faq-title">{t.faqTitle}</h2>
          <div className="faq-list">
            {t.faqItems.map((item, index) => (
              <details className="faq-item" key={item.q} open={index === 0}>
                <summary>{item.q}<ChevronDown size={18} aria-hidden="true" /></summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: t.faqItems.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
              }).replace(/</g, "\\u003c"),
            }}
          />
        </section>

        <ContactForm locale={locale} />
      </main>
      <SiteFooter locale={locale} switchHref={`/${otherLocale}/help`} />
    </div>
  );
}
