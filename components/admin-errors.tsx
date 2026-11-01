"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, LoaderCircle, Trash2 } from "lucide-react";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type ErrorReport = { id: number; at: string; page: string; message: string; detail: string; user_agent: string };

/** Admin: errors visitors' browsers ran into (repeats within 10 minutes are counted once). */
export default function AdminErrors({ locale, supabase }: { locale: SiteLocale; supabase: SupabaseClient }) {
  const t = SITE_COPY[locale];
  const timeFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "medium", timeStyle: "short" });
  const [reports, setReports] = useState<ErrorReport[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    void supabase.from("client_errors").select("id,at,page,message,detail,user_agent").order("at", { ascending: false }).limit(200).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error("Could not load error reports:", error);
        setFailed(true);
        return;
      }
      setReports((data ?? []) as ErrorReport[]);
    });
    return () => {
      active = false;
    };
  }, [supabase, version]);

  async function clearAll() {
    const { error } = await supabase.from("client_errors").delete().gt("id", 0);
    if (error) console.error("Could not clear error reports:", error);
    setVersion((value) => value + 1);
  }

  if (failed) return <p className="owner-feedback owner-feedback-error">{t.errorsLoadError}</p>;
  if (reports === null) return <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>;
  if (reports.length === 0) return <section className="admin-empty-state"><CheckCircle2 size={26} /><p>{t.errorsEmpty}</p></section>;

  return (
    <section className="admin-errors">
      <button className="admin-btn admin-btn-danger-outline" type="button" onClick={() => void clearAll()}><Trash2 size={15} /> {t.errorsClear}</button>
      <ul>
        {reports.map((report) => (
          <li key={report.id}>
            <strong dir="ltr">{report.message}</strong>
            <small>{timeFormat.format(new Date(report.at))} · <span dir="ltr">{report.page}</span></small>
            {report.detail && <details><summary>{t.errorsDetails}</summary><pre dir="ltr">{report.detail}</pre><small dir="ltr">{report.user_agent}</small></details>}
          </li>
        ))}
      </ul>
    </section>
  );
}
