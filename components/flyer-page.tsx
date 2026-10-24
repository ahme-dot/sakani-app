import QRCode from "qrcode";
import { Check } from "lucide-react";
import { BrandMark } from "@/components/brand-image";
import FlyerPrintButton from "@/components/flyer-print-button";
import { SITE_URL } from "@/lib/site";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

/** Printable A4 flyer inviting owners to list their homes; the QR code opens "List a home". */
export default async function FlyerPage({ locale }: { locale: SiteLocale }) {
  const t = SITE_COPY[locale];
  const listUrl = `${SITE_URL}/${locale}/host`;
  const qrSvg = await QRCode.toString(listUrl, { type: "svg", margin: 0, width: 300, color: { dark: "#26372e", light: "#ffffff" } });

  return (
    <main className="flyer-shell" dir={locale === "ar" ? "rtl" : "ltr"}>
      <FlyerPrintButton label={t.flyerPrint} />
      <article className="flyer-sheet">
        <header className="flyer-brand">
          <BrandMark size={64} radius={18} />
          <span>{t.brandLabel}</span>
        </header>
        <h1>{t.flyerHeadline}</h1>
        <p className="flyer-sub">{t.flyerSub}</p>
        <ul className="flyer-points">
          {t.flyerPoints.map((point) => <li key={point}><Check size={22} /> {point}</li>)}
        </ul>
        <div className="flyer-qr-block">
          <div className="flyer-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <div>
            <strong>{t.flyerScan}</strong>
            <span dir="ltr">{listUrl.replace(/^https?:\/\//, "")}</span>
          </div>
        </div>
        <footer className="flyer-foot">{t.heroBadge}</footer>
      </article>
    </main>
  );
}
