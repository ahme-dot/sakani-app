import Image from "next/image";
import { Check, ClipboardList, MessageCircle, ShieldCheck } from "lucide-react";
import OwnerPortal from "@/components/owner-portal";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { DEFAULT_PAYMENT_SETTINGS, fetchPaymentSettings } from "@/lib/payments";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

const STEP_ICONS = [ClipboardList, ShieldCheck, MessageCircle];

/** "List your home" page for owners (like Airbnb's host page), with the owner portal below. */
export default async function HostPage({ locale }: { locale: SiteLocale }) {
  const t = SITE_COPY[locale];
  const client = getSupabaseServerClient();
  const settings = (client ? await fetchPaymentSettings(client) : null) ?? DEFAULT_PAYMENT_SETTINGS;
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG");
  const otherLocale: SiteLocale = locale === "ar" ? "en" : "ar";

  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader locale={locale} switchHref={`/${otherLocale}/host`} />
      <main>
        <section className="host-hero section-wrap">
          <div className="host-hero-main">
            <div className="host-hero-copy">
              <span className="host-hero-kicker">{t.ownerKicker}</span>
              <h1>{t.hostHeroTitle}</h1>
              <p>{t.hostHeroText}</p>
              <a className="button button-primary host-start" href="#owner">{t.hostStart}</a>
            </div>
            <div className="host-hero-visual">
              <Image
                src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80"
                alt=""
                fill
                sizes="(max-width: 760px) 100vw, 48vw"
                priority
              />
              <div className="host-hero-image-note">
                <span className="host-hero-image-check"><Check size={17} /></span>
                <span><strong>{t.heroNoteTitle}</strong><small>{t.heroNoteText}</small></span>
              </div>
            </div>
          </div>
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
        </section>
        <section className="host-pricing section-wrap" aria-labelledby="pricing-title">
          <h2 id="pricing-title">{t.pricingTitle}</h2>
          <ul>
            <li><Check size={18} /> {t.pricingStudents(numberFormat.format(settings.student_fee_percent))}</li>
            <li><Check size={18} /> {t.pricingListing}</li>
            <li><Check size={18} /> {t.pricingSuccess(numberFormat.format(settings.fee_percent))}</li>
          </ul>
          <p>{t.pricingPay}</p>
        </section>
        <OwnerPortal locale={locale} showIntro={false} />
      </main>
      <SiteFooter locale={locale} switchHref={`/${otherLocale}/host`} tab="host" />
    </div>
  );
}
