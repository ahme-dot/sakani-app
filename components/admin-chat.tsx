"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, ArrowRight, LoaderCircle, MessagesSquare } from "lucide-react";
import SupportChat, { type ChatContext } from "@/components/support-chat";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type Thread = { id: string; user_id: string; last_message_at: string; team_last_read: string };
type Person = { id: string; full_name: string; role: "host" | "guest" };

type Props = {
  locale: SiteLocale;
  supabase: SupabaseClient;
  /** Open this user's conversation (e.g. "Chat with host" on a booking). */
  openUserId?: string | null;
  /** The booking the conversation is about, attached to the next message. */
  openBookingId?: string | null;
  onChanged: () => void;
};

/** Admin: every conversation with guests and hosts, newest first; unread ones are marked. */
export default function AdminChat({ locale, supabase, openUserId = null, openBookingId = null, onChanged }: Props) {
  const t = SITE_COPY[locale];
  const timeFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "short", timeStyle: "short" });
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [context, setContext] = useState<ChatContext | null>(null);
  const [version, setVersion] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      // Opening a user's conversation from a booking makes it if it doesn't exist yet.
      if (openUserId) {
        const { data: threadId } = await supabase.rpc("team_thread_for", { target_user: openUserId });
        if (active && typeof threadId === "string") setSelected(threadId);
        if (openBookingId) {
          const { data: booking } = await supabase.from("listing_requests").select("listing_id,listing_title").eq("id", openBookingId).maybeSingle();
          if (active && booking) setContext({ bookingId: openBookingId, listingId: booking.listing_id as string | null, label: booking.listing_title as string });
        }
      }
      const { data, error } = await supabase.from("support_threads").select("id,user_id,last_message_at,team_last_read").order("last_message_at", { ascending: false }).limit(300);
      if (!active) return;
      if (error) {
        console.error("Could not load conversations:", error);
        setFailed(true);
        return;
      }
      const rows = (data ?? []) as Thread[];
      setThreads(rows);
      const ids = rows.map((row) => row.user_id);
      if (ids.length) {
        const { data: profiles } = await supabase.from("profiles").select("id,full_name,role").in("id", ids);
        if (active) setPeople(Object.fromEntries(((profiles ?? []) as Person[]).map((person) => [person.id, person])));
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase, openUserId, openBookingId, version]);

  if (failed) return <p className="owner-feedback owner-feedback-error">{t.chatLoadError}</p>;
  if (threads === null) return <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>;

  const current = threads.find((thread) => thread.id === selected);
  const person = current ? people[current.user_id] : undefined;
  const Back = locale === "ar" ? ArrowRight : ArrowLeft;

  return (
    <div className={`admin-chat${selected ? " has-selection" : ""}`}>
      <ul className="admin-chat-threads" aria-label={t.adminViewChat}>
        {threads.length === 0 && <li className="chat-empty"><MessagesSquare size={20} /> {t.chatNoThreads}</li>}
        {threads.map((thread) => {
          const who = people[thread.user_id];
          const unread = new Date(thread.last_message_at) > new Date(thread.team_last_read);
          return (
            <li key={thread.id}>
              <button
                type="button"
                className={`admin-chat-thread${thread.id === selected ? " is-active" : ""}${unread ? " is-unread" : ""}`}
                onClick={() => {
                  setSelected(thread.id);
                  setContext(null);
                  window.setTimeout(() => {
                    setVersion((value) => value + 1);
                    onChanged();
                  }, 1500);
                }}
              >
                <strong>{who?.full_name || t.noName}</strong>
                <span className={`role-chip is-${who?.role ?? "guest"}`}>{who?.role === "host" ? t.roleHost : t.roleGuest}</span>
                <small>{timeFormat.format(new Date(thread.last_message_at))}</small>
              </button>
            </li>
          );
        })}
      </ul>
      <section className="admin-chat-pane">
        {selected ? (
          <>
            <header className="admin-chat-head">
              <button className="text-button admin-chat-back" type="button" onClick={() => setSelected(null)}><Back size={16} /> {t.formBack}</button>
              <strong>{person?.full_name || t.noName}</strong>
              {person && <span className={`role-chip is-${person.role}`}>{person.role === "host" ? t.roleHost : t.roleGuest}</span>}
            </header>
            <SupportChat key={selected} locale={locale} supabase={supabase} threadId={selected} asTeam context={context} onContextClear={() => setContext(null)} />
          </>
        ) : (
          <p className="chat-empty"><MessagesSquare size={20} /> {t.chatPickThread}</p>
        )}
      </section>
    </div>
  );
}
