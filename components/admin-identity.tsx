"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, Eye, IdCard, LoaderCircle, X } from "lucide-react";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type Check = { id: string; user_id: string; file_path: string; status: "pending" | "approved" | "rejected"; created_at: string };
type Person = { id: string; full_name: string; role: string };

const BUCKET = "sakani-identity";

/** Admin: identity documents waiting for review. The files are private; each view uses a link that expires after a minute. */
export default function AdminIdentity({ locale, supabase }: { locale: SiteLocale; supabase: SupabaseClient }) {
  const t = SITE_COPY[locale];
  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "medium", timeStyle: "short" });
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [version, setVersion] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.from("identity_verifications").select("id,user_id,file_path,status,created_at").order("created_at", { ascending: false }).limit(100).then(async ({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) {
        console.error("Could not load identity checks:", loadError);
        setError(t.identityLoadError);
        return;
      }
      const rows = (data ?? []) as Check[];
      setChecks(rows);
      const ids = [...new Set(rows.map((row) => row.user_id))];
      if (ids.length) {
        const { data: profiles } = await supabase.from("profiles").select("id,full_name,role").in("id", ids);
        if (active) setPeople(Object.fromEntries(((profiles ?? []) as Person[]).map((person) => [person.id, person])));
      }
    });
    return () => {
      active = false;
    };
  }, [supabase, version, t]);

  async function view(check: Check) {
    const { data, error: urlError } = await supabase.storage.from(BUCKET).createSignedUrl(check.file_path, 60);
    if (urlError || !data) {
      console.error("Could not open the document:", urlError);
      setError(t.identityLoadError);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function review(check: Check, approve: boolean) {
    setBusyId(check.id);
    const { error: reviewError } = await supabase.rpc("admin_review_identity", { target_check: check.id, approve, note: "" });
    setBusyId(null);
    if (reviewError) {
      console.error("Could not review the document:", reviewError);
      setError(t.adminUpdateError);
      return;
    }
    setVersion((value) => value + 1);
  }

  if (!checks) return error ? <p className="owner-feedback owner-feedback-error">{error}</p> : <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>;

  return (
    <section className="admin-identity">
      {error && <p className="owner-feedback owner-feedback-error admin-feedback" role="alert">{error}</p>}
      {checks.length === 0 ? (
        <section className="admin-empty-state"><IdCard size={26} /><p>{t.identityEmpty}</p></section>
      ) : (
        <ul className="profile-list">
          {checks.map((check) => (
            <li key={check.id}>
              <div>
                <strong>{people[check.user_id]?.full_name || t.noName}</strong>
                <small>{dateFormat.format(new Date(check.created_at))}</small>
              </div>
              <span className={`status-chip is-${check.status === "approved" ? "paid" : check.status === "rejected" ? "rejected" : "pending"}`}>{t.identityStatus[check.status]}</span>
              <span className="profile-row-actions">
                <button className="admin-btn admin-btn-ghost" type="button" onClick={() => void view(check)}><Eye size={15} /> {t.identityView}</button>
                {check.status === "pending" && (
                  <>
                    <button className="admin-btn admin-btn-primary" type="button" disabled={busyId === check.id} onClick={() => void review(check, true)}><Check size={15} /> {t.identityApprove}</button>
                    <button className="admin-btn admin-btn-ghost" type="button" disabled={busyId === check.id} onClick={() => void review(check, false)}><X size={15} /> {t.identityReject}</button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
