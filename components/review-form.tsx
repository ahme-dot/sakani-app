"use client";

import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Star } from "lucide-react";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

/** After moving in, the guest rates the place once (1–5 stars and a few words). */
export default function ReviewForm({ locale, supabase, bookingId, onDone }: { locale: SiteLocale; supabase: SupabaseClient; bookingId: string; onDone: () => void }) {
  const t = SITE_COPY[locale];
  const [stars, setStars] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stars < 1) {
      setError(t.reviewPickStars);
      return;
    }
    setBusy(true);
    setError("");
    const text = String(new FormData(event.currentTarget).get("body") ?? "");
    const { error: saveError } = await supabase.rpc("guest_review_booking", { target_booking: bookingId, stars, review_text: text });
    setBusy(false);
    if (saveError) {
      console.error("Could not save the review:", saveError);
      setError(saveError.message.includes("already_reviewed") ? t.reviewAlready : t.reviewError);
      return;
    }
    onDone();
  }

  return (
    <form className="review-form" onSubmit={(event) => void submit(event)} noValidate>
      <strong>{t.reviewTitle}</strong>
      <div className="review-stars" role="radiogroup" aria-label={t.reviewStarsLabel}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={stars === value}
            aria-label={t.reviewStarsValue(value)}
            className={value <= stars ? "is-on" : ""}
            onClick={() => setStars(value)}
          >
            <Star size={24} />
          </button>
        ))}
      </div>
      <label className="owner-field"><span>{t.reviewBodyLabel}</span><textarea name="body" rows={3} maxLength={1000} placeholder={t.reviewBodyPlaceholder} /></label>
      {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? t.sending : t.reviewSubmit}</button>
    </form>
  );
}
