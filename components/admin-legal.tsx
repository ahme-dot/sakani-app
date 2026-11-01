"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ExternalLink, LoaderCircle, Save } from "lucide-react";
import { LEGAL_PAGE_DEFAULTS, LEGAL_SLUGS, type LegalSlug } from "@/messages/legal-pages";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type Page = { title: string; body: string; approved: boolean; saved: boolean };

/** Admin: edit the policy pages in both languages, and mark them approved once a lawyer has reviewed them. */
export default function AdminLegal({ locale, supabase }: { locale: SiteLocale; supabase: SupabaseClient }) {
  const t = SITE_COPY[locale];
  const [slug, setSlug] = useState<LegalSlug>(LEGAL_SLUGS[0]);
  const [pageLocale, setPageLocale] = useState<SiteLocale>(locale);
  const [page, setPage] = useState<Page | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.from("legal_pages").select("title,body,approved").eq("slug", slug).eq("locale", pageLocale).maybeSingle().then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) console.error("Could not load the legal page:", loadError);
      const fallback = LEGAL_PAGE_DEFAULTS[pageLocale][slug];
      setPage(data ? { ...(data as Omit<Page, "saved">), saved: true } : { ...fallback, approved: false, saved: false });
    });
    return () => {
      active = false;
    };
  }, [supabase, slug, pageLocale]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = {
      slug,
      locale: pageLocale,
      title: String(form.get("title") ?? "").trim(),
      body: String(form.get("body") ?? "").trim(),
      approved: form.has("approved"),
      updated_at: new Date().toISOString(),
      updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    };
    if (values.title.length < 3 || values.body.length < 10) {
      setError(t.legalTooShort);
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    const { error: saveError } = await supabase.from("legal_pages").upsert(values, { onConflict: "slug,locale" });
    setBusy(false);
    if (saveError) {
      console.error("Could not save the legal page:", saveError);
      setError(t.adminUpdateError);
      return;
    }
    setPage({ title: values.title, body: values.body, approved: values.approved, saved: true });
    setMessage(t.settingsSaved);
  }

  return (
    <section className="admin-legal">
      <div className="admin-users-toolbar">
        <label className="owner-field">
          <span>{t.legalPageLabel}</span>
          <select value={slug} onChange={(event) => { setPage(null); setSlug(event.target.value as LegalSlug); }}>
            {LEGAL_SLUGS.map((item) => <option key={item} value={item}>{t.legalTitles[item]}</option>)}
          </select>
        </label>
        <div className="admin-segment" role="tablist" aria-label={t.footerLanguage}>
          {(["ar", "en"] as const).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={pageLocale === item} className={pageLocale === item ? "is-active" : ""} onClick={() => { setPage(null); setPageLocale(item); }}>
              {item === "ar" ? "العربية" : "English"}
            </button>
          ))}
        </div>
        <a className="admin-btn admin-btn-ghost" href={`/${pageLocale}/legal/${slug}`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> {t.adminViewPublic}</a>
      </div>
      {message && <p className="owner-feedback owner-feedback-success admin-feedback" role="status">{message}</p>}
      {error && <p className="owner-feedback owner-feedback-error admin-feedback" role="alert">{error}</p>}
      {!page ? (
        <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>
      ) : (
        <form key={`${slug}-${pageLocale}`} className="admin-pay-settings" onSubmit={(event) => void save(event)}>
          {!page.saved && <p className="field-hint">{t.legalUsingDefault}</p>}
          <label className="owner-field"><span>{t.legalTitleLabel}</span><input name="title" defaultValue={page.title} maxLength={120} dir={pageLocale === "ar" ? "rtl" : "ltr"} required /></label>
          <label className="owner-field"><span>{t.legalBodyLabel}</span><textarea name="body" defaultValue={page.body} rows={14} maxLength={20000} dir={pageLocale === "ar" ? "rtl" : "ltr"} required /></label>
          <label className="choice">
            <input type="checkbox" name="approved" defaultChecked={page.approved} />
            <span>{t.legalApprovedLabel}</span>
          </label>
          <button className="admin-btn admin-btn-primary" type="submit" disabled={busy}><Save size={15} /> {t.settingsSave}</button>
        </form>
      )}
    </section>
  );
}
