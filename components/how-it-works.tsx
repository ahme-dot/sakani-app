import Link from "next/link";
import { CalendarCheck, House, Search, ShieldCheck, Wallet } from "lucide-react";
import type { PaymentSettings } from "@/lib/payments";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

const GUEST_ICONS = [Search, CalendarCheck, ShieldCheck, Wallet];
const HOST_ICONS = [House, ShieldCheck, CalendarCheck, Wallet];

/** "How Sakani works": the steps for guests and hosts, and the fee each side pays (from the admin settings). */
export default function HowItWorks({ locale, fees }: { locale: SiteLocale; fees: PaymentSettings }) {
  const t = SITE_COPY[locale];
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG");
  const column = (title: string, steps: readonly { title: string; text: string }[], icons: typeof GUEST_ICONS, cta: { href: string; label: string }) => (
    <div className="how-column">
      <h3>{title}</h3>
      <ol>
        {steps.map((step, index) => {
          const Icon = icons[index] ?? Search;
          return (
            <li key={step.title}>
              <span className="how-icon"><Icon size={19} /></span>
              <span><strong>{step.title}</strong><small>{step.text}</small></span>
            </li>
          );
        })}
      </ol>
      <Link className="button button-outline" href={cta.href}>{cta.label}</Link>
    </div>
  );

  return (
    <section className="how-section section-wrap" id="how" aria-labelledby="how-title">
      <div className="how-head">
        <span className="section-kicker">{t.howKicker}</span>
        <h2 id="how-title">{t.howTitle}</h2>
        <p>{t.howIntro}</p>
      </div>
      <div className="how-columns">
        {column(t.howGuestsTitle, t.howGuestSteps, GUEST_ICONS, { href: `/${locale}#homes`, label: t.heroAction })}
        {column(t.howHostsTitle, t.howHostSteps, HOST_ICONS, { href: `/${locale}/host`, label: t.navOwner })}
      </div>
      <div className="how-fees">
        <Wallet size={20} />
        <div>
          <strong>{t.howFeesTitle}</strong>
          <p>
            {t.howFeesText(numberFormat.format(fees.student_fee_percent), numberFormat.format(fees.fee_percent))}
          </p>
        </div>
      </div>
    </section>
  );
}
