import type { SiteLocale } from "@/messages/site";

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
