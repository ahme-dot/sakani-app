"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FlaskConical, LoaderCircle, Trash2 } from "lucide-react";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

const DEMO_COUNT = 2000;

/** Admin: add 2000 demo listings to preview the site full of places, and remove them all in one click before launch. */
export default function AdminDemo({ locale, supabase, onChanged }: { locale: SiteLocale; supabase: SupabaseClient; onChanged: () => void }) {
  const t = SITE_COPY[locale];
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG");
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState<"seed" | "clear" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.from("properties").select("id", { count: "exact", head: true }).eq("is_demo", true).then(({ count: demoCount, error: countError }) => {
      if (!active) return;
      if (countError) console.error("Could not count demo listings:", countError);
      setCount(countError ? 0 : demoCount ?? 0);
    });
    return () => {
      active = false;
    };
  }, [supabase, version]);

  async function seed() {
    setBusy("seed");
    setError("");
    setMessage("");
    const { data, error: seedError } = await supabase.rpc("admin_seed_demo", { how_many: DEMO_COUNT });
    setBusy(null);
    if (seedError) {
      console.error("Could not add demo listings:", seedError);
      setError(t.adminUpdateError);
      return;
    }
    setMessage(t.demoAdded(numberFormat.format(Number(data ?? 0))));
    setVersion((value) => value + 1);
    onChanged();
  }

  async function clear() {
    setBusy("clear");
    setError("");
    setMessage("");
    const { data, error: clearError } = await supabase.rpc("admin_clear_demo");
    setBusy(null);
    setConfirmClear(false);
    if (clearError) {
      console.error("Could not remove demo listings:", clearError);
      setError(t.adminUpdateError);
      return;
    }
    setMessage(t.demoRemoved(numberFormat.format(Number(data ?? 0))));
    setVersion((value) => value + 1);
    onChanged();
  }

  return (
    <section className="admin-demo">
      <div className="admin-demo-card">
        <FlaskConical size={28} />
        <div>
          <strong>{count === null ? t.loading : t.demoCountLine(numberFormat.format(count))}</strong>
          <p>{t.demoExplain}</p>
        </div>
      </div>
      {message && <p className="owner-feedback owner-feedback-success admin-feedback" role="status">{message}</p>}
      {error && <p className="owner-feedback owner-feedback-error admin-feedback" role="alert">{error}</p>}
      <div className="admin-card-actions">
        <button className="admin-btn admin-btn-primary" type="button" disabled={busy !== null} onClick={() => void seed()}>
          {busy === "seed" ? <LoaderCircle className="spinner" size={15} /> : <FlaskConical size={15} />} {t.demoSeedButton(numberFormat.format(DEMO_COUNT))}
        </button>
        {confirmClear ? (
          <>
            <button className="admin-btn admin-btn-danger" type="button" disabled={busy !== null} onClick={() => void clear()}>
              {busy === "clear" ? <LoaderCircle className="spinner" size={15} /> : <Trash2 size={15} />} {t.demoClearConfirm}
            </button>
            <button className="admin-btn admin-btn-ghost" type="button" onClick={() => setConfirmClear(false)}>{t.cancel}</button>
          </>
        ) : (
          <button className="admin-btn admin-btn-danger-outline" type="button" disabled={busy !== null || !count} onClick={() => setConfirmClear(true)}>
            <Trash2 size={15} /> {t.demoClearButton}
          </button>
        )}
      </div>
    </section>
  );
}
