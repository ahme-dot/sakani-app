import PayFee from "@/components/pay-fee";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import type { SiteLocale } from "@/messages/site";

/** Private payment page for one fee (host or guest), opened from the link the Sakani team sends. */
export default function PayRoute({ locale, token }: { locale: SiteLocale; token: string }) {
  const otherLocale: SiteLocale = locale === "ar" ? "en" : "ar";
  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader locale={locale} switchHref={`/${otherLocale}/pay/${token}`} />
      <main className="pay-page section-wrap">
        {/* The page's title comes from PayFee: only it knows whether the link works. */}
        <PayFee locale={locale} token={token} />
      </main>
      <SiteFooter locale={locale} switchHref={`/${otherLocale}/pay/${token}`} tab={false} />
    </div>
  );
}
