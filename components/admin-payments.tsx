"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, LoaderCircle, MessageCircle, RotateCcw, Wallet, X } from "lucide-react";
import {
  DEFAULT_PAYMENT_SETTINGS,
  RENTAL_FEE_COLUMNS,
  fetchPaymentSettings,
  isMissingFunction,
  type FeeStatus,
  type PaymentSettings,
  type RentalFee,
} from "@/lib/payments";
import { whatsappLink } from "@/lib/site";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type Props = { locale: SiteLocale; supabase: SupabaseClient; onChanged: () => void };
type OwnerContact = { listing_id: string; whatsapp_number: string };

const TABS: FeeStatus[] = ["submitted", "due", "paid", "waived"];

/** Admin: payment details and fee settings, and the success fees owners owe or paid. */
export default function AdminPayments({ locale, supabase, onChanged }: Props) {
  const t = SITE_COPY[locale];
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG");
  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "medium", timeStyle: "short" });
  const [ready, setReady] = useState<boolean | null>(null);
  const [settings, setSettings] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  const [fees, setFees] = useState<RentalFee[]>([]);
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<FeeStatus>("submitted");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      supabase.from("rental_fees").select(RENTAL_FEE_COLUMNS).order("created_at", { ascending: false }).limit(500),
      fetchPaymentSettings(supabase),
    ]).then(async ([{ data, error: feesError }, loadedSettings]) => {
      if (!mounted) return;
      if (feesError) {
        if (!isMissingFunction(feesError)) console.error("Could not load fees:", feesError);
        setReady(false);
        return;
      }
      const rows = (data ?? []) as unknown as RentalFee[];
      setFees(rows);
      if (loadedSettings) setSettings(loadedSettings);
      setReady(true);
      // Owner WhatsApp numbers, to remind owners about due fees.
      const listingIds = [...new Set(rows.map((fee) => fee.listing_id).filter((id): id is string => Boolean(id)))];
      if (listingIds.length) {
        const { data: contacts } = await supabase.from("properties").select("id,whatsapp_number").in("id", listingIds);
        if (mounted) setPhones(Object.fromEntries(((contacts ?? []) as Array<{ id: string; whatsapp_number: string }>).map((row) => [row.id, row.whatsapp_number])));
      }
    });
    return () => {
      mounted = false;
    };
  }, [supabase, version]);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    const { error: saveError } = await supabase.from("app_settings").update({
      payee_name: String(form.get("payee_name") ?? "").trim(),
      instapay_address: String(form.get("instapay_address") ?? "").trim(),
      vodafone_cash_number: String(form.get("vodafone_cash_number") ?? "").trim(),
      fee_percent: Number(form.get("fee_percent")),
      fee_minimum: Number(form.get("fee_minimum")),
    }).eq("id", 1);
    setBusy(false);
    if (saveError) {
      console.error("Could not save payment settings:", saveError);
      setError(t.formError);
      return;
    }
    setMessage(t.settingsSaved);
    setVersion((value) => value + 1);
  }

  async function decide(fee: RentalFee, decision: "paid" | "due" | "waived") {
    setBusy(true);
    setError("");
    setMessage("");
    const { error: decideError } = await supabase.rpc("admin_decide_fee", { target_fee: fee.id, decision });
    setBusy(false);
    if (decideError) {
      console.error("Could not update fee:", decideError);
      setError(t.formError);
      return;
    }
    setVersion((value) => value + 1);
    onChanged();
  }

  if (ready === null) return <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>;
  if (!ready) return <p className="owner-feedback owner-feedback-error">{t.paymentsMigration}</p>;

  const total = (status: FeeStatus) => fees.filter((fee) => fee.status === status).reduce((sum, fee) => sum + fee.amount, 0);
  const visible = fees.filter((fee) => fee.status === tab);
  const contact = (fee: RentalFee): OwnerContact | null => (fee.listing_id && phones[fee.listing_id] ? { listing_id: fee.listing_id, whatsapp_number: phones[fee.listing_id] } : null);

  return (
    <div className="admin-payments">
      <div className="admin-stats admin-pay-stats">
        <div className="admin-stat admin-stat-approved"><span className="admin-stat-label"><Wallet size={14} /> {t.feeTabs.paid}</span><strong>{numberFormat.format(total("paid"))}</strong><small>{t.revenueTotal(numberFormat.format(total("paid")))}</small></div>
        <div className="admin-stat admin-stat-pending"><span className="admin-stat-label">{t.feeTabs.submitted}</span><strong>{numberFormat.format(fees.filter((fee) => fee.status === "submitted").length)}</strong><small>{numberFormat.format(total("submitted"))} EGP</small></div>
        <div className="admin-stat admin-stat-rejected"><span className="admin-stat-label">{t.feeTabs.due}</span><strong>{numberFormat.format(fees.filter((fee) => fee.status === "due").length)}</strong><small>{t.revenueDue(numberFormat.format(total("due")))}</small></div>
      </div>

      <div className="admin-segment" role="tablist" aria-label={t.adminViewPayments}>
        {TABS.map((status) => (
          <button key={status} type="button" role="tab" aria-selected={tab === status} className={tab === status ? "is-active" : ""} onClick={() => setTab(status)}>
            {t.feeTabs[status]} <span>{numberFormat.format(fees.filter((fee) => fee.status === status).length)}</span>
          </button>
        ))}
      </div>

      {message && <p className="owner-feedback owner-feedback-success admin-feedback" role="status">{message}</p>}
      {error && <p className="owner-feedback owner-feedback-error admin-feedback" role="alert">{error}</p>}

      {visible.length === 0 ? (
        <section className="admin-empty-state"><Wallet size={26} /><p>{t.feesEmpty}</p></section>
      ) : (
        <div className="admin-fee-list">
          {visible.map((fee) => {
            const owner = contact(fee);
            return (
              <article className="admin-fee" key={fee.id}>
                <div className="admin-fee-main">
                  <strong>{numberFormat.format(fee.amount)} EGP</strong>
                  <span>{fee.listing_title}</span>
                  <small>{dateFormat.format(new Date(fee.submitted_at ?? fee.created_at))}{fee.created_by_admin ? " · admin" : ""}</small>
                </div>
                {fee.reference && (
                  <dl className="admin-fee-ref">
                    <div><dt>{fee.method === "vodafone_cash" ? t.payVodafone : t.payInstapay}</dt><dd dir="ltr">{fee.reference}</dd></div>
                    {fee.payer_phone && <div><dt>{t.feePaidFrom}</dt><dd dir="ltr">{fee.payer_phone}</dd></div>}
                  </dl>
                )}
                <div className="admin-card-actions">
                  {fee.status !== "paid" && (
                    <button className="admin-btn admin-btn-primary" type="button" disabled={busy} onClick={() => void decide(fee, "paid")}><Check size={15} /> {t.markPaid}</button>
                  )}
                  {fee.status === "submitted" && (
                    <button className="admin-btn admin-btn-danger-outline" type="button" disabled={busy} onClick={() => void decide(fee, "due")}><RotateCcw size={15} /> {t.markDue}</button>
                  )}
                  {(fee.status === "due" || fee.status === "submitted") && (
                    <button className="admin-btn admin-btn-ghost" type="button" disabled={busy} onClick={() => void decide(fee, "waived")}><X size={15} /> {t.markWaived}</button>
                  )}
                  {owner && (
                    <a className="admin-btn admin-btn-ghost" href={whatsappLink(owner.whatsapp_number)} target="_blank" rel="noreferrer"><MessageCircle size={15} /> {t.feeOwnerPhone}</a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <form className="admin-pay-settings" onSubmit={(event) => void saveSettings(event)}>
        <h2>{t.settingsTitle}</h2>
        <div className="owner-form-grid">
          <label className="owner-field"><span>{t.settingsInstapay}</span><input name="instapay_address" defaultValue={settings.instapay_address} maxLength={80} dir="ltr" placeholder="name@instapay" /></label>
          <label className="owner-field"><span>{t.settingsVodafone}</span><input name="vodafone_cash_number" defaultValue={settings.vodafone_cash_number} maxLength={20} pattern="[0-9+ \(\)\-]{8,20}" inputMode="tel" dir="ltr" placeholder="010xxxxxxxx" /></label>
          <label className="owner-field"><span>{t.settingsPayee}</span><input name="payee_name" defaultValue={settings.payee_name} maxLength={80} /></label>
          <label className="owner-field"><span>{t.settingsPercent}</span><input name="fee_percent" type="number" min="0" max="100" step="0.5" required defaultValue={settings.fee_percent} dir="ltr" /></label>
          <label className="owner-field"><span>{t.settingsMinimum}</span><input name="fee_minimum" type="number" min="0" max="100000" step="10" required defaultValue={settings.fee_minimum} dir="ltr" /></label>
        </div>
        <button className="admin-btn admin-btn-primary" type="submit" disabled={busy}>{t.settingsSave}</button>
      </form>
    </div>
  );
}
