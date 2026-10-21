"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, MessageCircle, Printer, QrCode } from "lucide-react";
import { SITE_URL } from "@/lib/site";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

/** Owner outreach kit: ready-to-send WhatsApp message, QR code, and a link to the printable flyer. */
export default function AdminGrow({ locale }: { locale: SiteLocale }) {
  const t = SITE_COPY[locale];
  const listUrl = `${SITE_URL}/${locale}#owner`;
  const message = t.growMessage(listUrl);
  const [copied, setCopied] = useState(false);
  const [qrSvg, setQrSvg] = useState("");

  useEffect(() => {
    let mounted = true;
    void QRCode.toString(listUrl, { type: "svg", margin: 1, width: 220, color: { dark: "#174d3d", light: "#ffffff" } }).then((svg) => {
      if (mounted) setQrSvg(svg);
    });
    return () => {
      mounted = false;
    };
  }, [listUrl]);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Could not copy the message:", error);
    }
  }

  return (
    <section className="admin-grow" aria-label={t.growTitle}>
      <article className="admin-grow-card admin-grow-message">
        <h2><MessageCircle size={18} /> {t.growMessageTitle}</h2>
        <p className="field-hint">{t.growMessageText}</p>
        <pre className="grow-message" dir={locale === "ar" ? "rtl" : "ltr"}>{message}</pre>
        <div className="admin-card-actions">
          <button className="admin-btn admin-btn-primary" type="button" onClick={() => void copyMessage()}>
            <Copy size={15} /> {copied ? t.growCopied : t.growCopy}
          </button>
          <a className="admin-btn admin-btn-ghost" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
            <MessageCircle size={15} /> {t.growOpenWhatsapp}
          </a>
        </div>
      </article>

      <article className="admin-grow-card">
        <h2><QrCode size={18} /> {t.growQrTitle}</h2>
        <p className="field-hint">{t.growQrText}</p>
        <div className="grow-qr" aria-label={listUrl} role="img" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <p className="grow-url" dir="ltr">{listUrl}</p>
      </article>

      <article className="admin-grow-card">
        <h2><Printer size={18} /> {t.growFlyerTitle}</h2>
        <p className="field-hint">{t.growFlyerText}</p>
        <div className="admin-card-actions">
          <a className="admin-btn admin-btn-primary" href={`/${locale}/flyer`} target="_blank" rel="noreferrer">
            <Printer size={15} /> {t.growOpenFlyer}
          </a>
        </div>
      </article>
    </section>
  );
}
