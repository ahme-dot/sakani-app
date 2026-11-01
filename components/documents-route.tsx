import AgreementView from "@/components/agreement-view";
import DocumentView from "@/components/document-view";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { BOOKING_DOCUMENTS, type BookingDocument } from "@/lib/documents";
import { UUID_PATTERN } from "@/lib/supabase/listings";
import type { SiteLocale } from "@/messages/site";
import { notFound } from "next/navigation";

/** A booking's documents page (the list, or one document with ?doc=…). */
export async function DocumentsRoute({ locale, params, searchParams }: {
  locale: SiteLocale;
  params: Promise<{ booking: string }>;
  searchParams: Promise<{ doc?: string }>;
}) {
  const [{ booking }, { doc }] = await Promise.all([params, searchParams]);
  if (!UUID_PATTERN.test(booking)) notFound();
  const selected = (BOOKING_DOCUMENTS as readonly string[]).includes(doc ?? "") ? (doc as BookingDocument) : null;
  const otherLocale: SiteLocale = locale === "ar" ? "en" : "ar";
  const switchHref = `/${otherLocale}/documents/${booking}${selected ? `?doc=${selected}` : ""}`;
  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader locale={locale} switchHref={switchHref} />
      <main className="documents-page section-wrap">
        <DocumentView locale={locale} bookingId={booking} doc={selected} />
      </main>
      <SiteFooter locale={locale} switchHref={switchHref} tab={false} />
    </div>
  );
}

/** The guest or host platform agreement. */
export async function AgreementRoute({ locale, params }: { locale: SiteLocale; params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (type !== "guest" && type !== "host") notFound();
  const otherLocale: SiteLocale = locale === "ar" ? "en" : "ar";
  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader locale={locale} switchHref={`/${otherLocale}/agreements/${type}`} />
      <main className="documents-page section-wrap">
        <AgreementView locale={locale} document={type === "guest" ? "guest_platform" : "host_platform"} />
      </main>
      <SiteFooter locale={locale} switchHref={`/${otherLocale}/agreements/${type}`} tab={false} />
    </div>
  );
}
