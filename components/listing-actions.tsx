"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Flag, LoaderCircle, Share2, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

/** Uses the phone's share sheet when available, otherwise shares on WhatsApp. */
export function ShareListingButton({ locale, title, url, className = "listing-action" }: { locale: SiteLocale; title: string; url: string; className?: string }) {
  const t = SITE_COPY[locale];

  async function share() {
    const text = t.shareMessage(title);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <button className={className} type="button" onClick={() => void share()}>
      <Share2 size={16} /> {t.shareListing}
    </button>
  );
}

const REASONS = ["scam", "unavailable", "wrong_info", "inappropriate", "other"] as const;
type Reason = (typeof REASONS)[number];

export function ReportListing({ locale, listingId }: { locale: SiteLocale; listingId: string }) {
  const t = SITE_COPY[locale];
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | "">("");
  const [details, setDetails] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  const reasonLabels: Record<Reason, string> = {
    scam: t.reportReasonScam,
    unavailable: t.reportReasonUnavailable,
    wrong_info: t.reportReasonWrongInfo,
    inappropriate: t.reportReasonInappropriate,
    other: t.reportReasonOther,
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason) {
      setError(t.reportChooseReason);
      return;
    }
    if (!supabase) {
      setError(t.reportError);
      return;
    }
    setState("sending");
    setError("");
    // Insert only: visitors can create reports but never read them back.
    const { error: insertError } = await supabase.from("listing_reports").insert({
      listing_id: listingId,
      reason,
      details: details.trim() || null,
      contact: contact.trim() || null,
    });
    if (insertError) {
      console.error("Could not send listing report:", insertError);
      setError(t.reportError);
      setState("idle");
      return;
    }
    setState("sent");
  }

  if (!open) {
    return (
      <button className="listing-report-link" type="button" onClick={() => setOpen(true)}>
        <Flag size={14} /> {t.reportListing}
      </button>
    );
  }

  return (
    <div className="listing-report" role="region" aria-label={t.reportListing}>
      <div className="listing-report-head">
        <strong>{t.reportTitle}</strong>
        <button type="button" aria-label={t.cancel} onClick={() => setOpen(false)}><X size={16} /></button>
      </div>
      {state === "sent" ? (
        <p className="owner-feedback owner-feedback-success" role="status">{t.reportThanks}</p>
      ) : (
        <form onSubmit={submit}>
          <div className="listing-report-reasons" role="radiogroup" aria-label={t.reportTitle}>
            {REASONS.map((value) => (
              <label className="choice" key={value}>
                <input type="radio" name="report-reason" value={value} checked={reason === value} onChange={() => { setReason(value); setError(""); }} />
                <span>{reasonLabels[value]}</span>
              </label>
            ))}
          </div>
          <label className="owner-field">
            <span>{t.reportDetails}</span>
            <textarea rows={3} maxLength={1000} value={details} onChange={(event) => setDetails(event.target.value)} />
          </label>
          <label className="owner-field">
            <span>{t.reportContact}</span>
            <input maxLength={120} value={contact} onChange={(event) => setContact(event.target.value)} />
          </label>
          {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
          <button className="button button-primary listing-report-submit" type="submit" disabled={state === "sending"}>
            {state === "sending" && <LoaderCircle className="spinner" size={16} />}
            {state === "sending" ? t.reportSending : t.reportSend}
          </button>
        </form>
      )}
    </div>
  );
}
