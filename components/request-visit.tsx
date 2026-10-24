"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CalendarCheck, CheckCircle2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

/** A student asks the Sakani team to arrange a visit; the team then contacts the owner and the student. */
export default function RequestVisit({ locale, listingId, listingTitle }: { locale: SiteLocale; listingId: string; listingTitle: string }) {
  const t = SITE_COPY[locale];
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const contact = String(form.get("contact") ?? "").trim();
    if (name.length < 2 || !/^[+0-9 ()-]{8,20}$/.test(contact) || !supabase) {
      setError(t.requestError);
      return;
    }
    setState("sending");
    setError("");
    // Insert only: visitors can send a request but never read requests back.
    const { error: insertError } = await supabase.from("listing_requests").insert({
      listing_id: listingId,
      listing_title: listingTitle.slice(0, 160),
      name,
      contact,
      preferred_time: String(form.get("preferred_time") ?? "").trim() || null,
      note: String(form.get("note") ?? "").trim() || null,
      locale,
    });
    if (insertError) {
      console.error("Could not send visit request:", insertError);
      setError(t.requestError);
      setState("idle");
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return <p className="request-sent" role="status"><CheckCircle2 size={18} /> {t.requestSent}</p>;
  }

  return (
    <details className="request-visit">
      <summary><CalendarCheck size={17} /> {t.requestTitle}</summary>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <label className="owner-field"><span>{t.requestName}</span><input name="name" id="request-name" required minLength={2} maxLength={80} autoComplete="name" /></label>
        <label className="owner-field"><span>{t.requestContact}</span><input name="contact" id="request-contact" type="tel" inputMode="tel" required pattern="[0-9+ \(\)\-]{8,20}" dir="ltr" autoComplete="tel" /></label>
        <label className="owner-field"><span>{t.requestTime}</span><input name="preferred_time" id="request-time" maxLength={80} /></label>
        <label className="owner-field"><span>{t.requestNote}</span><textarea name="note" id="request-note" rows={2} maxLength={1000} /></label>
        {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
        <button className="button button-outline" type="submit" disabled={state === "sending"}>{state === "sending" ? t.sending : t.requestSubmit}</button>
      </form>
    </details>
  );
}
