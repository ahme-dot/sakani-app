"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { CopyValue } from "@/components/owner-payments";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

export type MfaStatus = { enrolled: boolean; passed: boolean; factorId: string | null };

/** Where this admin stands: has an authenticator app been set up, and has this session passed it? */
export async function loadMfaStatus(supabase: SupabaseClient): Promise<MfaStatus> {
  const [{ data: level }, { data: factors }] = await Promise.all([supabase.auth.mfa.getAuthenticatorAssuranceLevel(), supabase.auth.mfa.listFactors()]);
  const verified = factors?.totp?.[0] ?? null;
  return { enrolled: Boolean(verified), passed: !verified || level?.currentLevel === "aal2", factorId: verified?.id ?? null };
}

/** The 6-digit code from the authenticator app, asked once per sign-in. */
export function AdminMfaChallenge({ locale, supabase, factorId, onPassed }: { locale: SiteLocale; supabase: SupabaseClient; factorId: string; onPassed: () => void }) {
  const t = SITE_COPY[locale];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\D/g, "");
    if (code.length !== 6) {
      setError(t.mfaCodeInvalid);
      return;
    }
    setBusy(true);
    setError("");
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (verifyError) {
      console.error("Could not verify the code:", verifyError);
      setError(t.mfaCodeWrong);
      return;
    }
    onPassed();
  }

  return (
    <section className="admin-auth-panel admin-mfa" aria-labelledby="mfa-title">
      <span className="signin-icon"><ShieldCheck size={20} /></span>
      <h1 id="mfa-title">{t.mfaChallengeTitle}</h1>
      <p>{t.mfaChallengeText}</p>
      <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
        <label className="auth-field">
          <span>{t.mfaCodeLabel}</span>
          <span className="auth-input">
            <KeyRound size={17} aria-hidden="true" />
            <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" autoFocus required />
          </span>
          {error && <small className="field-error" role="alert">{error}</small>}
        </label>
        <button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? t.sending : t.mfaVerify}</button>
      </form>
      <p className="field-hint">{t.mfaLostPhone}</p>
    </section>
  );
}

/** Setting up the authenticator app: scan, type the first code, done. */
export function AdminMfaSetup({ locale, supabase, onDone }: { locale: SiteLocale; supabase: SupabaseClient; onDone: () => void }) {
  const t = SITE_COPY[locale];
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setStarting(true);
    setError("");
    // A half-finished earlier attempt would block a new one.
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const old of existing?.all ?? []) {
      if (old.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: old.id });
    }
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Sakani admin ${new Date().toISOString().slice(0, 10)}` });
    setStarting(false);
    if (enrollError || !data) {
      console.error("Could not start two-step sign-in:", enrollError);
      setError(t.mfaSetupError);
      return;
    }
    setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factor) return;
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\D/g, "");
    if (code.length !== 6) {
      setError(t.mfaCodeInvalid);
      return;
    }
    setBusy(true);
    setError("");
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    setBusy(false);
    if (verifyError) {
      console.error("Could not confirm two-step sign-in:", verifyError);
      setError(t.mfaCodeWrong);
      return;
    }
    onDone();
  }

  return (
    <section className="admin-mfa-setup" aria-labelledby="mfa-setup-title">
      <h2 id="mfa-setup-title" className="admin-section-title"><ShieldCheck size={17} /> {t.mfaSetupTitle}</h2>
      <p className="field-hint">{t.mfaSetupText}</p>
      {!factor ? (
        <button className="admin-btn admin-btn-primary" type="button" disabled={starting} onClick={() => void start()}>
          {starting ? <LoaderCircle className="spinner" size={15} /> : <ShieldCheck size={15} />} {t.mfaSetupStart}
        </button>
      ) : (
        <form className="admin-mfa-steps" onSubmit={(event) => void confirm(event)} noValidate>
          <ol>
            <li>{t.mfaStepApp}</li>
            <li>
              {t.mfaStepScan}
              {/* eslint-disable-next-line @next/next/no-img-element -- the QR code is an inline data image from Supabase */}
              <img className="admin-mfa-qr" src={factor.qr} alt={t.mfaQrAlt} width={180} height={180} />
              <CopyValue label={t.mfaSecretLabel} value={factor.secret} copyLabel={t.copy} copiedLabel={t.copied} />
              <small className="field-hint">{t.mfaSecretHint}</small>
            </li>
            <li>
              <label className="owner-field">
                <span>{t.mfaStepCode}</span>
                <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" required />
              </label>
            </li>
          </ol>
          <button className="admin-btn admin-btn-primary" type="submit" disabled={busy}>{busy ? t.sending : t.mfaSetupFinish}</button>
        </form>
      )}
      {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
    </section>
  );
}

/** The current admin's two-step status, with setup when it isn't on yet. */
export default function AdminMfaPanel({ locale, supabase, onChanged }: { locale: SiteLocale; supabase: SupabaseClient; onChanged?: () => void }) {
  const t = SITE_COPY[locale];
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    void loadMfaStatus(supabase).then((loaded) => {
      if (active) setStatus(loaded);
    });
    return () => {
      active = false;
    };
  }, [supabase, version]);

  if (!status) return <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>;
  if (status.enrolled) {
    return (
      <section className="admin-mfa-setup is-on">
        <h2 className="admin-section-title"><ShieldCheck size={17} /> {t.mfaOnTitle}</h2>
        <p className="field-hint">{t.mfaOnText}</p>
      </section>
    );
  }
  return (
    <AdminMfaSetup
      locale={locale}
      supabase={supabase}
      onDone={() => {
        setVersion((value) => value + 1);
        onChanged?.();
      }}
    />
  );
}
