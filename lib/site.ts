import type { SiteLocale } from "@/messages/site";

// Without this, canonical links, the sitemap and share previews would all point at localhost on the live site.
if (!process.env.NEXT_PUBLIC_SITE_URL && process.env.NODE_ENV === "production" && typeof window === "undefined") {
  console.warn("\n[sakani] WARNING: NEXT_PUBLIC_SITE_URL is not set. Canonical links, the sitemap and social previews will point at http://localhost:3000. Set it in Vercel and rebuild.\n");
}

/** Public address of the site, used for canonical links, the sitemap and social previews. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

export function localePath(locale: SiteLocale, path = "") {
  return `/${locale}${path}`;
}

export function listingPath(locale: SiteLocale, id: string) {
  return `/${locale}/listings/${id}`;
}

/** Normalizes an Egyptian number to international format; wa.me links need the country code. */
export function whatsappDigits(number: string) {
  const digits = number.replace(/\D/g, "").replace(/^00/, "");
  if (/^01\d{9}$/.test(digits)) return `2${digits}`;
  return digits;
}

export function whatsappLink(number: string, message?: string) {
  const base = `https://wa.me/${whatsappDigits(number)}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** Keeps Tab inside an open window (filters, all photos), so the keyboard can't wander behind it. */
export function trapTab(event: KeyboardEvent, root: HTMLElement | null) {
  if (event.key !== "Tab" || !root) return;
  const items = [...root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((item) => item.getClientRects().length > 0);
  if (items.length === 0) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === root)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}
