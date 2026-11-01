import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { LEGAL_PAGE_DEFAULTS, LEGAL_SLUGS, type LegalSlug } from "@/messages/legal-pages";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

/** One policy page: the admin-edited text if there is one, otherwise the default; marked as a draft until approved. */
export default async function LegalPageRoute({ locale, params }: { locale: SiteLocale; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(LEGAL_SLUGS as readonly string[]).includes(slug)) notFound();
  const t = SITE_COPY[locale];
  const fallback = LEGAL_PAGE_DEFAULTS[locale][slug as LegalSlug];
  const client = getSupabaseServerClient();
  const { data } = client
    ? await client.from("legal_pages").select("title,body,approved,updated_at").eq("slug", slug).eq("locale", locale).maybeSingle()
    : { data: null };
  const page = (data as { title: string; body: string; approved: boolean; updated_at: string } | null) ?? { ...fallback, approved: false, updated_at: null };
  const otherLocale: SiteLocale = locale === "ar" ? "en" : "ar";

  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader locale={locale} switchHref={`/${otherLocale}/legal/${slug}`} />
      <main className="documents-page section-wrap">
        <article className="document">
          <header className="document-head">
            <h1>{page.title}</h1>
            {!page.approved && <p className="document-draft">{t.legalDraftNotice}</p>}
          </header>
          {page.body.split(/\n{2,}/).map((paragraph) => (
            <p className="legal-paragraph" key={paragraph.slice(0, 40)}>{paragraph}</p>
          ))}
        </article>
      </main>
      <SiteFooter locale={locale} switchHref={`/${otherLocale}/legal/${slug}`} tab={false} />
    </div>
  );
}
