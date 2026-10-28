import PayFee from "@/components/pay-fee";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

/** Private payment page for one fee (host or guest), opened from the link the Sakani team sends. */
export default function PayRoute({ locale, token }: { locale: SiteLocale; token: string }) {
  const t = SITE_COPY[locale];
  const otherLocale: SiteLocale = locale === "ar" ? "en" : "ar";
  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader locale={locale} switchHref={`/${otherLocale}/pay/${token}`} />
      <main className="pay-page section-wrap">
        <h1>{t.payPageTitle}</h1>
        <p>{t.payPageIntro}</p>
        <PayFee locale={locale} token={token} />
      </main>
      <SiteFooter locale={locale} switchHref={`/${otherLocale}/pay/${token}`} tab={false} />
    </div>
  );
}
