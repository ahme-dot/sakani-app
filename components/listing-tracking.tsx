"use client";

import { useEffect, type ReactNode } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type EventKind = "view" | "whatsapp";

/** Records a view or WhatsApp click for a published listing. Fire-and-forget; never blocks the visitor. */
export function trackListingEvent(listingId: string, kind: EventKind) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  void supabase.from("listing_events").insert({ listing_id: listingId, kind }).then(({ error }) => {
    if (error) console.warn("Could not record listing event:", error.message);
  });
}

/** Counts one view per listing per browser session. */
export function TrackListingView({ listingId }: { listingId: string }) {
  useEffect(() => {
    const key = `sakani-viewed-${listingId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Storage unavailable (private mode); still count the view.
    }
    trackListingEvent(listingId, "view");
  }, [listingId]);
  return null;
}

/** WhatsApp link that also counts the click for the listing's stats. */
export function WhatsAppLink({
  listingId,
  href,
  className,
  ariaLabel,
  children,
}: {
  listingId: string;
  href: string;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer" aria-label={ariaLabel} onClick={() => trackListingEvent(listingId, "whatsapp")}>
      {children}
    </a>
  );
}
