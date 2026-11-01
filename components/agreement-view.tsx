"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, LogIn, Printer } from "lucide-react";
import { useAccount } from "@/lib/account";
import { DOCUMENT_VERSION, type PlatformDocument } from "@/lib/documents";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { DOCUMENTS_COPY } from "@/messages/documents";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

/** The platform agreement for guests or hosts: readable by anyone, accepted (and recorded) by signed-in users. */
export default function AgreementView({ locale, document }: { locale: SiteLocale; document: PlatformDocument }) {
  const d = DOCUMENTS_COPY[locale];
  const t = SITE_COPY[locale];
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const account = useAccount(supabase);
  const timeFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "long", timeStyle: "short" });
  const [acceptedOn, setAcceptedOn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signedInId = account.status === "signedIn" ? account.user.id : null;
  const sections = document === "guest_platform" ? d.guestPlatform : d.hostPlatform;

  useEffect(() => {
    if (!supabase || !signedInId) return;
    let active = true;
    void supabase
      .from("contract_acceptances")
      .select("accepted_at")
      .eq("user_id", signedInId)
      .eq("document", document)
      .eq("document_version", DOCUMENT_VERSION)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) setAcceptedOn(data.accepted_at as string);
      });
    return () => {
      active = false;
    };
  }, [supabase, signedInId, document]);

  async function accept() {
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { error: acceptError } = await supabase.rpc("accept_document", { target_booking: null, doc: document, doc_version: DOCUMENT_VERSION });
    setBusy(false);
    if (acceptError) {
      console.error("Could not accept the agreement:", acceptError);
      setError(d.acceptError);
      return;
    }
    setAcceptedOn(new Date().toISOString());
  }

  return (
    <article className="document" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="document-actions no-print">
        <span />
        <button className="button button-primary" type="button" onClick={() => window.print()}><Printer size={16} /> {d.print}</button>
      </div>
      <header className="document-head">
        <strong className="document-brand">{t.brandLabel} · {locale === "ar" ? "Sakani" : "سكني"}</strong>
        <h1>{d.titles[document]}</h1>
        <dl className="document-meta">
          <div><dt>{d.version}</dt><dd dir="ltr">{DOCUMENT_VERSION}</dd></div>
        </dl>
        <p className="document-draft">{d.draftNotice}</p>
      </header>
      {sections.map((section) => (
        <section className="document-section" key={section.heading}>
          <h2>{section.heading}</h2>
          {section.body.map((line) => <p key={line}>{line}</p>)}
        </section>
      ))}
      <section className="document-section document-acceptances no-print">
        {account.status === "signedOut" ? (
          <Link className="button button-outline" href={`/${locale}/account?next=${encodeURIComponent(`/${locale}/agreements/${document === "guest_platform" ? "guest" : "host"}`)}`}><LogIn size={16} /> {t.menuLogin}</Link>
        ) : acceptedOn ? (
          <p className="owner-feedback owner-feedback-success"><CheckCircle2 size={16} /> {d.acceptedBy(t.navAccount, timeFormat.format(new Date(acceptedOn)))}</p>
        ) : account.status === "signedIn" ? (
          <button className="button button-primary" type="button" disabled={busy} onClick={() => void accept()}><CheckCircle2 size={16} /> {d.acceptButton}</button>
        ) : null}
        {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
      </section>
      <footer className="document-foot"><p>{d.notSignatureNotice}</p></footer>
    </article>
  );
}
