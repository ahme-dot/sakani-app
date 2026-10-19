"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import AuthLayout from "@/components/auth-layout";
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
  const [showPassword, setShowPassword] = useState(false);
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

  function switchMode(nextResetMode: boolean) {
    setResetMode(nextResetMode);
    setError("");
    setNotice("");
  }

  return (
    <AuthLayout locale={locale}>
      <span className="auth-icon"><LockKeyhole size={20} /></span>
      <h1>{resetMode ? t.adminForgotPassword : t.signInTitle}</h1>
      <p className="auth-lead">{resetMode ? t.authResetIntro : t.signInDescription}</p>

      <form className="auth-form" noValidate onSubmit={handleSubmit}>
        <label className="auth-field">
          <span>{t.email}</span>
          <span className="auth-input">
            <Mail size={17} aria-hidden="true" />
            <input name="email" type="email" autoComplete="username" dir="ltr" placeholder="name@example.com" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} required />
          </span>
        </label>

        {!resetMode && (
          <label className="auth-field">
            <span className="auth-field-row">
              {t.password}
              <button className="auth-link" type="button" onClick={() => switchMode(true)}>{t.adminForgotPassword}</button>
            </span>
            <span className="auth-input">
              <KeyRound size={17} aria-hidden="true" />
              <input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" dir="ltr" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} required />
              <button className="auth-reveal" type="button" aria-label={showPassword ? t.hidePassword : t.showPassword} title={showPassword ? t.hidePassword : t.showPassword} onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>
        )}

        <Captcha locale={locale} onToken={setCaptchaToken} resetKey={captchaReset} />
        {error && <p className="auth-message is-error" role="alert">{error}</p>}
        {notice && <p className="auth-message is-success" role="status">{notice}</p>}

        <button className="auth-submit" type="submit" disabled={submitting} aria-live="polite">
          {submitting ? <LoaderCircle className="spinner" size={18} /> : null}
          {submitting ? (resetMode ? t.adminResetSending : t.signingIn) : (resetMode ? t.adminResetSend : t.signIn)}
        </button>
      </form>

      {resetMode && <button className="auth-link auth-switch" type="button" onClick={() => switchMode(false)}>{t.adminBackToSignIn}</button>}
    </AuthLayout>
  );
}
