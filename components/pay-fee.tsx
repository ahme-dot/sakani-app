"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Clock3, LoaderCircle, Wallet } from "lucide-react";
import { CopyValue } from "@/components/owner-payments";
import { fetchPaymentSettings, type FeeStatus, type PaymentMethod, type PaymentSettings } from "@/lib/payments";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { listingRef } from "@/lib/supabase/listings";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type Fee = {
  amount: number;
  status: FeeStatus;
  payer: "owner" | "student";
  kind: "fee" | "upfront";
  rent_amount: number | null;
  fee_amount: number | null;
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
    setBusy(true);
    setError("");
    const { error: submitError } = await supabase.rpc("submit_payment_by_token", {
      token,
      pay_method: String(form.get("method") ?? ""),
      pay_reference: String(form.get("reference") ?? ""),
      pay_phone: String(form.get("phone") ?? ""),
    });
    setBusy(false);
    if (submitError) {
      console.error("Could not submit payment:", submitError);
      setError(t.payError);
      return;
    }
    setVersion((value) => value + 1);
  }

  if (!tokenValid) return <p className="owner-feedback owner-feedback-error" role="alert">{t.payInvalid}</p>;
  if (fee === null) return <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>;
  if (fee === "invalid") return <p className="owner-feedback owner-feedback-error" role="alert">{t.payInvalid}</p>;

  const upfront = fee.kind === "upfront";

  return (
    <article className={`fee-card pay-page-card is-${fee.status}`}>
      <div className="fee-card-head">
        <div>
          <span>{upfront ? t.payUpfrontTitle : fee.payer === "student" ? t.payStudentFee : t.payOwnerFee}</span>
          <strong>{numberFormat.format(fee.amount)} {locale === "ar" ? "جنيه" : "EGP"}</strong>
          <span>{t.feeFor(fee.listing_title)}{fee.listing_id ? ` · ${listingRef(fee.listing_id)}` : ""}</span>
        </div>
        <span className={`fee-status is-${fee.status}`}>{t.feeStatus[fee.status]}</span>
      </div>

      {upfront && fee.rent_amount !== null && fee.fee_amount !== null && (
        <dl className="book-total pay-breakdown">
          <div><dt>{t.bookRent}</dt><dd>{numberFormat.format(fee.rent_amount)} {t.currency}</dd></div>
          <div><dt>{t.bookGuestFee}</dt><dd>{numberFormat.format(fee.fee_amount)} {t.currency}</dd></div>
          <div className="is-total"><dt>{t.bookTotal}</dt><dd>{numberFormat.format(fee.amount)} {t.currency}</dd></div>
        </dl>
      )}
      {upfront && <p className="pay-guarantee">{t.refundPromise}</p>}

      {fee.admin_note && <p className="fee-note"><strong>{t.feeNote}:</strong> {fee.admin_note}</p>}

      {fee.status === "due" && (
        settings?.instapay_address ? (
          <form className="fee-pay" onSubmit={(event) => void submit(event)}>
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
                <input name="phone" id="pay-phone" type="tel" inputMode="tel" required pattern="[0-9+ \(\)\-]{8,20}" dir="ltr" autoComplete="tel" />
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
