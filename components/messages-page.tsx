"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Headset, LoaderCircle, LogIn } from "lucide-react";
import SupportChat, { type ChatContext } from "@/components/support-chat";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { useAccount } from "@/lib/account";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { UUID_PATTERN } from "@/lib/supabase/listings";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

/** The signed-in user's chat with the Sakani team (guests and hosts never talk to each other directly). */
export default function MessagesPage({ locale, listingId, bookingId }: { locale: SiteLocale; listingId: string | null; bookingId: string | null }) {
  const t = SITE_COPY[locale];
  const otherLocale: SiteLocale = locale === "ar" ? "en" : "ar";
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const account = useAccount(supabase);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [context, setContext] = useState<ChatContext | null>(null);
  const [listingTitles, setListingTitles] = useState<Record<string, string>>({});
  const signedInId = account.status === "signedIn" ? account.user.id : null;

  useEffect(() => {
    if (!supabase || !signedInId) return;
    let active = true;
    void supabase.rpc("my_support_thread").then(({ data, error }) => {
      if (!active) return;
      if (error || typeof data !== "string") {
        console.error("Could not open the chat:", error);
        setFailed(true);
        return;
      }
      setThreadId(data);
    });
    return () => {
      active = false;
    };
  }, [supabase, signedInId]);

  // "About this place / booking" when the chat was opened from a listing or a booking.
  useEffect(() => {
    if (!supabase || !signedInId) return;
    let active = true;
    if (bookingId && UUID_PATTERN.test(bookingId)) {
      void supabase.from("listing_requests").select("listing_id,listing_title").eq("id", bookingId).maybeSingle().then(({ data }) => {
        if (active && data) setContext({ bookingId, listingId: data.listing_id as string | null, label: data.listing_title as string });
      });
    } else if (listingId && UUID_PATTERN.test(listingId)) {
      void supabase.from("properties").select("title_ar,title_en").eq("id", listingId).maybeSingle().then(({ data }) => {
        if (active && data) setContext({ listingId, label: (locale === "ar" ? data.title_ar : data.title_en) as string });
      });
    }
    return () => {
      active = false;
    };
  }, [supabase, signedInId, listingId, bookingId, locale]);

  // Titles for the listings mentioned in this conversation.
  useEffect(() => {
    if (!supabase || !threadId) return;
    let active = true;
    void supabase.from("support_messages").select("listing_id").eq("thread_id", threadId).not("listing_id", "is", null).limit(200).then(async ({ data }) => {
      const ids = [...new Set((data ?? []).map((row) => row.listing_id as string))];
      if (!ids.length) return;
      const { data: rows } = await supabase.from("properties").select("id,title_ar,title_en").in("id", ids);
      if (active) setListingTitles(Object.fromEntries((rows ?? []).map((row) => [row.id, locale === "ar" ? row.title_ar : row.title_en])));
    });
    return () => {
      active = false;
    };
  }, [supabase, threadId, locale]);

  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader locale={locale} switchHref={`/${otherLocale}/messages`} />
      <main className="messages-page section-wrap">
        <header className="messages-head">
          <span className="messages-avatar"><Headset size={22} /></span>
          <div>
            <h1>{t.chatTeamName}</h1>
            <p>{t.chatIntro}</p>
          </div>
        </header>
        {account.status === "loading" ? (
          <p className="profile-loading"><LoaderCircle className="spinner" size={18} /> {t.loading}</p>
        ) : account.status === "signedOut" ? (
          <div className="book-home-login">
            <p>{t.chatLoginText}</p>
            <Link className="button button-primary book-login" href={`/${locale}/account?next=${encodeURIComponent(`/${locale}/messages`)}`}><LogIn size={17} /> {t.menuLogin}</Link>
          </div>
        ) : failed ? (
          <p className="owner-feedback owner-feedback-error" role="alert">{t.chatLoadError}</p>
        ) : threadId && supabase ? (
          <SupportChat locale={locale} supabase={supabase} threadId={threadId} context={context} onContextClear={() => setContext(null)} listingTitles={listingTitles} />
        ) : (
          <p className="profile-loading"><LoaderCircle className="spinner" size={18} /> {t.loading}</p>
        )}
      </main>
      <SiteFooter locale={locale} switchHref={`/${otherLocale}/messages`} tab="messages" />
    </div>
  );
}
