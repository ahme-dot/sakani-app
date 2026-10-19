"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { Eye, EyeOff, Info, KeyRound, LoaderCircle, LogOut, Mail, UserRound } from "lucide-react";
import AuthLayout from "@/components/auth-layout";
import Captcha, { CAPTCHA_SITE_KEY } from "@/components/captcha";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Mode = "login" | "signup" | "reset";
const TRANSFER_KEY = "sakani-listing-transfer";

function readTransferToken() {
  try {
    return window.localStorage.getItem(TRANSFER_KEY);
  } catch {
    return null;
  }
}

function writeTransferToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TRANSFER_KEY, token);
    else window.localStorage.removeItem(TRANSFER_KEY);
  } catch {
    // Storage can be unavailable (private mode); the transfer is then skipped.
  }
}

/** Moves listings created in an earlier guest session into the signed-in account. Returns how many moved. */
async function claimGuestListings(supabase: SupabaseClient) {
  const token = readTransferToken();
  if (!token) return 0;
  const { data, error } = await supabase.rpc("claim_listing_transfer", { transfer_token: token });
  if (error) {
    console.error("Could not move guest listings to the account:", error);
    return 0;
  }
  writeTransferToken(null);
  return typeof data === "number" ? data : 0;
}

export default function OwnerAccount({ locale, initialMode = "login" }: { locale: SiteLocale; initialMode?: "login" | "signup" }) {
  const t = SITE_COPY[locale];
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(Boolean(supabase));
  const [guestListingCount, setGuestListingCount] = useState(0);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    void supabase.auth.getSession().then(async ({ data }) => {
      const current = data.session?.user ?? null;
      if (!mounted) return;
      setUser(current);

      if (current?.is_anonymous) {
        const { count } = await supabase.from("properties").select("id", { count: "exact", head: true }).eq("owner_id", current.id);
        if (mounted) setGuestListingCount(count ?? 0);
      } else if (current) {
        // Finishes a transfer that was started before an email confirmation step.
        const moved = await claimGuestListings(supabase);
        if (mounted && moved > 0) setNotice(t.accountTransferred(moved));
      }
      if (mounted) setChecking(false);
    });

    return () => {
      mounted = false;
    };
  }, [supabase, t]);

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setNotice("");
  }

  async function finishSignedIn(client: SupabaseClient) {
    await claimGuestListings(client);
    router.replace(`/${locale}#owner`);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setError(t.ownerSetupNeeded);
      return;
    }
    const cleanEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError(t.adminInvalidEmail);
      return;
    }
    if (mode === "signup" && !fullName.trim()) {
      setError(t.accountNameRequired);
      return;
    }
    if (mode !== "reset" && password.length < (mode === "signup" ? 8 : 1)) {
      setError(mode === "signup" ? t.accountWeakPassword : t.adminPasswordRequired);
      return;
    }
    if (CAPTCHA_SITE_KEY && !captchaToken) {
      setError(t.captchaRequired);
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");
    const captcha = captchaToken ? { captchaToken } : {};

    try {
      if (mode === "reset") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/${locale}/update-password?next=account`,
          ...captcha,
        });
        if (resetError) {
          console.error("Could not send password reset email:", resetError);
          setError(resetError.status === 429 ? t.adminResetRateLimit : t.adminResetError);
        } else {
          setNotice(t.adminResetSent);
        }
        return;
      }

      // Remember a guest's listings before the session switches to the real account.
      if (user?.is_anonymous) {
        const { data: token, error: transferError } = await supabase.rpc("create_listing_transfer");
        if (transferError) console.error("Could not prepare guest listing transfer:", transferError);
        else if (typeof token === "string") writeTransferToken(token);
      }

      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { full_name: fullName.trim() }, emailRedirectTo: `${window.location.origin}/${locale}/account`, ...captcha },
        });
        if (signUpError) {
          console.error("Could not create account:", signUpError);
          setError(
            signUpError.code === "user_already_exists" || signUpError.code === "email_exists"
              ? t.accountExists
              : signUpError.code === "weak_password"
                ? t.accountWeakPassword
                : signUpError.status === 429
                  ? t.adminSignInRateLimit
                  : t.accountSignupError,
          );
          return;
        }
        // An empty identities list means the email is already registered (Supabase hides this to prevent probing).
        if (data.user && data.user.identities?.length === 0) {
          setError(t.accountExists);
          return;
        }
        if (!data.session) {
          setNotice(t.accountCheckEmail);
          return;
        }
        await finishSignedIn(supabase);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password, options: captcha });
      if (signInError) {
        console.error("Could not log in:", signInError);
        setError(
          signInError.status === 429
            ? t.adminSignInRateLimit
            : signInError.code === "email_not_confirmed"
              ? t.adminEmailNotConfirmed
              : t.adminSignInError,
        );
        return;
      }
      await finishSignedIn(supabase);
    } catch (unexpected) {
      console.error("Unexpected account error:", unexpected);
      setError(t.adminSignInNetworkError);
    } finally {
      setCaptchaReset((value) => value + 1);
      setSubmitting(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setMode("login");
  }

  if (checking) {
    return (
      <AuthLayout locale={locale} variant="owner">
        <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>
      </AuthLayout>
    );
  }

  if (user && !user.is_anonymous) {
    return (
      <AuthLayout locale={locale} variant="owner">
        <span className="auth-icon"><UserRound size={20} /></span>
        <h1>{(user.user_metadata?.full_name as string | undefined) || t.navAccount}</h1>
        <p className="auth-lead">{t.accountSignedInAs(user.email ?? "")}</p>
        {notice && <p className="auth-message is-success" role="status">{notice}</p>}
        <Link className="auth-submit auth-spaced" href={`/${locale}#owner`}>{t.accountGoToListings}</Link>
        <button className="auth-link auth-switch" type="button" onClick={() => void signOut()}><LogOut size={14} /> {t.accountSignOut}</button>
      </AuthLayout>
    );
  }

  const isSignup = mode === "signup";
  const submitLabel = mode === "reset"
    ? (submitting ? t.adminResetSending : t.adminResetSend)
    : isSignup
      ? (submitting ? t.creatingAccount : t.createAccount)
      : (submitting ? t.signingIn : t.logIn);

  return (
    <AuthLayout locale={locale} variant="owner">
      {mode !== "reset" && (
        <div className="auth-tabs" role="tablist" aria-label={t.navAccount}>
          <button type="button" role="tab" aria-selected={!isSignup} className={!isSignup ? "is-active" : ""} onClick={() => switchMode("login")}>{t.accountTabLogin}</button>
          <button type="button" role="tab" aria-selected={isSignup} className={isSignup ? "is-active" : ""} onClick={() => switchMode("signup")}>{t.accountTabSignup}</button>
        </div>
      )}

      <h1>{mode === "reset" ? t.adminForgotPassword : isSignup ? t.accountTitleSignup : t.accountTitleLogin}</h1>
      <p className="auth-lead">{mode === "reset" ? t.authResetIntro : isSignup ? t.accountLeadSignup : t.accountLeadLogin}</p>

      {guestListingCount > 0 && mode !== "reset" && (
        <p className="auth-message is-info"><Info size={16} /> {t.accountGuestListings(guestListingCount)}</p>
      )}

      <form className="auth-form" noValidate onSubmit={handleSubmit}>
        {isSignup && (
          <label className="auth-field">
            <span>{t.fullName}</span>
            <span className="auth-input">
              <UserRound size={17} aria-hidden="true" />
              <input name="name" autoComplete="name" value={fullName} onChange={(event) => { setFullName(event.target.value); setError(""); }} required />
            </span>
          </label>
        )}

        <label className="auth-field">
          <span>{t.email}</span>
          <span className="auth-input">
            <Mail size={17} aria-hidden="true" />
            <input name="email" type="email" autoComplete="email" dir="ltr" placeholder="name@example.com" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} required />
          </span>
        </label>

        {mode !== "reset" && (
          <label className="auth-field">
            <span className="auth-field-row">
              {t.password}
              {!isSignup && <button className="auth-link" type="button" onClick={() => switchMode("reset")}>{t.adminForgotPassword}</button>}
            </span>
            <span className="auth-input">
              <KeyRound size={17} aria-hidden="true" />
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={isSignup ? "new-password" : "current-password"}
                dir="ltr"
                minLength={isSignup ? 8 : undefined}
                value={password}
                onChange={(event) => { setPassword(event.target.value); setError(""); }}
                required
              />
              <button className="auth-reveal" type="button" aria-label={showPassword ? t.hidePassword : t.showPassword} title={showPassword ? t.hidePassword : t.showPassword} onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
            {isSignup && <small className="auth-hint">{t.passwordHint}</small>}
          </label>
        )}

        <Captcha locale={locale} onToken={setCaptchaToken} resetKey={captchaReset} />
        {error && <p className="auth-message is-error" role="alert">{error}</p>}
        {notice && <p className="auth-message is-success" role="status">{notice}</p>}

        <button className="auth-submit" type="submit" disabled={submitting} aria-live="polite">
          {submitting && <LoaderCircle className="spinner" size={18} />}
          {submitLabel}
        </button>
      </form>

      {mode === "reset" && <button className="auth-link auth-switch" type="button" onClick={() => switchMode("login")}>{t.adminBackToSignIn}</button>}
    </AuthLayout>
  );
}
