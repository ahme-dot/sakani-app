"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { CalendarCheck, CreditCard, LoaderCircle, LogIn, ShieldCheck } from "lucide-react";
import { useAccount } from "@/lib/account";
import { studentFee, type PaymentSettings } from "@/lib/payments";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type Props = {
  locale: SiteLocale;
  listingId: string;
  monthlyPrice: number;
  fees: PaymentSettings;
  /** Demo listings show the box but can't be booked. */
  isDemo?: boolean;
};

type Created = { booking_id: string; pay_token: string; total: number; rent: number; fee: number };

/** Today in Egypt as YYYY-MM-DD (the earliest move-in date). */
function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
}

/**
 * A signed-in guest books and pays straight away (first month + Sakani fee, by InstaPay).
 * Sakani holds the money: it is refunded within 24 hours if anything goes wrong, and the host is paid after move-in.
 */
export default function BookHome({ locale, listingId, monthlyPrice, fees, isDemo = false }: Props) {
  const t = SITE_COPY[locale];
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const account = useAccount(supabase);
  const [state, setState] = useState<"idle" | "sending">("idle");
  const [created, setCreated] = useState<Created | null>(null);
  const [error, setError] = useState("");
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG");
  const guestFee = studentFee(monthlyPrice, fees);
  const next = encodeURIComponent(`/${locale}/listings/${listingId}#book`);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || account.status !== "signedIn") return;
    const form = new FormData(event.currentTarget);
    const moveIn = String(form.get("move_in") ?? "");
    const months = Number(form.get("months"));
    const guests = Number(form.get("guests"));
    if (!moveIn || moveIn < today() || !(months >= 1 && months <= 24) || !(guests >= 1 && guests <= 10)) {
      setError(t.bookError);
      return;
    }
    setState("sending");
    setError("");
    const { data, error: bookError } = await supabase.rpc("guest_create_booking", {
      target_listing: listingId,
      move_in_date: moveIn,
      stay_months: months,
      people: guests,
      guest_note: String(form.get("note") ?? "").trim(),
    });
    setState("idle");
    if (bookError) {
      console.error("Could not create booking:", bookError);
      const message = bookError.message;
      setError(
        message.includes("phone_required") ? t.bookPhoneRequired
          : message.includes("request_limit") ? t.bookBusy
            : message.includes("own_listing") ? t.bookOwnListing
              : message.includes("listing_not_available") ? t.bookUnavailable
                : t.bookError,
      );
      return;
    }
    setCreated(data as Created);
  }

  // Right after booking: pay now.
  if (created) {
    return (
      <div className="book-paynow" id="book" role="status">
        <strong className="book-paynow-title"><CreditCard size={19} /> {t.payNowTitle}</strong>
        <p>{t.payNowText}</p>
        <dl className="book-total">
          <div><dt>{t.bookRent}</dt><dd>{numberFormat.format(created.rent)} {t.currency}</dd></div>
          <div><dt>{t.bookGuestFee}</dt><dd>{numberFormat.format(created.fee)} {t.currency}</dd></div>
          <div className="is-total"><dt>{t.bookTotal}</dt><dd>{numberFormat.format(created.total)} {t.currency}</dd></div>
        </dl>
        <Link className="button button-primary book-submit" href={`/${locale}/pay/${created.pay_token}`}>{t.payNowButton}</Link>
        <p className="book-guarantee"><ShieldCheck size={16} /> {t.refundPromise}</p>
        <Link className="book-signup" href={`/${locale}/account#bookings`}>{t.bookSeeMine}</Link>
      </div>
    );
  }

  return (
    <div className="book-home" id="book">
      <h2 className="book-home-title"><CalendarCheck size={18} /> {t.bookTitle}</h2>
      {isDemo ? (
        <p className="book-home-demo">{t.demoNotBookable}</p>
      ) : account.status === "loading" ? (
        <p className="book-home-loading"><LoaderCircle className="spinner" size={18} /> {t.loading}</p>
      ) : account.status === "signedOut" ? (
        <div className="book-home-login">
          <p>{t.bookLoginText}</p>
          <Link className="button button-primary book-login" href={`/${locale}/account?role=guest&next=${next}`}>
            <LogIn size={17} /> {t.bookLoginButton}
          </Link>
          <Link className="book-signup" href={`/${locale}/account?mode=signup&role=guest&next=${next}`}>{t.bookSignupLink}</Link>
        </div>
      ) : (
        <form className="book-form" onSubmit={(event) => void submit(event)} noValidate>
          <div className="book-form-grid">
            <label className="owner-field"><span>{t.bookMoveIn}</span><input name="move_in" type="date" required min={today()} dir="ltr" /></label>
            <label className="owner-field">
              <span>{t.bookMonths}</span>
              <select name="months" defaultValue="6">
                {[1, 2, 3, 4, 5, 6, 9, 12].map((months) => <option key={months} value={months}>{t.monthsCount(months)}</option>)}
              </select>
            </label>
          </div>
          <label className="owner-field">
            <span>{t.bookGuests}</span>
            <select name="guests" defaultValue="1">
              {[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{numberFormat.format(count)}</option>)}
            </select>
          </label>
          <label className="owner-field"><span>{t.requestNote}</span><textarea name="note" rows={2} maxLength={1000} placeholder={t.bookNotePlaceholder} /></label>
          <dl className="book-total">
            <div><dt>{t.bookRent}</dt><dd>{numberFormat.format(monthlyPrice)} {t.currency}</dd></div>
            <div><dt>{t.bookGuestFee}</dt><dd>{numberFormat.format(guestFee)} {t.currency}</dd></div>
            <div className="is-total"><dt>{t.bookTotalNow}</dt><dd>{numberFormat.format(monthlyPrice + guestFee)} {t.currency}</dd></div>
          </dl>
          <p className="book-fee-note">{t.bookFeeNote}</p>
          {error && (
            <p className="owner-feedback owner-feedback-error" role="alert">
              {error}{error === t.bookPhoneRequired && <> <Link href={`/${locale}/account`}>{t.profileEdit}</Link></>}
            </p>
          )}
          <button className="button button-primary book-submit" type="submit" disabled={state === "sending"}>
            {state === "sending" ? t.sending : t.bookSubmit}
          </button>
          <p className="book-guarantee"><ShieldCheck size={16} /> {t.refundPromise}</p>
        </form>
      )}
    </div>
  );
}
