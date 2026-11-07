"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Clock3, CreditCard, FlaskConical, LoaderCircle, ShieldCheck, Wallet } from "lucide-react";
import { useAccount } from "@/lib/account";
import { latinDigits, onDigitsInput } from "@/lib/digits";
import { paymentProvider, startCardCheckout } from "@/lib/payment-providers";
import { CopyValue } from "@/components/owner-payments";
import { fetchPaymentSettings, type FeeStatus, type PaymentMethod, type PaymentSettings } from "@/lib/payments";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useListingTitles } from "@/lib/listing-titles";
import { listingRef } from "@/lib/supabase/listings";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type Fee = {
  amount: number;
  status: FeeStatus;
  payer: "owner" | "student";
  kind: "fee" | "upfront";
  rent_amount: number | null;
  fee_amount: number | null;
  deposit_amount: number | null;
  listing_id: string | null;
  listing_title: string;
  monthly_price: number;
  method: PaymentMethod | null;
  submitted_at: string | null;
  decided_at: string | null;
  admin_note: string | null;
  /** The card fee: worked out now while the fee is due, or what was paid. Missing before the card migration. */
  card_fee?: number | null;
};

/** How the guest came back from the card page: "ok", "fail" or "check" (couldn't tell yet). */
function cardReturnState() {
  if (typeof window === "undefined") return "";
  const state = new URLSearchParams(window.location.search).get("card") ?? "";
  return ["ok", "fail", "check"].includes(state) ? state : "";
}

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Payment page behind a private link: one fee, how to pay it, and a form for the transfer details. */
export default function PayFee({ locale, token }: { locale: SiteLocale; token: string }) {
  const t = SITE_COPY[locale];
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG");
  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "medium" });
  const [fee, setFee] = useState<Fee | null | "invalid">(null);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cardState] = useState(cardReturnState);
  const [checks, setChecks] = useState(0);
  // The payer's number: what they typed, otherwise the one on their account.
  const account = useAccount(supabase);
  const [typedPhone, setTypedPhone] = useState<string | null>(null);
  const phoneValue = typedPhone ?? (account.status === "signedIn" ? account.profile?.phone ?? "" : "");

  const tokenValid = Boolean(supabase) && TOKEN_PATTERN.test(token);
  const titleOf = useListingTitles(supabase, [fee && fee !== "invalid" ? fee.listing_id : null], locale);

  useEffect(() => {
    if (!supabase || !tokenValid) return;
    let mounted = true;
    void Promise.all([supabase.rpc("fee_by_token", { token }), fetchPaymentSettings(supabase)]).then(([{ data, error: loadError }, loaded]) => {
      if (!mounted) return;
      const row = (data as Fee[] | null)?.[0];
      if (loadError || !row) {
        if (loadError) console.error("Could not load fee:", loadError);
        setFee("invalid");
        return;
      }
      setFee(row);
      setSettings(loaded);
    });
    return () => {
      mounted = false;
    };
  }, [supabase, token, tokenValid, version]);

  // Back from the card page: the payment is confirmed by Paymob's message to the server, usually within
  // seconds. Look again every 3 seconds for up to a minute.
  const waitingForCard = (cardState === "ok" || cardState === "check") && fee !== null && fee !== "invalid" && fee.status === "due" && checks < 20;
  useEffect(() => {
    if (!waitingForCard) return;
    const timer = window.setTimeout(() => {
      setChecks((value) => value + 1);
      setVersion((value) => value + 1);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [waitingForCard, checks]);

  async function payByCard() {
    setBusy(true);
    setError("");
    const { url, error: cardError } = await startCardCheckout(token, locale);
    if (url) {
      window.location.assign(url);
      return;
    }
    setBusy(false);
    setError(cardError === "fee_not_due" ? t.cardNotDue : cardError === "too_many_attempts" ? t.cardTooMany : t.cardStartError);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    // Checked here (not by the browser) so the messages are in the page's language.
    const reference = latinDigits(String(form.get("reference") ?? "")).trim();
    const phone = latinDigits(String(form.get("phone") ?? "")).trim();
    if (reference.length < 3) {
      setError(t.payReferenceInvalid);
      document.getElementById("pay-reference")?.focus();
      return;
    }
    if (!/^[0-9+ ()-]{8,20}$/.test(phone)) {
      setError(t.payPhoneInvalid);
      document.getElementById("pay-phone")?.focus();
      return;
    }
    setBusy(true);
    setError("");
    const { error: submitError } = await supabase.rpc("submit_payment_by_token", {
      token,
      pay_method: String(form.get("method") ?? ""),
      pay_reference: reference,
      pay_phone: phone,
    });
    setBusy(false);
    if (submitError) {
      console.error("Could not submit payment:", submitError);
      setError(t.payError);
      return;
    }
    setVersion((value) => value + 1);
    // The form was low on the page; bring the "we're checking your transfer" note into view.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!tokenValid || fee === "invalid") {
    return (
      <>
        <h1>{t.payInvalidTitle}</h1>
        <p role="alert">{t.payInvalid}</p>
        <div className="pay-invalid-actions">
          <Link className="button button-primary" href={`/${locale}/help#contact`}>{t.payInvalidAction}</Link>
          <Link className="button button-outline" href={`/${locale}/account#bookings`}>{t.bookSeeMine}</Link>
        </div>
      </>
    );
  }

  const heading = <><h1>{t.payPageTitle}</h1><p>{t.payPageIntro}</p></>;
  if (fee === null) return <>{heading}<div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div></>;

  const upfront = fee.kind === "upfront";
  const provider = paymentProvider(settings?.payment_mode);

  async function simulate(succeed: boolean) {
    if (!supabase || !provider.settle) return;
    setBusy(true);
    setError("");
    const { error: settleError } = await provider.settle(supabase, token, succeed);
    setBusy(false);
    if (settleError) {
      console.error("Could not simulate the payment:", settleError);
      setError(t.payError);
      return;
    }
    setVersion((value) => value + 1);
  }

  // Where to go once the money is on its way: guests to their bookings, hosts back to their listings.
  const onward = fee.status === "submitted" || fee.status === "paid" ? (
    <Link className="button button-primary pay-onward" href={fee.payer === "student" ? `/${locale}/account#bookings` : `/${locale}/host`}>
      {fee.payer === "student" ? t.bookSeeMine : t.payOnwardHost}
    </Link>
  ) : null;

  return (
    <>
    {heading}
    <article className={`fee-card pay-page-card is-${fee.status}`}>
      <div className="fee-card-head">
        <div>
          <span>{upfront ? t.payUpfrontTitle : fee.payer === "student" ? t.payStudentFee : t.payOwnerFee}</span>
          <strong>{numberFormat.format(fee.amount)} {locale === "ar" ? "جنيه" : "EGP"}</strong>
          <span>{t.feeFor(titleOf(fee.listing_id, fee.listing_title))}{fee.listing_id && <> · <bdi dir="ltr">{listingRef(fee.listing_id)}</bdi></>}</span>
        </div>
        <span className={`fee-status is-${fee.status}`}>{t.feeStatus[fee.status]}</span>
      </div>

      {upfront && fee.rent_amount !== null && fee.fee_amount !== null && (
        <dl className="book-total pay-breakdown">
          <div><dt>{t.bookRent}</dt><dd>{numberFormat.format(fee.rent_amount)} {t.currency}</dd></div>
          <div><dt>{t.bookGuestFee}</dt><dd>{numberFormat.format(fee.fee_amount)} {t.currency}</dd></div>
          {Boolean(fee.deposit_amount) && <div><dt>{t.bookDeposit}</dt><dd>{numberFormat.format(fee.deposit_amount ?? 0)} {t.currency}</dd></div>}
          <div className="is-total"><dt>{t.bookTotal}</dt><dd>{numberFormat.format(fee.amount)} {t.currency}</dd></div>
        </dl>
      )}
      {upfront && <p className="pay-guarantee">{t.refundPromise}</p>}

      {/* Once the guest has sent the transfer again, the team's earlier note no longer applies. */}
      {fee.admin_note && fee.status !== "submitted" && <p className="fee-note"><strong>{t.feeNote}:</strong> {fee.admin_note}</p>}

      {fee.status === "due" && provider.settle && (
        <div className="pay-sandbox">
          <p><FlaskConical size={16} /> {t.sandboxNotice}</p>
          <div className="profile-row-actions">
            <button className="button button-primary" type="button" disabled={busy} onClick={() => void simulate(true)}>{t.sandboxSucceed}</button>
            <button className="button button-outline" type="button" disabled={busy} onClick={() => void simulate(false)}>{t.sandboxFail}</button>
          </div>
          {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
        </div>
      )}

      {fee.status === "due" && provider.card && (
        <div className="pay-card">
          {waitingForCard ? (
            <p className="pay-state" role="status"><LoaderCircle className="spinner" size={18} /> {t.cardConfirming}</p>
          ) : (
            <>
              {cardState === "fail" && <p className="owner-feedback owner-feedback-error" role="alert">{t.cardFailed}</p>}
              {(cardState === "ok" || cardState === "check") && <p className="owner-feedback" role="status">{t.cardSlow}</p>}
              <dl className="book-total pay-breakdown">
                <div><dt>{t.cardAmount}</dt><dd>{numberFormat.format(fee.amount)} {t.currency}</dd></div>
                <div><dt>{t.cardFeeLabel(numberFormat.format(settings?.card_fee_percent ?? 0), numberFormat.format(settings?.card_fee_fixed ?? 0))}</dt><dd>{numberFormat.format(fee.card_fee ?? 0)} {t.currency}</dd></div>
                <div className="is-total"><dt>{t.cardTotal}</dt><dd>{numberFormat.format(fee.amount + (fee.card_fee ?? 0))} {t.currency}</dd></div>
              </dl>
              <button className="button button-primary pay-card-button" type="button" disabled={busy} onClick={() => void payByCard()}>
                {busy ? <LoaderCircle className="spinner" size={18} /> : <CreditCard size={18} />} {busy ? t.cardOpening : t.payByCard}
              </button>
              <p className="pay-card-brands" aria-label={t.cardBrandsLabel}><span>Visa</span><span>Mastercard</span><span>Meeza</span></p>
              <p className="field-hint pay-card-safe"><ShieldCheck size={15} /> {t.cardSafeNote}</p>
              {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
            </>
          )}
        </div>
      )}

      {fee.status === "due" && provider.asksForReference && (
        settings?.instapay_address ? (
          <form className="fee-pay" onSubmit={(event) => void submit(event)} noValidate>
            <p>{t.feeHowTo}</p>
            <div className="pay-accounts">
              <CopyValue label={t.payAmountToSend} value={String(fee.amount)} copyLabel={t.copy} copiedLabel={t.copied} />
              {settings.instapay_address && <CopyValue label={t.payInstapay} value={settings.instapay_address} copyLabel={t.copy} copiedLabel={t.copied} />}
              {settings.payee_name && <p className="pay-payee">{t.payeeName}: <strong>{settings.payee_name}</strong></p>}
            </div>
            <input type="hidden" name="method" value="instapay" />
            <div className="owner-form-grid">
              <label className="owner-field">
                <span>{t.payReference}</span>
                <input name="reference" id="pay-reference" required minLength={3} maxLength={64} dir="ltr" autoComplete="off" onInput={onDigitsInput} />
                <small className="field-hint">{t.payReferenceHint}</small>
              </label>
              <label className="owner-field">
                <span>{t.payPhone}</span>
                <input name="phone" id="pay-phone" type="tel" inputMode="tel" required pattern="[0-9+ \(\)\-]{8,20}" dir="ltr" autoComplete="tel" placeholder="01xxxxxxxxx" value={phoneValue} onChange={(event) => setTypedPhone(latinDigits(event.target.value))} />
                <small className="field-hint">{t.payPhoneHint}</small>
              </label>
            </div>
            {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
            <button className="button button-primary" type="submit" disabled={busy}>{busy ? t.sending : t.paySubmit}</button>
          </form>
        ) : (
          <p className="fee-wait">{t.payNotReady}</p>
        )
      )}

      {fee.status === "submitted" && (
        <p className="pay-state"><Clock3 size={18} /> {t.paySubmitted}</p>
      )}
      {fee.status === "paid" && (
        <p className="pay-state is-paid"><CheckCircle2 size={18} /> {t.paidThanks}{fee.decided_at ? ` · ${dateFormat.format(new Date(fee.decided_at))}` : ""}</p>
      )}
      {fee.status === "waived" && (
        <p className="pay-state"><Wallet size={18} /> {t.feeStatus.waived}</p>
      )}
      {fee.status === "refunded" && (
        <p className="pay-state is-paid"><Wallet size={18} /> {t.feeStatus.refunded}</p>
      )}
      {onward}
    </article>
    </>
  );
}
