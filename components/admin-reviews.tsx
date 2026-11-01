"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Eye, EyeOff, LoaderCircle, Star } from "lucide-react";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type Review = { id: string; listing_id: string | null; rating: number; body: string; hidden: boolean; created_at: string };

/** Admin: every guest review, newest first; a review that breaks the rules can be hidden (and shown again). */
export default function AdminReviews({ locale, supabase }: { locale: SiteLocale; supabase: SupabaseClient }) {
  const t = SITE_COPY[locale];
  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "medium" });
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    void supabase.from("reviews").select("id,listing_id,rating,body,hidden,created_at").order("created_at", { ascending: false }).limit(200).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error("Could not load reviews:", error);
        setFailed(true);
        return;
      }
      const rows = (data ?? []) as Review[];
      setReviews(rows);
      const ids = [...new Set(rows.map((row) => row.listing_id).filter((id): id is string => Boolean(id)))];
      if (ids.length) {
        void supabase.from("properties").select("id,title_ar,title_en").in("id", ids).then(({ data: homes }) => {
          if (active) setTitles(Object.fromEntries(((homes ?? []) as Array<{ id: string; title_ar: string; title_en: string }>).map((home) => [home.id, locale === "ar" ? home.title_ar : home.title_en])));
        });
      }
    });
    return () => {
      active = false;
    };
  }, [supabase, locale, version]);

  async function toggle(review: Review) {
    const { error } = await supabase.from("reviews").update({ hidden: !review.hidden }).eq("id", review.id);
    if (error) console.error("Could not change the review:", error);
    setVersion((value) => value + 1);
  }

  if (failed) return <p className="owner-feedback owner-feedback-error">{t.reviewsLoadError}</p>;
  if (reviews === null) return <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>;
  if (reviews.length === 0) return <section className="admin-empty-state"><Star size={26} /><p>{t.reviewsAdminEmpty}</p></section>;

  return (
    <ul className="admin-reviews">
      {reviews.map((review) => (
        <li key={review.id} className={review.hidden ? "is-hidden" : ""}>
          <div>
            <span className="listing-review-stars" aria-label={t.reviewStarsValue(review.rating)}>{"★".repeat(review.rating)}<span aria-hidden="true">{"★".repeat(5 - review.rating)}</span></span>
            <strong>{review.listing_id ? titles[review.listing_id] ?? "…" : "—"}</strong>
            {review.body && <p>{review.body}</p>}
            <small>{dateFormat.format(new Date(review.created_at))}{review.hidden ? ` · ${t.reviewHiddenLabel}` : ""}</small>
          </div>
          <button className="admin-btn admin-btn-ghost" type="button" onClick={() => void toggle(review)}>
            {review.hidden ? <><Eye size={15} /> {t.reviewShow}</> : <><EyeOff size={15} /> {t.reviewHide}</>}
          </button>
        </li>
      ))}
    </ul>
  );
}
