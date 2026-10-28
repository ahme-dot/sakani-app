"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { CalendarCheck, CheckCircle2, LoaderCircle, LogIn } from "lucide-react";
import { PHONE_PATTERN, useAccount } from "@/lib/account";
import { studentFee, type PaymentSettings } from "@/lib/payments";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type Props = {
  locale: SiteLocale;
  listingId: string;
  listingTitle: string;
  monthlyPrice: number;
  fees: PaymentSettings;
};

/** Today in Egypt as YYYY-MM-DD (the earliest move-in date). */
function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
}

/** A signed-in guest asks to book a home; the Sakani team confirms with the host, then fees are due from both sides. */
export default function BookHome({ locale, listingId, listingTitle, monthlyPrice, fees }: Props) {
  const t = SITE_COPY[locale];
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const account = useAccount(supabase);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG");
  const guestFee = studentFee(monthlyPrice, fees);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || account.status !== "signedIn") return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const contact = String(form.get("contact") ?? "").trim();
    const moveIn = String(form.get("move_in") ?? "");
    const months = Number(form.get("months"));
    const guests = Number(form.get("guests"));
    if (name.length < 2 || !PHONE_PATTERN.test(contact) || !moveIn || moveIn < today() || !(months >= 1 && months <= 24) || !(guests >= 1 && guests <= 10)) {
      setError(t.bookError);
      return;
    }
    setState("sending");
    setError("");
    const { error: insertError } = await supabase.from("listing_requests").insert({
      listing_id: listingId,
      listing_title: listingTitle.slice(0, 160),
      name,
      contact,
      move_in: moveIn,
      months,
      guests,
      note: String(form.get("note") ?? "").trim() || null,
      locale,
    });
    if (insertError) {
      console.error("Could not send booking:", insertError);
      setError(insertError.message.includes("request_limit") ? t.bookBusy : t.bookError);
      setState("idle");
      return;
    }
    // Remember the phone for next time if the profile had none.
    if (account.profile && !account.profile.phone) {
      await supabase.from("profiles").update({ phone: contact }).eq("id", account.user.id);
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <div className="book-sent" role="status">
        <CheckCircle2 size={20} />
        <div>
          <strong>{t.bookSentTitle}</strong>
          <p>{t.bookSentText}</p>
          <Link href={`/${locale}/account#bookings`}>{t.bookSeeMine}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="book-home" id="book">
      <h2 className="book-home-title"><CalendarCheck size={18} /> {t.bookTitle}</h2>
      {account.status === "loading" ? (
        <p className="book-home-loading"><LoaderCircle className="spinner" size={18} /> {t.loading}</p>
      ) : account.status === "signedOut" ? (
        <div className="book-home-login">
          <p>{t.bookLoginText}</p>
          <Link className="button button-primary book-login" href={`/${locale}/account?role=guest&next=${encodeURIComponent(`/${locale}/listings/${listingId}#book`)}`}>
            <LogIn size={17} /> {t.bookLoginButton}
          </Link>
          <Link className="book-signup" href={`/${locale}/account?mode=signup&role=guest&next=${encodeURIComponent(`/${locale}/listings/${listingId}#book`)}`}>{t.bookSignupLink}</Link>
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
          <div className="book-form-grid">
            <label className="owner-field"><span>{t.requestName}</span><input name="name" required minLength={2} maxLength={80} autoComplete="name" defaultValue={account.profile?.full_name || (account.user.user_metadata?.full_name as string | undefined) || ""} /></label>
            <label className="owner-field"><span>{t.requestContact}</span><input name="contact" type="tel" inputMode="tel" required pattern="[0-9+ \(\)\-]{8,20}" dir="ltr" autoComplete="tel" defaultValue={account.profile?.phone ?? ""} /></label>
          </div>
          <label className="owner-field"><span>{t.requestNote}</span><textarea name="note" rows={2} maxLength={1000} placeholder={t.bookNotePlaceholder} /></label>
          <dl className="book-total">
            <div><dt>{t.bookRent}</dt><dd>{numberFormat.format(monthlyPrice)} {t.perMonth}</dd></div>
            <div><dt>{t.bookGuestFee}</dt><dd>{numberFormat.format(guestFee)} {t.currency}</dd></div>
          </dl>
          <p className="book-fee-note">{t.bookFeeNote}</p>
          {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
          <button className="button button-primary book-submit" type="submit" disabled={state === "sending"}>
            {state === "sending" ? t.sending : t.bookSubmit}
          </button>
        </form>
      )}
    </div>
  );
}
