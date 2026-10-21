import type { Metadata } from "next";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

const OG_LOCALE: Record<SiteLocale, string> = { ar: "ar_EG", en: "en_US" };
const DEFAULT_SHARE_IMAGE = "/opengraph-image";

/** Metadata for a public page that exists in both languages at /ar{path} and /en{path}. */
export function bilingualMetadata(
  locale: SiteLocale,
  path: string,
  { title, description, image }: { title?: string; description?: string; image?: string } = {},
): Metadata {
  const t = SITE_COPY[locale];
  const pageTitle = title ?? t.metaTitle;
  const pageDescription = description ?? t.metaDescription;
  // Pages that set openGraph here hide the inherited app/opengraph-image, so fall back to it explicitly.
  const shareImage = image ?? DEFAULT_SHARE_IMAGE;

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
      images: [image ? { url: image } : { url: DEFAULT_SHARE_IMAGE, width: 1200, height: 630, alt: t.metaTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description: pageDescription,
      images: [shareImage],
    },
  };
}

/** Admin and account pages should never appear in search results. */
export const PRIVATE_PAGE_METADATA: Metadata = {
  robots: { index: false, follow: false },
};
