"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, LockKeyhole, LoaderCircle } from "lucide-react";
import AuthLayout from "@/components/auth-layout";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ResetState = "checking" | "ready" | "invalid";

export default function AdminPasswordReset({ locale }: { locale: SiteLocale }) {
  const t = SITE_COPY[locale];
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [state, setState] = useState<ResetState>(supabase ? "checking" : "invalid");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    // Owners reach this page from the account page (?next=account); admins from the admin sign-in.
    const forOwner = new URLSearchParams(window.location.search).get("next") === "account";
    router.replace(forOwner ? `/${locale}/host` : `/${locale}/admin`);
  }

  return (
    <AuthLayout locale={locale}>
      <span className="auth-icon"><LockKeyhole size={20} /></span>
      <h1>{t.adminResetTitle}</h1>
      {state === "checking" ? (
        <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.adminResetChecking}</div>
      ) : state === "invalid" ? (
        <>
          <p className="auth-lead">{t.adminResetInvalid}</p>
          {error && <p className="auth-message is-error" role="alert">{error}</p>}
          <Link className="auth-submit" href={`/${locale}/sign-in`}>{t.signIn}</Link>
        </>
      ) : (
        <>
          <p className="auth-lead">{t.adminResetDescription}</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>{t.adminNewPassword}</span>
              <span className="auth-input">
                <KeyRound size={17} aria-hidden="true" />
                <input type={showPassword ? "text" : "password"} autoComplete="new-password" dir="ltr" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
                <button className="auth-reveal" type="button" aria-label={showPassword ? t.hidePassword : t.showPassword} title={showPassword ? t.hidePassword : t.showPassword} onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
            {error && <p className="auth-message is-error" role="alert">{error}</p>}
            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? t.adminResetSaving : t.adminResetSave}
            </button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
