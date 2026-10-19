import type { Metadata } from "next";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

const OG_LOCALE: Record<SiteLocale, string> = { ar: "ar_EG", en: "en_US" };

/** Metadata for a public page that exists in both languages at /ar{path} and /en{path}. */
export function bilingualMetadata(
  locale: SiteLocale,
  path: string,
  { title, description, image }: { title?: string; description?: string; image?: string } = {},
): Metadata {
  const t = SITE_COPY[locale];
  const pageTitle = title ?? t.metaTitle;
  const pageDescription = description ?? t.metaDescription;

  return {
    title: pageTitle,
    description: pageDescription,
    alternates: {
      canonical: `/${locale}${path}`,
      languages: { ar: `/ar${path}`, en: `/en${path}`, "x-default": `/ar${path}` },
    },
    openGraph: {
      type: "website",
      siteName: t.brandLabel,
      locale: OG_LOCALE[locale],
      url: `/${locale}${path}`,
      title: pageTitle,
      description: pageDescription,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: pageTitle,
      description: pageDescription,
      ...(image ? { images: [image] } : {}),
    },
  };
}

/** Admin and account pages should never appear in search results. */
export const PRIVATE_PAGE_METADATA: Metadata = {
  robots: { index: false, follow: false },
};
