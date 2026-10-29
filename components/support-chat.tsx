"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Headset, House, LoaderCircle, Send, X } from "lucide-react";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

export type SupportMessage = {
  id: string;
  thread_id: string;
  sender_id: string | null;
  from_team: boolean;
  body: string;
  booking_id: string | null;
  listing_id: string | null;
  created_at: string;
};

/** What a new message is about (a listing or a booking), shown above the box and saved with the message. */
export type ChatContext = { listingId?: string | null; bookingId?: string | null; label: string };

const MESSAGE_COLUMNS = "id,thread_id,sender_id,from_team,body,booking_id,listing_id,created_at";
const POLL_MS = 15_000;

type Props = {
  locale: SiteLocale;
  supabase: SupabaseClient;
  threadId: string;
  /** Admins answer as the Sakani team. */
  asTeam?: boolean;
  context?: ChatContext | null;
  onContextClear?: () => void;
  /** Listing titles for the context chips on messages. */
  listingTitles?: Record<string, string>;
};

/** One conversation with the Sakani team: live messages (Realtime, with polling as a fallback) and a reply box. */
export default function SupportChat({ locale, supabase, threadId, asTeam = false, context, onContextClear, listingTitles = {} }: Props) {
  const t = SITE_COPY[locale];
  const timeFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "medium", timeStyle: "short" });
  const [messages, setMessages] = useState<SupportMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data, error: loadError } = await supabase.from("support_messages").select(MESSAGE_COLUMNS).eq("thread_id", threadId).order("created_at").limit(500);
      if (!active) return;
      if (loadError) {
        console.error("Could not load messages:", loadError);
        return;
      }
      setMessages((data ?? []) as SupportMessage[]);
      void supabase.rpc("mark_thread_read", { target_thread: threadId });
    }
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    const channel = supabase
      .channel(`support-${threadId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `thread_id=eq.${threadId}` }, (payload) => {
        const message = payload.new as SupportMessage;
        setMessages((current) => (current && !current.some((item) => item.id === message.id) ? [...current, message] : current));
        void supabase.rpc("mark_thread_read", { target_thread: threadId });
      })
      .subscribe();
    return () => {
      active = false;
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [supabase, threadId]);

  // Keep the newest message in view.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages?.length]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    const { data: session } = await supabase.auth.getSession();
    const { data, error: sendError } = await supabase
      .from("support_messages")
      .insert({
        thread_id: threadId,
        sender_id: session.session?.user.id,
        from_team: asTeam,
        body,
        listing_id: context?.listingId ?? null,
        booking_id: context?.bookingId ?? null,
      })
      .select(MESSAGE_COLUMNS)
      .single();
    setSending(false);
    if (sendError) {
      console.error("Could not send message:", sendError);
      setError(sendError.message.includes("message_limit") ? t.chatTooFast : t.chatSendError);
      return;
    }
    setDraft("");
    onContextClear?.();
    const message = data as SupportMessage;
    setMessages((current) => (current && !current.some((item) => item.id === message.id) ? [...current, message] : current));
  }

  return (
    <div className="chat">
      <ol className="chat-list" ref={listRef} aria-live="polite">
        {messages === null ? (
          <li className="chat-empty"><LoaderCircle className="spinner" size={18} /> {t.loading}</li>
        ) : messages.length === 0 ? (
          <li className="chat-empty">{asTeam ? t.chatEmptyTeam : t.chatEmpty}</li>
        ) : (
          messages.map((message) => {
            const mine = message.from_team === asTeam;
            return (
              <li key={message.id} className={`chat-message${mine ? " is-mine" : ""}${message.from_team ? " is-team" : ""}`}>
                {message.from_team && !asTeam && <span className="chat-author"><Headset size={13} /> {t.chatTeamName}</span>}
                {message.listing_id && (
                  <Link className="chat-about" href={`/${locale}/listings/${message.listing_id}`} target={asTeam ? "_blank" : undefined}>
                    <House size={13} /> {listingTitles[message.listing_id] ?? t.chatAboutListing}
                  </Link>
                )}
                <p>{message.body}</p>
                <time dateTime={message.created_at}>{timeFormat.format(new Date(message.created_at))}</time>
              </li>
            );
          })
        )}
      </ol>

      <form className="chat-form" onSubmit={(event) => void send(event)}>
        {context && (
          <p className="chat-context">
            <House size={14} /> {t.chatAbout(context.label)}
            {onContextClear && <button type="button" onClick={onContextClear} aria-label={t.close}><X size={14} /></button>}
          </p>
        )}
        <div className="chat-input">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder={asTeam ? t.chatPlaceholderTeam : t.chatPlaceholder}
            aria-label={t.chatPlaceholder}
          />
          <button className="button button-primary chat-send" type="submit" disabled={sending || !draft.trim()} aria-label={t.chatSend}>
            <Send size={17} />
          </button>
        </div>
        {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
      </form>
    </div>
  );
}
