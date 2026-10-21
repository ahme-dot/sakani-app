"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Inbox, LoaderCircle, Mail, Phone } from "lucide-react";
import { whatsappLink } from "@/lib/site";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type ContactMessage = {
  id: string;
  name: string | null;
  contact: string;
  topic: "student" | "owner" | "other";
  message: string;
  locale: SiteLocale;
  status: "open" | "closed";
  created_at: string;
};

export default function AdminInbox({
  locale,
  supabase,
  currentUserId,
  onChanged,
}: {
  locale: SiteLocale;
  supabase: SupabaseClient;
  currentUserId: string;
  onChanged: () => void;
}) {
  const t = SITE_COPY[locale];
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "medium", timeStyle: "short" });
  const topicLabels = { student: t.contactTopicStudent, owner: t.contactTopicOwner, other: t.contactTopicOther };

  useEffect(() => {
    let mounted = true;
    void supabase
      .from("contact_messages")
      .select("id,name,contact,topic,message,locale,status,created_at")
      .eq("status", tab)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error: loadError }) => {
        if (!mounted) return;
        if (loadError) {
          console.error("Could not load messages:", loadError);
          setError(t.inboxLoadError);
          setMessages([]);
        } else {
          setError("");
          setMessages((data ?? []) as ContactMessage[]);
        }
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [supabase, tab, t.inboxLoadError]);

  async function setStatus(message: ContactMessage, status: ContactMessage["status"]) {
    setBusyId(message.id);
    setError("");
    const closing = status === "closed";
    const { data, error: updateError } = await supabase
      .from("contact_messages")
      .update({ status, closed_at: closing ? new Date().toISOString() : null, closed_by: closing ? currentUserId : null })
      .eq("id", message.id)
      .select("id");
    if (updateError || !data?.length) {
      console.error("Could not update message:", updateError ?? "no rows were updated");
      setError(t.adminUpdateError);
    } else {
      setMessages((current) => current.filter((item) => item.id !== message.id));
      onChanged();
    }
    setBusyId(null);
  }

  function selectTab(next: "open" | "closed") {
    if (next === tab) return;
    setLoading(true);
    setTab(next);
  }

  return (
    <section aria-label={t.inboxTitle}>
      <div className="admin-users-toolbar">
        <div className="admin-segment" role="tablist" aria-label={t.inboxTitle}>
          <button type="button" role="tab" aria-selected={tab === "open"} className={tab === "open" ? "is-active" : ""} onClick={() => selectTab("open")}>{t.reportsOpen}</button>
          <button type="button" role="tab" aria-selected={tab === "closed"} className={tab === "closed" ? "is-active" : ""} onClick={() => selectTab("closed")}>{t.reportsClosed}</button>
        </div>
      </div>

      {error && <p className="owner-feedback owner-feedback-error admin-feedback" role="alert">{error}</p>}

      {loading ? (
        <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>
      ) : messages.length === 0 ? (
        <section className="admin-empty-state"><Inbox size={26} /><p>{t.inboxEmpty}</p></section>
      ) : (
        <div className="admin-report-list">
          {messages.map((item) => {
            const isEmail = item.contact.includes("@");
            const busy = busyId === item.id;
            return (
              <article className="admin-message" key={item.id}>
                <div className="admin-report-top">
                  <span className="report-reason">{topicLabels[item.topic]}</span>
                  <time dateTime={item.created_at}>{dateFormat.format(new Date(item.created_at))}</time>
                </div>
                <h3>{item.name || t.noName}</h3>
                <p className="admin-report-details">{item.message}</p>
                <p className="admin-message-contact">
                  {isEmail ? (
                    <a href={`mailto:${item.contact}`} dir="ltr"><Mail size={14} /> {item.contact}</a>
                  ) : (
                    <a href={whatsappLink(item.contact)} target="_blank" rel="noreferrer" dir="ltr"><Phone size={14} /> {item.contact}</a>
                  )}
                </p>
                <div className="admin-card-actions">
                  {item.status === "open" ? (
                    <button className="admin-btn admin-btn-primary" type="button" disabled={busy} onClick={() => void setStatus(item, "closed")}>{busy ? t.sending : t.inboxMarkDone}</button>
                  ) : (
                    <button className="admin-btn admin-btn-ghost" type="button" disabled={busy} onClick={() => void setStatus(item, "open")}>{t.reportReopen}</button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
