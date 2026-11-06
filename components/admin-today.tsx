"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AlertTriangle, CalendarCheck, CalendarClock, CheckCircle2, FileWarning, Flag, HandCoins, Hourglass, IdCard, Inbox, KeyRound, LayoutList, LoaderCircle, MessagesSquare, ShieldAlert, Undo2, Wallet } from "lucide-react";
import { cairoDay, stayEnd } from "@/lib/finance";
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
  /** For bookings, the tab that holds this work. */
  onOpen: (target: TodayTarget, bookingTab?: string) => void;
};

type Counts = {
  transfers: number;
  cancellations: number;
  refunds: number;
  refundDue: string | null;
  payouts: number;
  deposits: number;
  identity: number;
  errors: number | null;
  moveIns: number;
  contracts: number;
  ending: number;
  hostSilent: number;
  hostHoursLeft: number;
  depositsAtEnd: number;
};
type ActiveBooking = { id: string; status: string; move_in: string | null; months: number | null; contract_signed_at: string | null; deposit_amount: number; paid_at: string | null; host_decision: string };

/** How close to move-in an unsigned contract becomes a job for the team. */
const CONTRACT_WARNING_DAYS = 3;
const ENDING_WARNING_DAYS = 7;
const HOST_ANSWER_HOURS = 24;

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
      // Only transfers still to check: a paid booking waiting for the host is a different job.
      supabase.from("rental_fees").select("id", { count: "exact", head: true }).eq("kind", "upfront").eq("status", "submitted"),
      bookings("cancellation_requested"),
      supabase.from("listing_requests").select("refund_due_at").eq("status", "refund_pending").order("refund_due_at", { ascending: true }),
      supabase.from("listing_requests").select("id", { count: "exact", head: true }).in("status", ["moved_in", "completed"]).is("paid_out_at", null),
      // One list for everything worked out from dates. "completed" stays in it: an unsent deposit outlives the stay.
      supabase.from("listing_requests").select("id,status,move_in,months,contract_signed_at,deposit_amount,paid_at,host_decision").in("status", ["payment_review", "confirmed", "moved_in", "completed"]).order("created_at", { ascending: false }).limit(2000),
      supabase.from("deposit_transfers").select("booking_id,status"),
      supabase.from("identity_verifications").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("client_errors").select("id", { count: "exact", head: true }).gt("at", new Date(Date.now() - 864e5).toISOString()),
    ]).then(([transfers, cancellations, refunds, payouts, bookingRows, sent, identity, errors]) => {
      if (!active) return;
      const sentRows = (sent.data ?? []) as Array<{ booking_id: string; status: string }>;
      const sentIds = new Set(sentRows.map((row) => row.booking_id));
      const openDeposits = new Set(sentRows.filter((row) => row.status === "transferred" || row.status === "acknowledged" || row.status === "refund_pending").map((row) => row.booking_id));
      const rows = (bookingRows.data ?? []) as ActiveBooking[];
      const today = cairoDay();
      const ends = (row: ActiveBooking) => (row.move_in ? stayEnd(row.move_in, row.months) : "");
      const silent = rows.filter((row) => row.status === "payment_review" && row.host_decision === "pending" && row.paid_at);
      const hoursLeft = silent.map((row) => Math.ceil((new Date(row.paid_at!).getTime() + HOST_ANSWER_HOURS * 3_600_000 - Date.now()) / 3_600_000));
      const refundRows = (refunds.data ?? []) as Array<{ refund_due_at: string | null }>;
      setCounts({
        transfers: count(transfers),
        cancellations: count(cancellations),
        refunds: refundRows.length,
        refundDue: refundRows.find((row) => row.refund_due_at)?.refund_due_at ?? null,
        payouts: count(payouts),
        // Ready to send: contract signed, not sent yet. It stays here after the host's rent is paid.
        deposits: rows.filter((row) => row.status !== "payment_review" && row.contract_signed_at && row.deposit_amount > 0 && !sentIds.has(row.id)).length,
        moveIns: rows.filter((row) => row.status === "confirmed" && row.move_in && row.move_in < today).length,
        contracts: rows.filter((row) => row.status === "confirmed" && !row.contract_signed_at && row.move_in && row.move_in <= cairoDay(CONTRACT_WARNING_DAYS)).length,
        ending: rows.filter((row) => row.status === "moved_in" && ends(row) > today && ends(row) <= cairoDay(ENDING_WARNING_DAYS)).length,
        hostSilent: silent.length,
        hostHoursLeft: hoursLeft.length ? Math.max(Math.min(...hoursLeft), 0) : 0,
        depositsAtEnd: rows.filter((row) => openDeposits.has(row.id) && (row.status === "completed" || (row.status === "moved_in" && ends(row) <= today))).length,
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
    canHandleMoney && { key: "refunds", icon: Undo2, count: counts.refunds, title: t.todayRefunds, hint: counts.refundDue ? t.todayRefundsBy(timeFormat.format(new Date(counts.refundDue))) : t.todayRefundsHint, target: "requests" as const, tab: "refund_pending", urgent: true },
    canHandleMoney && { key: "transfers", icon: Wallet, count: counts.transfers, title: t.todayTransfers, hint: t.todayTransfersHint, target: "requests" as const, tab: "payment_review", urgent: true },
    canHandleMoney && { key: "cancellations", icon: AlertTriangle, count: counts.cancellations, title: t.todayCancellations, hint: t.todayCancellationsHint, target: "requests" as const, tab: "cancellation_requested", urgent: true },
    canHandleMoney && { key: "host-silent", icon: Hourglass, count: counts.hostSilent, title: t.todayHostSilent, hint: t.todayHostSilentHint(numberFormat.format(counts.hostHoursLeft)), target: "requests" as const, tab: "payment_review", urgent: true },
    canHandleMoney && { key: "move-ins", icon: KeyRound, count: counts.moveIns, title: t.todayMoveIn, hint: t.todayMoveInHint, target: "requests" as const, tab: "confirmed", urgent: true },
    canHandleMoney && { key: "contracts", icon: FileWarning, count: counts.contracts, title: t.todayContract, hint: t.todayContractHint, target: "requests" as const, tab: "confirmed", urgent: true },
    { key: "chats", icon: MessagesSquare, count: unreadChats, title: t.todayChats, hint: t.todayChatsHint, target: "chat" as const, urgent: true },
    canHandleMoney && { key: "payouts", icon: HandCoins, count: counts.payouts, title: t.todayPayouts, hint: t.todayPayoutsHint, target: "requests" as const, tab: "moved_in", urgent: false },
    canHandleMoney && { key: "deposits", icon: CalendarCheck, count: counts.deposits, title: t.todayDeposits, hint: t.todayDepositsHint, target: "requests" as const, tab: "confirmed", urgent: false },
    canHandleMoney && { key: "deposits-end", icon: ShieldAlert, count: counts.depositsAtEnd, title: t.todayDepositEnd, hint: t.todayDepositEndHint, target: "requests" as const, tab: "completed", urgent: false },
    canHandleMoney && { key: "ending", icon: CalendarClock, count: counts.ending, title: t.todayEnding, hint: t.todayEndingHint, target: "requests" as const, tab: "moved_in", urgent: false },
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
          {open.map(({ key, icon: Icon, count: value, title, hint, target, urgent, ...rest }) => (
            <li key={key} className={urgent ? "is-urgent" : ""}>
              <Icon size={22} />
              <div>
                <strong>{title}</strong>
                <small>{hint}</small>
              </div>
              <span className="admin-today-count">{numberFormat.format(value)}</span>
              <button className="admin-btn admin-btn-primary" type="button" onClick={() => onOpen(target, "tab" in rest ? (rest.tab as string) : undefined)}>{t.todayOpen}</button>
            </li>
          ))}
        </ul>
      )}
      {open.length > 0 && open.length < tasks.length && <p className="field-hint">{t.todayRestClear}</p>}
    </section>
  );
}
