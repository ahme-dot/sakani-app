import { ClipboardList, MessageCircle, ShieldCheck } from "lucide-react";
import OwnerPortal from "@/components/owner-portal";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

const STEP_ICONS = [ClipboardList, ShieldCheck, MessageCircle];

/** "List your home" page for owners (like Airbnb's host page), with the owner portal below. */
export default function HostPage({ locale }: { locale: SiteLocale }) {
  const t = SITE_COPY[locale];
  const otherLocale: SiteLocale = locale === "ar" ? "en" : "ar";

  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader locale={locale} switchHref={`/${otherLocale}/host`} />
      <main>
        <section className="host-hero section-wrap">
          <h1>{t.hostHeroTitle}</h1>
          <p>{t.hostHeroText}</p>
          <ol className="host-steps">
            {t.hostSteps.map((step, index) => {
              const Icon = STEP_ICONS[index];
              return (
                <li key={step.title}>
                  <span className="host-step-icon"><Icon size={22} /></span>
                  <strong>{step.title}</strong>
                  <span>{step.text}</span>
                </li>
              );
            })}
          </ol>
          <a className="button button-primary host-start" href="#owner">{t.hostStart}</a>
        </section>
        <OwnerPortal locale={locale} showIntro={false} />
      </main>
      <SiteFooter locale={locale} switchHref={`/${otherLocale}/host`} tab="host" />
    </div>
  );
}
