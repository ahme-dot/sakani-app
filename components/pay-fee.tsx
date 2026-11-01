"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Clock3, FlaskConical, LoaderCircle, Wallet } from "lucide-react";
import { paymentProvider } from "@/lib/payment-providers";
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
};

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    // Checked here (not by the browser) so the messages are in the page's language.
    const reference = String(form.get("reference") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
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

  if (!tokenValid) return <p className="owner-feedback owner-feedback-error" role="alert">{t.payInvalid}</p>;
  if (fee === null) return <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>;
  if (fee === "invalid") return <p className="owner-feedback owner-feedback-error" role="alert">{t.payInvalid}</p>;

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

  return (
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

      {fee.admin_note && <p className="fee-note"><strong>{t.feeNote}:</strong> {fee.admin_note}</p>}

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

      {fee.status === "due" && provider.asksForReference && (
        settings?.instapay_address ? (
          <form className="fee-pay" onSubmit={(event) => void submit(event)} noValidate>
            <p>{t.feeHowTo}</p>
            <div className="pay-accounts">
              {settings.instapay_address && <CopyValue label={t.payInstapay} value={settings.instapay_address} copyLabel={t.copy} copiedLabel={t.copied} />}
              {settings.payee_name && <p className="pay-payee">{t.payeeName}: <strong>{settings.payee_name}</strong></p>}
            </div>
            <input type="hidden" name="method" value="instapay" />
            <div className="owner-form-grid">
              <label className="owner-field">
                <span>{t.payReference}</span>
                <input name="reference" id="pay-reference" required minLength={3} maxLength={64} dir="ltr" autoComplete="off" />
                <small className="field-hint">{t.payReferenceHint}</small>
              </label>
              <label className="owner-field">
                <span>{t.payPhone}</span>
                <input name="phone" id="pay-phone" type="tel" inputMode="tel" required pattern="[0-9+ \(\)\-]{8,20}" dir="ltr" autoComplete="tel" placeholder="01xxxxxxxxx" />
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
    </article>
  );
}
