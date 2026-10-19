"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import Captcha, { CAPTCHA_SITE_KEY } from "@/components/captcha";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AdminSignIn({ locale }: { locale: SiteLocale }) {
  const t = SITE_COPY[locale];
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);

  function captchaMissing() {
    if (CAPTCHA_SITE_KEY && !captchaToken) {
      setError(t.captchaRequired);
      return true;
    }
    return false;
  }

  async function handlePasswordReset() {
    if (!supabase) {
      setError(t.ownerSetupNeeded);
      return;
    }
    if (!email.trim()) {
      setError(t.adminResetEmailRequired);
      return;
    }
    if (captchaMissing()) return;

    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const redirectTo = `${window.location.origin}/${locale}/update-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
        ...(captchaToken ? { captchaToken } : {}),
      });
      setCaptchaReset((value) => value + 1);
      if (resetError) {
        console.error("Could not request an admin password reset:", resetError);
        setError(resetError.status === 429 ? t.adminResetRateLimit : t.adminResetError);
      } else {
        setNotice(t.adminResetSent);
      }
    } catch (resetError) {
      console.error("Unexpected error while requesting an admin password reset:", resetError);
      setError(t.adminResetError);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resetMode) {
      await handlePasswordReset();
      return;
    }
    const emailInput = event.currentTarget.elements.namedItem("email");
    const passwordInput = event.currentTarget.elements.namedItem("password");
    if (!(emailInput instanceof HTMLInputElement) || !emailInput.validity.valid) {
      setError(t.adminInvalidEmail);
      return;
    }
    if (!(passwordInput instanceof HTMLInputElement) || !passwordInput.value) {
      setError(t.adminPasswordRequired);
      return;
    }
    if (!supabase) {
      setError(t.ownerSetupNeeded);
      return;
    }
    if (captchaMissing()) return;

    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
        ...(captchaToken ? { options: { captchaToken } } : {}),
      });
      setCaptchaReset((value) => value + 1);

      if (signInError) {
        console.error("Could not sign in to the admin dashboard:", signInError);
        setError(
          signInError.status === 429
            ? t.adminSignInRateLimit
            : signInError.code === "email_not_confirmed"
              ? t.adminEmailNotConfirmed
              : t.adminSignInError,
        );
        return;
      }

      const { data: admin, error: adminError } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (adminError) {
        console.error("Could not verify admin access:", adminError);
        setError(t.adminLoadError);
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) console.error("Could not clear non-verified admin session:", signOutError);
        return;
      }

      if (!admin) {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) console.error("Could not sign out non-admin user:", signOutError);
        setError(t.adminAccessDenied);
        return;
      }

      router.replace(`/${locale}/admin`);
    } catch (signInError) {
      console.error("Unexpected error while signing in to the admin dashboard:", signInError);
      setError(t.adminSignInNetworkError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="admin-page" dir={locale === "ar" ? "rtl" : "ltr"}>
      <section className="admin-auth-panel">
        <span className="signin-icon"><LockKeyhole size={20} /></span>
        <span className="section-kicker">{t.adminNav}</span>
        <h1>{t.signInTitle}</h1>
        <p>{t.signInDescription}</p>
        <form className="admin-sign-in-form" noValidate onSubmit={handleSubmit}>
          <label className="owner-field">
            <span>{t.email}</span>
            <input name="email" type="email" autoComplete="username" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} required />
          </label>
          {!resetMode && <label className="owner-field">
            <span>{t.password}</span>
            <input name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} required />
          </label>}
          <Captcha locale={locale} onToken={setCaptchaToken} resetKey={captchaReset} />
          <button className="button button-primary owner-submit" type="submit" disabled={submitting} aria-live="polite">
            {submitting ? (resetMode ? t.adminResetSending : t.signingIn) : (resetMode ? t.adminResetSend : t.signIn)}
          </button>
        </form>
        <div className="admin-auth-links">
          {!resetMode && <button className="admin-text-button" type="button" onClick={() => { setResetMode(true); setError(""); setNotice(""); }}>{t.adminForgotPassword}</button>}
          {resetMode && <button className="admin-text-button" type="button" onClick={() => { setResetMode(false); setError(""); setNotice(""); }}>{t.adminBackToSignIn}</button>}
          <Link className="admin-home-link" href={locale === "ar" ? "/ar" : "/en"}>{t.adminBackHome}</Link>
        </div>
        {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
        {notice && <p className="owner-feedback owner-feedback-success" role="status">{notice}</p>}
      </section>
    </main>
  );
}
