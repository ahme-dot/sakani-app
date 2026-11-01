"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, LoaderCircle, LogIn, Printer } from "lucide-react";
import { useAccount } from "@/lib/account";
import { BOOKING_DOCUMENTS, DOCUMENT_VERSION, acceptedAt, bookingRef, documentReady, type BookingDocument, type DocumentData } from "@/lib/documents";
import { governorateLabel, placeLabel } from "@/lib/egypt";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { DOCUMENTS_COPY } from "@/messages/documents";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type Props = { locale: SiteLocale; bookingId: string; doc: BookingDocument | null };

/** A booking's documents: the list, or one printable document (save as PDF from the print dialog). */
export default function DocumentView({ locale, bookingId, doc }: Props) {
  const d = DOCUMENTS_COPY[locale];
  const t = SITE_COPY[locale];
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const account = useAccount(supabase);
  const intlLocale = locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG";
  const numberFormat = new Intl.NumberFormat(intlLocale);
  const dateFormat = new Intl.DateTimeFormat(intlLocale, { dateStyle: "long" });
  const timeFormat = new Intl.DateTimeFormat(intlLocale, { dateStyle: "long", timeStyle: "short" });
  const [data, setData] = useState<DocumentData | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const signedInId = account.status === "signedIn" ? account.user.id : null;

  useEffect(() => {
    if (!supabase || !signedInId) return;
    let active = true;
    void supabase.rpc("booking_document_data", { target_booking: bookingId }).then(({ data: loaded, error }) => {
      if (!active) return;
      if (error || !loaded) {
        console.error("Could not load booking documents:", error);
        setFailed(true);
        return;
      }
      setData(loaded as DocumentData);
    });
    return () => {
      active = false;
    };
  }, [supabase, signedInId, bookingId, version]);

  async function accept() {
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("accept_document", { target_booking: bookingId, doc: "rental_agreement", doc_version: DOCUMENT_VERSION });
    setBusy(false);
    if (error) {
      console.error("Could not accept the agreement:", error);
      setMessage(d.acceptError);
      return;
    }
    setMessage(d.acceptedNote);
    setVersion((value) => value + 1);
  }

  const Back = locale === "ar" ? ArrowRight : ArrowLeft;
  const egp = (amount: number | null | undefined) => `${numberFormat.format(amount ?? 0)} ${t.currency}`;
  const day = (value: string | null | undefined) => (value ? dateFormat.format(new Date(value)) : "—");

  if (account.status === "loading") return <p className="profile-loading"><LoaderCircle className="spinner" size={18} /> {t.loading}</p>;
  if (account.status === "signedOut") {
    return (
      <div className="book-home-login">
        <p>{d.signInNeeded}</p>
        <Link className="button button-primary book-login" href={`/${locale}/account?next=${encodeURIComponent(`/${locale}/documents/${bookingId}`)}`}><LogIn size={17} /> {t.menuLogin}</Link>
      </div>
    );
  }
  if (failed) return <p className="owner-feedback owner-feedback-error" role="alert">{d.loadError}</p>;
  if (!data) return <p className="profile-loading"><LoaderCircle className="spinner" size={18} /> {t.loading}</p>;

  const { booking, listing } = data;
  const ref = bookingRef(booking.id);
  const title = listing ? (locale === "ar" ? listing.title_ar : listing.title_en) : booking.listing_title;
  const place = listing ? placeLabel(locale, listing.area, listing.governorate) : "";

  // The list of documents for this booking.
  if (!doc) {
    return (
      <section className="documents-index">
        <header className="documents-head">
          <h1>{d.documentsTitle}</h1>
          <p>{title} · <bdi dir="ltr">{ref}</bdi></p>
          <p className="field-hint">{d.documentsIntro}</p>
        </header>
        <ul className="profile-list">
          {BOOKING_DOCUMENTS.map((item) => {
            const ready = documentReady(item, data);
            return (
              <li key={item} className={ready ? "" : "is-waiting"}>
                <FileText size={20} />
                <div><strong>{d.titles[item]}</strong>{!ready && <small>{d.notAvailableYet}</small>}</div>
                {ready && <Link className="button button-outline" href={`/${locale}/documents/${bookingId}?doc=${item}`}>{d.open}</Link>}
              </li>
            );
          })}
          {(["guest_platform", "host_platform"] as const).map((item) => (
            <li key={item}>
              <FileText size={20} />
              <div><strong>{d.titles[item]}</strong></div>
              <Link className="button button-outline" href={`/${locale}/agreements/${item === "guest_platform" ? "guest" : "host"}`}>{d.open}</Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (!documentReady(doc, data)) {
    return (
      <section className="documents-index">
        <p className="profile-empty">{d.notAvailableYet}</p>
        <Link className="text-button" href={`/${locale}/documents/${bookingId}`}><Back size={15} /> {d.back}</Link>
      </section>
    );
  }

  const amountRows: Array<[string, string]> = (() => {
    switch (doc) {
      case "payment_receipt":
      case "booking_confirmation":
        return [[d.firstMonthRent, egp(booking.rent_amount)], [d.guestFee, egp(booking.guest_fee)], [d.deposit, egp(booking.deposit_amount)], [d.totalPaid, egp(booking.total_amount)]];
      case "rental_agreement":
        return [[d.firstMonthRent, egp(booking.rent_amount)], [d.deposit, egp(booking.deposit_amount)]];
      case "deposit_receipt":
        return [[d.deposit, egp(data.deposit?.amount)]];
      case "refund_receipt":
      case "cancellation_request":
        return [[d.totalPaid, egp(booking.total_amount)]];
    }
  })();

  const guestAccepted = acceptedAt(data, "rental_agreement", "guest");
  const hostAccepted = acceptedAt(data, "rental_agreement", "host");
  const mine = data.viewer === "guest" ? guestAccepted : data.viewer === "host" ? hostAccepted : "n/a";

  return (
    <article className="document" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="document-actions no-print">
        <Link className="text-button" href={`/${locale}/documents/${bookingId}`}><Back size={15} /> {d.back}</Link>
        <button className="button button-primary" type="button" onClick={() => window.print()}><Printer size={16} /> {d.print}</button>
      </div>

      <header className="document-head">
        <strong className="document-brand">{t.brandLabel} · {locale === "ar" ? "Sakani" : "سكني"}</strong>
        <h1>{d.titles[doc]}</h1>
        <dl className="document-meta">
          <div><dt>{d.reference}</dt><dd dir="ltr">{ref}</dd></div>
          <div><dt>{d.issuedOn}</dt><dd>{day(new Date().toISOString())}</dd></div>
          <div><dt>{d.version}</dt><dd dir="ltr">{DOCUMENT_VERSION}</dd></div>
        </dl>
        <p className="document-draft">{d.draftNotice}</p>
      </header>

      <section className="document-section">
        <h2>{d.parties}</h2>
        <dl className="document-grid">
          <div><dt>{d.guest}</dt><dd>{data.guest_name && data.guest_name !== "Guest" ? data.guest_name : d.nameNotGiven}</dd></div>
          <div><dt>{d.host}</dt><dd>{data.host_name || d.nameNotGiven}</dd></div>
          <div><dt>{d.platform}</dt><dd>{t.brandLabel}</dd></div>
        </dl>
      </section>

      <section className="document-section">
        <h2>{d.property}</h2>
        <dl className="document-grid">
          <div><dt>{d.property}</dt><dd>{title}{place ? ` — ${place}` : ""}</dd></div>
          {listing && <div><dt>{t.governorate}</dt><dd>{governorateLabel(locale, listing.governorate)}</dd></div>}
          <div><dt>{d.moveIn}</dt><dd>{day(booking.move_in)}</dd></div>
          <div><dt>{d.stay}</dt><dd>{booking.months ? d.months(booking.months) : "—"}</dd></div>
          <div><dt>{d.people}</dt><dd>{numberFormat.format(booking.guests)}</dd></div>
        </dl>
      </section>

      {doc === "booking_confirmation" && <p className="document-lead">{d.bookingConfirmationText}</p>}
      {doc === "payment_receipt" && <p className="document-lead">{d.paymentReceiptText}</p>}
      {doc === "deposit_receipt" && <p className="document-lead">{d.depositReceiptText}</p>}
      {doc === "cancellation_request" && <p className="document-lead">{d.cancellationText}</p>}
      {doc === "refund_receipt" && <p className="document-lead">{d.refundReceiptText}</p>}

      <section className="document-section">
        <h2>{d.amounts}</h2>
        <table className="document-table">
          <tbody>
            {amountRows.map(([label, value]) => (
              <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>
            ))}
            {(doc === "booking_confirmation") && data.viewer !== "guest" && (
              <>
                <tr><th scope="row">{d.hostFee}</th><td>{egp(booking.host_fee)}</td></tr>
                <tr><th scope="row">{d.hostNetRent}</th><td>{egp(booking.payout_amount)}</td></tr>
              </>
            )}
          </tbody>
        </table>
      </section>

      {(doc === "payment_receipt" || doc === "booking_confirmation") && data.payment && (
        <section className="document-section">
          <dl className="document-grid">
            <div><dt>{d.paymentMethod}</dt><dd>{d.instapay}</dd></div>
            <div><dt>{d.transactionRef}</dt><dd dir="ltr">{data.payment.reference ?? "—"}</dd></div>
            <div><dt>{d.paymentStatus}</dt><dd>{d.statusLabels[data.payment.status] ?? data.payment.status}</dd></div>
            <div><dt>{d.paymentDate}</dt><dd>{day(data.payment.decided_at)}</dd></div>
          </dl>
        </section>
      )}

      {doc === "deposit_receipt" && data.deposit && (
        <section className="document-section">
          <dl className="document-grid">
            <div><dt>{d.transactionRef}</dt><dd dir="ltr">{data.deposit.transfer_reference}</dd></div>
            <div><dt>{d.paymentDate}</dt><dd>{day(data.deposit.transferred_at)}</dd></div>
          </dl>
          <p className="document-lead">{data.deposit.acknowledged_at ? d.depositAcknowledged(timeFormat.format(new Date(data.deposit.acknowledged_at))) : d.depositNotAcknowledged}</p>
        </section>
      )}

      {doc === "cancellation_request" && (
        <section className="document-section">
          <dl className="document-grid">
            <div><dt>{d.cancellationReason}</dt><dd>{booking.problem_note}</dd></div>
            <div><dt>{d.cancellationDate}</dt><dd>{day(booking.problem_at)}</dd></div>
          </dl>
        </section>
      )}

      {doc === "refund_receipt" && (
        <section className="document-section">
          <dl className="document-grid">
            <div><dt>{d.refundRef}</dt><dd dir="ltr">{booking.refund_reference ?? "—"}</dd></div>
            <div><dt>{d.refundDate}</dt><dd>{day(booking.refunded_at)}</dd></div>
          </dl>
        </section>
      )}

      {doc === "rental_agreement" && (
        <>
          {d.rentalAgreement.map((section) => (
            <section className="document-section" key={section.heading}>
              <h2>{section.heading}</h2>
              {section.body.map((line) => <p key={line}>{line}</p>)}
            </section>
          ))}
          <section className="document-section document-acceptances">
            <h2>{d.acceptances}</h2>
            <p>{guestAccepted ? d.acceptedBy(d.guest, timeFormat.format(new Date(guestAccepted))) : d.notAcceptedYet(d.guest)}</p>
            <p>{hostAccepted ? d.acceptedBy(d.host, timeFormat.format(new Date(hostAccepted))) : d.notAcceptedYet(d.host)}</p>
            <p><strong>{booking.contract_signed_at ? d.contractSigned(timeFormat.format(new Date(booking.contract_signed_at))) : d.contractWaiting}</strong></p>
            {!mine && (
              <div className="no-print document-accept">
                <button className="button button-primary" type="button" disabled={busy} onClick={() => void accept()}><CheckCircle2 size={16} /> {d.acceptButton}</button>
              </div>
            )}
            {message && <p className="owner-feedback owner-feedback-success no-print" role="status">{message}</p>}
          </section>
        </>
      )}

      <footer className="document-foot">
        <p>{d.notSignatureNotice}</p>
      </footer>
    </article>
  );
}
