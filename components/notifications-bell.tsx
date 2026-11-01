"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useAccount } from "@/lib/account";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type Notice = { id: string; kind: string; booking_id: string | null; data: { title?: string; amount?: number }; read_at: string | null; created_at: string };

const POLL_MS = 60_000;

/** The bell in the header: booking, payment, contract, deposit and chat updates for the signed-in user. */
export default function NotificationsBell({ locale }: { locale: SiteLocale }) {
  const t = SITE_COPY[locale];
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const account = useAccount(supabase);
  const userId = account.status === "signedIn" ? account.user.id : null;
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const timeFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "short", timeStyle: "short" });

  useEffect(() => {
    if (!supabase || !userId) return;
    let active = true;
    async function load() {
      const { data, error } = await supabase!.from("notifications").select("id,kind,booking_id,data,read_at,created_at").order("created_at", { ascending: false }).limit(20);
      if (active && !error) setNotices((data ?? []) as Notice[]);
    }
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [supabase, userId, version]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  if (!userId) return null;
  const unread = notices.filter((notice) => !notice.read_at).length;

  async function markAllRead() {
    if (!supabase || !unread) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    setVersion((value) => value + 1);
  }

  const href = (notice: Notice) => {
    if (notice.kind === "team_reply") return `/${locale}/messages`;
    if (notice.kind === "agreement_ready" || notice.kind === "agreement_signed" || notice.kind === "deposit_transferred") return notice.booking_id ? `/${locale}/documents/${notice.booking_id}` : `/${locale}/account`;
    return `/${locale}/account#bookings`;
  };

  return (
    <div className="notifications" ref={ref}>
      <button
        type="button"
        className="notifications-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t.notificationsTitle}
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void markAllRead();
        }}
      >
        <Bell size={18} />
        {unread > 0 && <span className="unread-badge notifications-count">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="notifications-panel" role="dialog" aria-label={t.notificationsTitle}>
          <strong className="notifications-title">{t.notificationsTitle}</strong>
          {notices.length === 0 ? (
            <p className="notifications-empty">{t.notificationsEmpty}</p>
          ) : (
            <ul>
              {notices.map((notice) => (
                <li key={notice.id} className={notice.read_at ? "" : "is-unread"}>
                  <Link href={href(notice)} onClick={() => setOpen(false)}>
                    <span>{(t.notice[notice.kind as keyof typeof t.notice] ?? t.notice.generic)(notice.data?.title ?? "")}</span>
                    <small>{timeFormat.format(new Date(notice.created_at))}</small>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
