"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarCheck, CheckCircle2, ExternalLink, Headset, LoaderCircle, Phone, RotateCcw, Timer, Wallet, X } from "lucide-react";
import { isMissingFunction } from "@/lib/payments";
import { listingPath, whatsappLink } from "@/lib/site";
import { fetchPrivateContacts, listingRef } from "@/lib/supabase/listings";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type BookingStatus = "pending_payment" | "payment_review" | "confirmed" | "moved_in" | "completed" | "refund_pending" | "refunded" | "cancelled";
type Booking = {
  id: string;
  listing_id: string | null;
  listing_title: string;
  name: string;
  contact: string;
  note: string | null;
  status: BookingStatus;
  move_in: string | null;
  months: number | null;
  guests: number;
  guest_id: string | null;
  host_id: string | null;
  fee_id: string | null;
  host_decision: "pending" | "accepted" | "declined";
  rent_amount: number | null;
  guest_fee: number | null;
  host_fee: number | null;
  total_amount: number | null;
  payout_amount: number | null;
  paid_at: string | null;
  problem_note: string | null;
  refund_due_at: string | null;
  refund_reference: string | null;
  payout_reference: string | null;
  created_at: string;
};
type FeeInfo = { id: string; status: string; reference: string | null; payer_phone: string | null };
type HostInfo = { id: string; full_name: string; instapay_address: string };

// Most urgent first: money to check, money to return, hosts to pay.
const TABS: BookingStatus[] = ["payment_review", "refund_pending", "moved_in", "confirmed", "pending_payment", "completed", "refunded", "cancelled"];
const BOOKING_COLUMNS =
  "id,listing_id,listing_title,name,contact,note,status,move_in,months,guests,guest_id,host_id,fee_id,host_decision,rent_amount,guest_fee,host_fee,total_amount,payout_amount,paid_at,problem_note,refund_due_at,refund_reference,payout_reference,created_at";

type Props = {
  locale: SiteLocale;
  supabase: SupabaseClient;
  onChanged: () => void;
  /** Opens the chat with a user (guest or host), about this booking. */
  onOpenChat: (userId: string, bookingId: string) => void;
};

