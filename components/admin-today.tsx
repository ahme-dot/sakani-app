"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AlertTriangle, CalendarCheck, CheckCircle2, Flag, HandCoins, IdCard, Inbox, LayoutList, LoaderCircle, MessagesSquare, Undo2, Wallet } from "lucide-react";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

export type TodayTarget = "listings" | "requests" | "chat" | "reports" | "inbox" | "identity" | "errors";

type Props = {
  locale: SiteLocale;
  supabase: SupabaseClient;
  /** Counts the dashboard already keeps for its menu badges. */
  pendingListings: number;
  unreadChats: number;
  openReports: number;
  openMessages: number;
  /** Reviewer admins don't handle money. */
  canHandleMoney: boolean;
  onOpen: (target: TodayTarget) => void;
};

type Counts = { transfers: number; cancellations: number; refunds: number; refundDue: string | null; payouts: number; deposits: number; identity: number; errors: number | null };

const count = (result: { count: number | null }) => result.count ?? 0;

/** The team's to-do list for today, most urgent first, each with a button to the place where it's done. */
export default function AdminToday({ locale, supabase, pendingListings, unreadChats, openReports, openMessages, canHandleMoney, onOpen }: Props) {
  const t = SITE_COPY[locale];
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG");
  const timeFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "medium", timeStyle: "short" });
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    let active = true;
    const bookings = (status: string) => supabase.from("listing_requests").select("id", { count: "exact", head: true }).eq("status", status);
    void Promise.all([
      bookings("payment_review"),
      bookings("cancellation_requested"),
      supabase.from("listing_requests").select("refund_due_at").eq("status", "refund_pending").order("refund_due_at", { ascending: true }),
      supabase.from("listing_requests").select("id", { count: "exact", head: true }).eq("status", "moved_in").is("paid_out_at", null),
      // Deposits ready to send: paid, contract signed, not sent yet.
      supabase.from("listing_requests").select("id").in("status", ["confirmed", "moved_in"]).not("contract_signed_at", "is", null).gt("deposit_amount", 0),
      supabase.from("deposit_transfers").select("booking_id"),
      supabase.from("identity_verifications").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("client_errors").select("id", { count: "exact", head: true }).gt("at", new Date(Date.now() - 864e5).toISOString()),
    ]).then(([transfers, cancellations, refunds, payouts, signed, sent, identity, errors]) => {
      if (!active) return;
      const sentIds = new Set(((sent.data ?? []) as Array<{ booking_id: string }>).map((row) => row.booking_id));
      const refundRows = (refunds.data ?? []) as Array<{ refund_due_at: string | null }>;
      setCounts({
        transfers: count(transfers),
        cancellations: count(cancellations),
        refunds: refundRows.length,
        refundDue: refundRows.find((row) => row.refund_due_at)?.refund_due_at ?? null,
        payouts: count(payouts),
        deposits: ((signed.data ?? []) as Array<{ id: string }>).filter((row) => !sentIds.has(row.id)).length,
        identity: count(identity),
        errors: errors.error ? null : count(errors),
      });
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  if (!counts) return <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>;

  const tasks = [
    canHandleMoney && { key: "refunds", icon: Undo2, count: counts.refunds, title: t.todayRefunds, hint: counts.refundDue ? t.todayRefundsBy(timeFormat.format(new Date(counts.refundDue))) : t.todayRefundsHint, target: "requests" as const, urgent: true },
    canHandleMoney && { key: "transfers", icon: Wallet, count: counts.transfers, title: t.todayTransfers, hint: t.todayTransfersHint, target: "requests" as const, urgent: true },
    canHandleMoney && { key: "cancellations", icon: AlertTriangle, count: counts.cancellations, title: t.todayCancellations, hint: t.todayCancellationsHint, target: "requests" as const, urgent: true },
    { key: "chats", icon: MessagesSquare, count: unreadChats, title: t.todayChats, hint: t.todayChatsHint, target: "chat" as const, urgent: true },
    canHandleMoney && { key: "payouts", icon: HandCoins, count: counts.payouts, title: t.todayPayouts, hint: t.todayPayoutsHint, target: "requests" as const, urgent: false },
    canHandleMoney && { key: "deposits", icon: CalendarCheck, count: counts.deposits, title: t.todayDeposits, hint: t.todayDepositsHint, target: "requests" as const, urgent: false },
    { key: "listings", icon: LayoutList, count: pendingListings, title: t.todayListings, hint: t.todayListingsHint, target: "listings" as const, urgent: false },
    { key: "reports", icon: Flag, count: openReports, title: t.todayReports, hint: t.todayReportsHint, target: "reports" as const, urgent: false },
    { key: "messages", icon: Inbox, count: openMessages, title: t.todayMessages, hint: t.todayMessagesHint, target: "inbox" as const, urgent: false },
    { key: "identity", icon: IdCard, count: counts.identity, title: t.todayIdentity, hint: t.todayIdentityHint, target: "identity" as const, urgent: false },
    counts.errors !== null && { key: "errors", icon: AlertTriangle, count: counts.errors, title: t.todayErrors, hint: t.todayErrorsHint, target: "errors" as const, urgent: false },
  ].filter((task): task is Exclude<typeof task, false | null> => Boolean(task));
  const open = tasks.filter((task) => task.count > 0);

  return (
    <section className="admin-today">
      {open.length === 0 ? (
        <section className="admin-empty-state"><CheckCircle2 size={28} /><p>{t.todayAllClear}</p></section>
      ) : (
        <ul className="admin-today-list">
          {open.map(({ key, icon: Icon, count: value, title, hint, target, urgent }) => (
            <li key={key} className={urgent ? "is-urgent" : ""}>
              <Icon size={22} />
              <div>
                <strong>{title}</strong>
                <small>{hint}</small>
              </div>
              <span className="admin-today-count">{numberFormat.format(value)}</span>
              <button className="admin-btn admin-btn-primary" type="button" onClick={() => onOpen(target)}>{t.todayOpen}</button>
            </li>
          ))}
        </ul>
      )}
      {open.length > 0 && open.length < tasks.length && <p className="field-hint">{t.todayRestClear}</p>}
    </section>
  );
}
