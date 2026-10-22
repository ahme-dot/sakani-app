"use client";

import { Heart } from "lucide-react";
import { toggleSaved, useSavedListings } from "@/lib/saved";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

/** Heart toggle that keeps a home in this browser's saved list. */
export default function SaveButton({ locale, listingId, title, variant = "card" }: { locale: SiteLocale; listingId: string; title: string; variant?: "card" | "page" }) {
  const t = SITE_COPY[locale];
  const saved = useSavedListings().includes(listingId);

  return (
    <button
      type="button"
      className={`save-button save-button-${variant}${saved ? " is-saved" : ""}`}
      aria-pressed={saved}
      aria-label={saved ? t.unsaveAria(title) : t.saveAria(title)}
      onClick={() => toggleSaved(listingId)}
    >
      <Heart size={variant === "card" ? 18 : 17} fill={saved ? "currentColor" : "none"} />
      {variant === "page" && <span>{saved ? t.savedLabel : t.saveLabel}</span>}
    </button>
  );
}