/** Admin: bookings paid upfront. Check the transfer, record the host's answer, refund within 24 hours, pay the host after move-in. */
export default function AdminRequests({ locale, supabase, onChanged, onOpenChat }: Props) {
  const t = SITE_COPY[locale];
  const intlLocale = locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG";
  const numberFormat = new Intl.NumberFormat(intlLocale);
  const dateFormat = new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeStyle: "short" });
  const dayFormat = new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium" });
  const [ready, setReady] = useState<boolean | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [fees, setFees] = useState<Record<string, FeeInfo>>({});
  const [hosts, setHosts] = useState<Record<string, HostInfo>>({});
  const [hostNumbers, setHostNumbers] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<BookingStatus>("payment_review");
  const [version, setVersion] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [references, setReferences] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // The refund countdown ticks every minute.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      // Unpaid bookings expire, and unanswered paid ones move to refund, before the list loads.
      await supabase.rpc("expire_unpaid_bookings");
      const { data, error: loadError } = await supabase.from("listing_requests").select(BOOKING_COLUMNS).order("created_at", { ascending: false }).limit(500);
      if (!mounted) return;
      if (loadError) {
        if (!isMissingFunction(loadError)) console.error("Could not load bookings:", loadError);
        setReady(false);
        return;
      }
      const rows = (data ?? []) as Booking[];
      setBookings(rows);
      setReady(true);
      const feeIds = rows.map((row) => row.fee_id).filter((id): id is string => Boolean(id));
      const hostIds = [...new Set(rows.map((row) => row.host_id).filter((id): id is string => Boolean(id)))];
      const listingIds = [...new Set(rows.map((row) => row.listing_id).filter((id): id is string => Boolean(id)))];
      const [feeRows, hostRows, numbers] = await Promise.all([
        feeIds.length ? supabase.from("rental_fees").select("id,status,reference,payer_phone").in("id", feeIds) : Promise.resolve({ data: [] }),
        hostIds.length ? supabase.from("profiles").select("id,full_name,instapay_address").in("id", hostIds) : Promise.resolve({ data: [] }),
        fetchPrivateContacts(supabase, listingIds),
      ]);
      if (!mounted) return;
      setFees(Object.fromEntries(((feeRows.data ?? []) as FeeInfo[]).map((fee) => [fee.id, fee])));
      setHosts(Object.fromEntries(((hostRows.data ?? []) as HostInfo[]).map((host) => [host.id, host])));
      setHostNumbers(numbers);
    })();
    return () => {
      mounted = false;
    };
  }, [supabase, version]);

  async function run(booking: Booking, fn: string, args: Record<string, unknown>, done: string) {
    setBusyId(booking.id);
    setError("");
    setMessage("");
    const { error: runError } = await supabase.rpc(fn, args);
    setBusyId(null);
    if (runError) {
      console.error(`Could not run ${fn}:`, runError);
      setError(runError.message.includes("invalid_reference") ? t.referenceRequired : t.adminUpdateError);
      return;
    }
    setMessage(done);
    setVersion((value) => value + 1);
    onChanged();
  }

  if (ready === null) return <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>;
  if (!ready) return <p className="owner-feedback owner-feedback-error">{t.requestsMigration}</p>;

  const visible = bookings.filter((booking) => booking.status === tab);
  const egp = (amount: number | null) => `${numberFormat.format(amount ?? 0)} ${t.currency}`;
  const hoursLeft = (due: string) => Math.ceil((new Date(due).getTime() - now) / 3_600_000);

  return (
    <div className="admin-requests">
      <div className="admin-segment" role="tablist" aria-label={t.adminViewRequests}>
        {TABS.map((status) => (
          <button key={status} type="button" role="tab" aria-selected={tab === status} className={tab === status ? "is-active" : ""} onClick={() => setTab(status)}>
            {t.adminBookingTabs[status]} <span>{numberFormat.format(bookings.filter((booking) => booking.status === status).length)}</span>
          </button>
        ))}
      </div>

      {message && <p className="owner-feedback owner-feedback-success admin-feedback" role="status">{message}</p>}
      {error && <p className="owner-feedback owner-feedback-error admin-feedback" role="alert">{error}</p>}

      {visible.length === 0 ? (
        <section className="admin-empty-state"><CalendarCheck size={26} /><p>{t.requestsEmpty}</p></section>
      ) : (
        <div className="admin-fee-list">
          {visible.map((booking) => {
            const busy = busyId === booking.id;
            const fee = booking.fee_id ? fees[booking.fee_id] : undefined;
            const host = booking.host_id ? hosts[booking.host_id] : undefined;
            const hostNumber = booking.listing_id ? hostNumbers[booking.listing_id] : undefined;
            const reference = references[booking.id] ?? "";
            const left = booking.refund_due_at ? hoursLeft(booking.refund_due_at) : null;
            return (
              <article className={`admin-fee admin-request${left !== null && left <= 6 ? " is-urgent" : ""}`} key={booking.id}>
                <div className="admin-fee-main">
                  <strong>{egp(booking.total_amount)} <span className={`payer-chip is-student`}>{t.adminBookingTabs[booking.status]}</span></strong>
                  <span>
                    {booking.listing_title}
                    {booking.listing_id && <> · <span dir="ltr">{listingRef(booking.listing_id)}</span> · <Link href={listingPath(locale, booking.listing_id)} target="_blank"><ExternalLink size={12} /> {t.adminViewPublic}</Link></>}
                  </span>
                  <small>{dateFormat.format(new Date(booking.created_at))}</small>
                </div>

                {booking.status === "refund_pending" && left !== null && (
                  <p className={`admin-refund-timer${left <= 6 ? " is-urgent" : ""}`}>
                    <Timer size={16} /> {left > 0 ? t.refundHoursLeft(numberFormat.format(left)) : t.refundOverdue}
                  </p>
                )}

                <dl className="admin-fee-ref">
                  <div><dt>{t.requestStudent}</dt><dd>{booking.name} · <span dir="ltr">{booking.contact}</span></dd></div>
                  <div><dt>{t.bookTitle}</dt><dd>{booking.move_in ? t.bookingFrom(dayFormat.format(new Date(booking.move_in))) : "—"}{booking.months ? ` · ${t.monthsCount(booking.months)}` : ""} · {t.guestsCount(booking.guests)}</dd></div>
                  <div><dt>{t.adminAmounts}</dt><dd>{t.adminAmountsLine(egp(booking.rent_amount), egp(booking.guest_fee), egp(booking.host_fee), egp(booking.payout_amount))}</dd></div>
                  <div><dt>{t.requestOwner}</dt><dd>{host?.full_name || "—"} · <span dir="ltr">{hostNumber ?? "…"}</span> · {t.hostDecision[booking.host_decision]}</dd></div>
                  {fee?.reference && <div><dt>{t.payInstapay}</dt><dd dir="ltr">{fee.reference}{fee.payer_phone ? ` · ${fee.payer_phone}` : ""}</dd></div>}
                  {booking.note && <div><dt>{t.requestNote}</dt><dd>{booking.note}</dd></div>}
                  {booking.problem_note && <div><dt>{t.problemLabel}</dt><dd>{booking.problem_note}</dd></div>}
                  {booking.status === "moved_in" && <div><dt>{t.instapayLabel}</dt><dd dir="ltr">{host?.instapay_address || t.instapayMissingAdmin}</dd></div>}
                  {booking.refund_reference && <div><dt>{t.refundRefLabel}</dt><dd dir="ltr">{booking.refund_reference}</dd></div>}
                  {booking.payout_reference && <div><dt>{t.payoutRefLabel}</dt><dd dir="ltr">{booking.payout_reference}</dd></div>}
                </dl>

                <div className="admin-card-actions">
                  {booking.guest_id && <button className="admin-btn admin-btn-ghost" type="button" onClick={() => onOpenChat(booking.guest_id!, booking.id)}><Headset size={15} /> {t.chatWithGuest}</button>}
                  {booking.host_id && <button className="admin-btn admin-btn-ghost" type="button" onClick={() => onOpenChat(booking.host_id!, booking.id)}><Headset size={15} /> {t.chatWithHost}</button>}
                  {hostNumber && <a className="admin-btn admin-btn-ghost" href={whatsappLink(hostNumber)} target="_blank" rel="noreferrer"><Phone size={15} /> {t.requestOwner}</a>}

                  {(booking.status === "pending_payment" || booking.status === "payment_review") && (
                    <>
                      {fee && fee.status !== "paid" && (
                        <button className="admin-btn admin-btn-primary" type="button" disabled={busy} onClick={() => void run(booking, "admin_confirm_booking_payment", { target_booking: booking.id }, t.paymentConfirmedDone)}>
                          <CheckCircle2 size={15} /> {t.markPaid}
                        </button>
                      )}
                      {fee?.status === "submitted" && (
                        <button className="admin-btn admin-btn-danger-outline" type="button" disabled={busy} onClick={() => void run(booking, "admin_decide_fee", { target_fee: fee.id, decision: "due" }, t.adminStatusUpdated)}>
                          <RotateCcw size={15} /> {t.markDue}
                        </button>
                      )}
                      {booking.host_decision === "pending" && (
                        <>
                          <button className="admin-btn admin-btn-ghost" type="button" disabled={busy} onClick={() => void run(booking, "admin_set_host_decision", { target_booking: booking.id, accept: true }, t.adminStatusUpdated)}><CheckCircle2 size={15} /> {t.hostAcceptedAdmin}</button>
                          <button className="admin-btn admin-btn-ghost" type="button" disabled={busy} onClick={() => void run(booking, "admin_set_host_decision", { target_booking: booking.id, accept: false }, t.adminStatusUpdated)}><X size={15} /> {t.hostDeclinedAdmin}</button>
                        </>
                      )}
                    </>
                  )}

                  {(booking.status === "refund_pending" || booking.status === "moved_in") && (
                    <span className="admin-reference">
                      <input
                        value={reference}
                        onChange={(event) => setReferences({ ...references, [booking.id]: event.target.value })}
                        placeholder={t.payReference}
                        aria-label={t.payReference}
                        maxLength={64}
                        dir="ltr"
                      />
                      {booking.status === "refund_pending" ? (
                        <button className="admin-btn admin-btn-primary" type="button" disabled={busy} onClick={() => void run(booking, "admin_mark_refunded", { target_booking: booking.id, transfer_reference: reference }, t.refundDoneAdmin)}>
                          <RotateCcw size={15} /> {t.markRefunded}
                        </button>
                      ) : (
                        <button className="admin-btn admin-btn-primary" type="button" disabled={busy} onClick={() => void run(booking, "admin_mark_payout", { target_booking: booking.id, transfer_reference: reference }, t.payoutDoneAdmin)}>
                          <Wallet size={15} /> {t.markPayout}
                        </button>
                      )}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
