"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockKeyhole, LoaderCircle } from "lucide-react";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ResetState = "checking" | "ready" | "invalid";

export default function AdminPasswordReset({ locale }: { locale: SiteLocale }) {
  const t = SITE_COPY[locale];
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [state, setState] = useState<ResetState>(supabase ? "checking" : "invalid");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    // Supabase reports expired or already-used recovery links in the URL hash instead of creating a session.
    const linkError = new URLSearchParams(window.location.hash.slice(1)).get("error_description");

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" && session) setState("ready");
      else if (!session) setState("invalid");
    });

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (linkError) {
        console.error("The password recovery link was rejected:", linkError);
        setError(linkError);
        setState("invalid");
      } else if (sessionError) {
        console.error("Could not verify the password recovery session:", sessionError);
        setError(t.adminResetInvalid);
        setState("invalid");
      } else if (data.session && !data.session.user.is_anonymous) {
        setState("ready");
      } else {
        setState("invalid");
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase, t.adminResetInvalid]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setSubmitting(true);
    setError("");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      console.error("Could not update the administrator password:", updateError);
      setError(t.adminResetUpdateError);
      setSubmitting(false);
      return;
    }
    router.replace(`/${locale}/admin`);
  }

  return (
    <main className="admin-page" dir={locale === "ar" ? "rtl" : "ltr"}>
      <section className="admin-auth-panel">
        <span className="signin-icon"><LockKeyhole size={20} /></span>
        <span className="section-kicker">{t.adminNav}</span>
        <h1>{t.adminResetTitle}</h1>
        {state === "checking" ? (
          <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.adminResetChecking}</div>
        ) : state === "invalid" ? (
          <>
            <p>{t.adminResetInvalid}</p>
            {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
            <Link className="button button-primary owner-submit" href={`/${locale}/sign-in`}>{t.signIn}</Link>
          </>
        ) : (
          <>
            <p>{t.adminResetDescription}</p>
            <form className="admin-sign-in-form" onSubmit={handleSubmit}>
              <label className="owner-field">
                <span>{t.adminNewPassword}</span>
                <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
              </label>
              <button className="button button-primary owner-submit" type="submit" disabled={submitting}>
                {submitting ? t.adminResetSaving : t.adminResetSave}
              </button>
            </form>
          </>
        )}
        {error && state !== "invalid" && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
        <Link className="admin-home-link" href={locale === "ar" ? "/ar" : "/en"}>{t.adminBackHome}</Link>
      </section>
    </main>
  );
}
