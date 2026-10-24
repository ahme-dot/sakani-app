"use client";

import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, Copy, Wallet } from "lucide-react";
import { FEE_GRACE_DAYS, type PaymentMethod, type PaymentSettings, type RentalFee } from "@/lib/payments";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type Props = {
  locale: SiteLocale;
  supabase: SupabaseClient;
  fees: RentalFee[];
  settings: PaymentSettings | null;
  /** When the fees were loaded, for the overdue check (kept out of render). */
  loadedAt: number;
  onChanged: () => void;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function CopyValue({ label, value, copyLabel, copiedLabel }: { label: string; value: string; copyLabel: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="pay-account">
      <span>{label}</span>
      <strong dir="ltr">{value}</strong>
      <button
        type="button"
        className="pay-copy"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
          });
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? copiedLabel : copyLabel}
      </button>
    </div>
  );
}

/** The owner's success fees: how to pay, and a form to send the transfer reference. */
export default function OwnerPayments({ locale, supabase, fees, settings, loadedAt, onChanged }: Props) {
  const t = SITE_COPY[locale];
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const payReady = Boolean(settings && (settings.instapay_address || settings.vodafone_cash_number));

  async function submit(fee: RentalFee, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusyId(fee.id);
    setError("");
    setMessage("");
    const { error: rpcError } = await supabase.rpc("owner_submit_payment", {
      target_fee: fee.id,
      pay_method: String(form.get("method") ?? ""),
      pay_reference: String(form.get("reference") ?? ""),
      pay_phone: String(form.get("phone") ?? ""),
    });
    setBusyId(null);
    if (rpcError) {
      console.error("Could not submit payment:", rpcError);
      setError(t.payError);
      return;
    }
    setMessage(t.paySubmitted);
    onChanged();
  }

  // Owners only ever see their own success fees (the database also enforces this).
  const ownerFees = fees.filter((fee) => fee.payer !== "student");
  if (!ownerFees.length) return null;

  return (
    <section className="owner-payments" aria-labelledby="owner-payments-title">
      <h4 id="owner-payments-title"><Wallet size={17} /> {t.paymentsTitle}</h4>
      <p className="owner-payments-intro">{t.paymentsIntro}</p>

      {ownerFees.map((fee) => {
        const overdue = fee.status === "due" && loadedAt - new Date(fee.created_at).getTime() > FEE_GRACE_DAYS * DAY_MS;
        return (
          <article className={`fee-card is-${fee.status}`} key={fee.id}>
            <div className="fee-card-head">
              <div>
                <strong>{numberFormat.format(fee.amount)} {locale === "ar" ? "جنيه" : "EGP"}</strong>
                <span>{t.feeFor(fee.listing_title)}</span>
              </div>
              <span className={`fee-status is-${fee.status}`}>{t.feeStatus[fee.status]}</span>
            </div>
            {overdue && <p className="fee-overdue">{t.feeOverdue}</p>}
            {fee.admin_note && <p className="fee-note"><strong>{t.feeNote}:</strong> {fee.admin_note}</p>}

            {fee.status === "due" && (
              payReady && settings ? (
                <form className="fee-pay" onSubmit={(event) => void submit(fee, event)}>
                  <p>{t.feeHowTo}</p>
                  <div className="pay-accounts">
                    {settings.instapay_address && <CopyValue label={t.payInstapay} value={settings.instapay_address} copyLabel={t.copy} copiedLabel={t.copied} />}
                    {settings.vodafone_cash_number && <CopyValue label={t.payVodafone} value={settings.vodafone_cash_number} copyLabel={t.copy} copiedLabel={t.copied} />}
                    {settings.payee_name && <p className="pay-payee">{t.payeeName}: <strong>{settings.payee_name}</strong></p>}
                  </div>
                  <div className="owner-field" role="radiogroup" aria-label={t.payMethodLabel}>
                    <span>{t.payMethodLabel}</span>
                    <div className="choice-row">
                      {(["instapay", "vodafone_cash"] as PaymentMethod[])
                        .filter((method) => (method === "instapay" ? settings.instapay_address : settings.vodafone_cash_number))
                        .map((method, index) => (
                          <label className="choice" key={method}>
                            <input type="radio" name="method" value={method} defaultChecked={index === 0} required />
                            <span>{method === "instapay" ? t.payInstapay : t.payVodafone}</span>
                          </label>
                        ))}
                    </div>
                  </div>
                  <div className="owner-form-grid">
                    <label className="owner-field">
                      <span>{t.payReference}</span>
                      <input name="reference" required minLength={3} maxLength={64} dir="ltr" autoComplete="off" />
                      <small className="field-hint">{t.payReferenceHint}</small>
                    </label>
                    <label className="owner-field">
                      <span>{t.payPhone}</span>
                      <input name="phone" type="tel" inputMode="tel" required pattern="[0-9+ \(\)\-]{8,20}" dir="ltr" autoComplete="tel" />
                    </label>
                  </div>
                  <button className="button button-primary" type="submit" disabled={busyId === fee.id}>
                    {busyId === fee.id ? t.sending : t.paySubmit}
                  </button>
                </form>
              ) : (
                <p className="fee-wait">{t.payNotReady}</p>
              )
            )}
            {fee.status === "submitted" && <p className="fee-wait">{t.paySubmitted}</p>}
          </article>
        );
      })}

      {message && <p className="owner-feedback owner-feedback-success" role="status">{message}</p>}
      {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
    </section>
  );
}
