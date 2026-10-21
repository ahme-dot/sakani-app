"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { LoaderCircle, MailCheck, ShieldCheck, UserPlus } from "lucide-react";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type TeamMember = {
  user_id: string;
  email: string;
  added_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
};

/**
 * Creates the Auth account for a new admin without touching the current admin's session:
 * a throwaway client with no persisted session signs the new account up with a random password.
 * The new admin then sets their own password with "Forgot your password?".
 */
async function createAccount(email: string, redirectTo: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return new Error("Supabase is not configured");

  const isolated = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "sakani-admin-invite" },
  });
  const randomPassword = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const { error } = await isolated.auth.signUp({ email, password: randomPassword, options: { emailRedirectTo: redirectTo } });
  return error;
}

export default function AdminTeam({ locale, supabase, currentUserId }: { locale: SiteLocale; supabase: SupabaseClient; currentUserId: string }) {
  const t = SITE_COPY[locale];
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "medium" });

  useEffect(() => {
    let mounted = true;
    void supabase.rpc("admin_team").then(({ data, error: loadError }) => {
      if (!mounted) return;
      if (loadError) {
        console.error("Could not load the admin team:", loadError);
        setError(t.teamLoadError);
      } else {
        setMembers((data ?? []) as TeamMember[]);
      }
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [supabase, reloadKey, t.teamLoadError]);

  function reload() {
    setLoading(true);
    setReloadKey((value) => value + 1);
  }

  async function addAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = email.trim().toLowerCase();
    if (!target) return;
    setBusy(true);
    setMessage("");
    setError("");

    let { data: result, error: addError } = await supabase.rpc("admin_team_add", { target_email: target });
    let invited = false;

    if (!addError && result === "not_found") {
      const signUpError = await createAccount(target, `${window.location.origin}/${locale}/sign-in`);
      if (signUpError) {
        console.error("Could not create the new admin's account:", signUpError);
        setError(t.teamInviteError);
        setBusy(false);
        return;
      }
      invited = true;
      ({ data: result, error: addError } = await supabase.rpc("admin_team_add", { target_email: target }));
    }

    if (addError || (result !== "added" && result !== "already_admin")) {
      console.error("Could not add admin:", addError ?? result);
      setError(t.teamError);
    } else if (result === "already_admin") {
      setMessage(t.teamAlreadyAdmin(target));
    } else {
      setMessage(invited ? t.teamInvited(target) : t.teamAddedMessage(target));
      setEmail("");
      reload();
    }
    setBusy(false);
  }

  async function removeAdmin(member: TeamMember) {
    setBusy(true);
    setMessage("");
    setError("");
    const { data: result, error: removeError } = await supabase.rpc("admin_team_remove", { target_user_id: member.user_id });
    if (removeError || (result !== "removed" && result !== "not_admin_member")) {
      console.error("Could not remove admin:", removeError ?? result);
      setError(result === "cannot_remove_self" ? t.teamCannotRemoveSelf : t.teamError);
    } else {
      setMessage(t.teamRemovedMessage(member.email));
      reload();
    }
    setConfirmingRemoveId(null);
    setBusy(false);
  }

  return (
    <section className="admin-team" aria-label={t.teamTitle}>
      <h2 className="admin-section-title"><UserPlus size={17} /> {t.teamAddButton}</h2>
      <form className="admin-team-add" onSubmit={addAdmin}>
        <label className="owner-field">
          <span>{t.teamAddLabel}</span>
          <input type="email" required autoComplete="off" dir="ltr" value={email} placeholder="name@example.com" onChange={(event) => setEmail(event.target.value)} />
        </label>
        <button className="admin-btn admin-btn-primary" type="submit" disabled={busy}>
          {busy ? t.sending : t.teamAddButton}
        </button>
      </form>
      <p className="field-hint admin-team-hint">{t.teamAddHint}</p>

      {message && <p className="owner-feedback owner-feedback-success" role="status">{message}</p>}
      {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}

      <h2 className="admin-section-title admin-team-list-title"><ShieldCheck size={17} /> {t.teamMembers(members.length)}</h2>
      {loading ? (
        <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>
      ) : (
        <ul className="admin-team-list">
          {members.map((member) => {
            const isSelf = member.user_id === currentUserId;
            return (
              <li key={member.user_id}>
                <div className="admin-team-member">
                  <strong dir="ltr">{member.email}</strong>
                  {isSelf && <span className="listing-status listing-status-approved">{t.teamYou}</span>}
                  {!member.email_confirmed && <span className="listing-status"><MailCheck size={12} /> {t.teamUnconfirmed}</span>}
                  <small>
                    {t.teamAddedOn}: {dateFormat.format(new Date(member.added_at))} · {t.teamLastSignIn}: {member.last_sign_in_at ? dateFormat.format(new Date(member.last_sign_in_at)) : t.teamNeverSignedIn}
                  </small>
                </div>
                {!isSelf && (
                  confirmingRemoveId === member.user_id ? (
                    <div className="admin-team-actions">
                      <button className="owner-text-button is-danger" type="button" disabled={busy} onClick={() => void removeAdmin(member)}>{t.teamConfirmRemove}</button>
                      <button className="owner-text-button" type="button" disabled={busy} onClick={() => setConfirmingRemoveId(null)}>{t.cancel}</button>
                    </div>
                  ) : (
                    <button className="owner-text-button is-danger" type="button" disabled={busy} onClick={() => setConfirmingRemoveId(member.user_id)}>{t.teamRemove}</button>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
