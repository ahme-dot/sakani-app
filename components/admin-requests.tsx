"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarCheck, CheckCircle2, ExternalLink, FileText, Headset, LoaderCircle, Phone, RotateCcw, Timer, Wallet, X } from "lucide-react";
import { isMissingFunction } from "@/lib/payments";
import { listingPath, whatsappLink } from "@/lib/site";
import { fetchPrivateContacts, listingRef } from "@/lib/supabase/listings";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type BookingStatus = "pending_payment" | "payment_review" | "confirmed" | "moved_in" | "completed" | "cancellation_requested" | "refund_pending" | "refunded" | "cancelled";
type CancellationInfo = { id: string; booking_id: string; requesting_party: string; scenario: string; reason: string; status: string; refundable_amount: number | null };
export const CANCELLATION_SCENARIOS = ["host_cancels", "guest_before_contract", "guest_after_contract", "property_unavailable", "inaccurate_listing", "platform_failure", "mutual"] as const;
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
  deposit_amount: number;
  guest_fee_percent: number | null;
  host_fee_percent: number | null;
  contract_signed_at: string | null;
  created_at: string;
};
type DepositInfo = { booking_id: string; status: string; amount: number; transfer_reference: string; acknowledged_at: string | null };
type FeeInfo = { id: string; status: string; reference: string | null; payer_phone: string | null };
type HostInfo = { id: string; full_name: string; instapay_address: string };

// Most urgent first: money to check, money to return, hosts to pay.
const TABS: BookingStatus[] = ["payment_review", "cancellation_requested", "refund_pending", "moved_in", "confirmed", "pending_payment", "completed", "refunded", "cancelled"];
const BOOKING_COLUMNS =
  "id,listing_id,listing_title,name,contact,note,status,move_in,months,guests,guest_id,host_id,fee_id,host_decision,rent_amount,guest_fee,host_fee,total_amount,payout_amount,paid_at,problem_note,refund_due_at,refund_reference,payout_reference,deposit_amount,guest_fee_percent,host_fee_percent,contract_signed_at,created_at";

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
  const [deposits, setDeposits] = useState<Record<string, DepositInfo>>({});
  const [cancellations, setCancellations] = useState<Record<string, CancellationInfo>>({});
  const [scenarios, setScenarios] = useState<Record<string, string>>({});
  const [depositNotes, setDepositNotes] = useState<Record<string, string>>({});
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
      const bookingIds = rows.map((row) => row.id);
      const [feeRows, hostRows, numbers, depositRows, cancellationRows] = await Promise.all([
        feeIds.length ? supabase.from("rental_fees").select("id,status,reference,payer_phone").in("id", feeIds) : Promise.resolve({ data: [] }),
        hostIds.length ? supabase.from("profiles").select("id,full_name,instapay_address").in("id", hostIds) : Promise.resolve({ data: [] }),
        fetchPrivateContacts(supabase, listingIds),
        bookingIds.length ? supabase.from("deposit_transfers").select("booking_id,status,amount,transfer_reference,acknowledged_at").in("booking_id", bookingIds) : Promise.resolve({ data: [] }),
        bookingIds.length ? supabase.from("cancellation_requests").select("id,booking_id,requesting_party,scenario,reason,status,refundable_amount").in("booking_id", bookingIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
      ]);
      if (!mounted) return;
      setFees(Object.fromEntries(((feeRows.data ?? []) as FeeInfo[]).map((fee) => [fee.id, fee])));
      setHosts(Object.fromEntries(((hostRows.data ?? []) as HostInfo[]).map((host) => [host.id, host])));
      setHostNumbers(numbers);
      setDeposits(Object.fromEntries(((depositRows.data ?? []) as DepositInfo[]).map((row) => [row.booking_id, row])));
      // The newest request per booking.
      const latest: Record<string, CancellationInfo> = {};
      for (const row of (cancellationRows.data ?? []) as CancellationInfo[]) latest[row.booking_id] ??= row;
      setCancellations(latest);
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
      setError(
        runError.message.includes("invalid_reference") || runError.message.includes("invalid_note") ? t.referenceRequired
          : runError.message.includes("contract_not_signed") ? t.depositNeedsContract
            : runError.message.includes("policy_not_active") ? t.policyNotActive
              : runError.message.includes("rule_not_set") ? t.ruleNotSet
            : runError.message.includes("already_transferred") ? t.depositAlreadySent
              : t.adminUpdateError,
      );
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
            const deposit = deposits[booking.id];
            const cancellation = cancellations[booking.id];
            const scenario = scenarios[booking.id] ?? cancellation?.scenario ?? "";
            const depositNote = depositNotes[booking.id] ?? "";
            const paidAndConfirmed = booking.status === "confirmed" || booking.status === "moved_in" || booking.status === "completed";
            return (
              <article className={`admin-fee admin-request${left !== null && left <= 6 ? " is-urgent" : ""}`} key={booking.id}>
                <div className="admin-fee-main">
                  <strong>{egp(booking.total_amount)} <span className={`payer-chip is-student`}>{t.adminBookingTabs[booking.status]}</span></strong>
                  <span>
                    {booking.listing_title}
                    {booking.listing_id && <> · <bdi dir="ltr">{listingRef(booking.listing_id)}</bdi> · <Link href={listingPath(locale, booking.listing_id)} target="_blank"><ExternalLink size={12} /> {t.adminViewPublic}</Link></>}
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
                  <div><dt>{t.contractLabel}</dt><dd>{booking.contract_signed_at ? t.contractSignedOn(dayFormat.format(new Date(booking.contract_signed_at))) : t.contractNotSigned}</dd></div>
                  {booking.guest_fee_percent !== null && <div><dt>{t.ratesKept}</dt><dd>{t.ratesLine(numberFormat.format(booking.guest_fee_percent), numberFormat.format(booking.host_fee_percent ?? 0))}</dd></div>}
                  {booking.deposit_amount > 0 && (
                    <div>
                      <dt>{t.bookDeposit}</dt>
                      <dd>
                        {egp(booking.deposit_amount)} · {deposit ? t.depositStatus[deposit.status as keyof typeof t.depositStatus] : booking.contract_signed_at ? t.depositReady : t.depositNeedsContract}
                        {deposit && <> · <span dir="ltr">{deposit.transfer_reference}</span></>}
                      </dd>
                    </div>
                  )}
                  <div><dt>{t.requestOwner}</dt><dd>{host?.full_name || t.ownerGuest} · <span dir="ltr">{hostNumber ?? "…"}</span> · {t.hostDecisionAdmin[booking.host_decision]}</dd></div>
                  {fee?.reference && <div><dt>{t.payInstapay}</dt><dd dir="ltr">{fee.reference}{fee.payer_phone ? ` · ${fee.payer_phone}` : ""}</dd></div>}
                  {booking.note && <div><dt>{t.requestNote}</dt><dd>{booking.note}</dd></div>}
                  {booking.problem_note && <div><dt>{t.problemLabel}</dt><dd>{booking.problem_note}</dd></div>}
                  {cancellation && (
                    <div>
                      <dt>{t.cancelRequestLabel}</dt>
                      <dd>
                        {t.cancelParty[cancellation.requesting_party as keyof typeof t.cancelParty] ?? cancellation.requesting_party} · {t.cancelScenarios[cancellation.scenario as keyof typeof t.cancelScenarios] ?? cancellation.scenario}
                        {cancellation.refundable_amount !== null && <> · {t.refundableLine(egp(cancellation.refundable_amount))}</>}
                      </dd>
                    </div>
                  )}
                  {booking.status === "moved_in" && <div><dt>{t.instapayLabel}</dt><dd dir="ltr">{host?.instapay_address || t.instapayMissingAdmin}</dd></div>}
                  {booking.refund_reference && <div><dt>{t.refundRefLabel}</dt><dd dir="ltr">{booking.refund_reference}</dd></div>}
                  {booking.payout_reference && <div><dt>{t.payoutRefLabel}</dt><dd dir="ltr">{booking.payout_reference}</dd></div>}
                </dl>

                <div className="admin-card-actions">
                  <Link className="admin-btn admin-btn-ghost" href={`/${locale}/documents/${booking.id}`} target="_blank"><FileText size={15} /> {t.documentsLink}</Link>
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

                  {booking.deposit_amount > 0 && paidAndConfirmed && (!deposit ? booking.contract_signed_at : deposit.status === "transferred" || deposit.status === "acknowledged" || deposit.status === "refund_pending" || deposit.status === "disputed") && (
                    <span className="admin-reference">
                      <input
                        value={depositNote}
                        onChange={(event) => setDepositNotes({ ...depositNotes, [booking.id]: event.target.value })}
                        placeholder={deposit ? t.depositNotePlaceholder : t.payReference}
                        aria-label={t.payReference}
                        maxLength={deposit ? 1000 : 64}
                        dir="auto"
                      />
                      {!deposit ? (
                        <button className="admin-btn admin-btn-primary" type="button" disabled={busy} onClick={() => void run(booking, "admin_transfer_deposit", { target_booking: booking.id, transfer_reference: depositNote }, t.depositSentDone)}>
                          <Wallet size={15} /> {t.depositSendButton}
                        </button>
                      ) : (
                        <>
                          <button className="admin-btn admin-btn-ghost" type="button" disabled={busy} onClick={() => void run(booking, "admin_update_deposit", { target_booking: booking.id, new_status: "refunded", note: depositNote }, t.adminStatusUpdated)}>{t.depositMarkReturned}</button>
                          <button className="admin-btn admin-btn-danger-outline" type="button" disabled={busy} onClick={() => void run(booking, "admin_update_deposit", { target_booking: booking.id, new_status: "disputed", note: depositNote }, t.adminStatusUpdated)}>{t.depositMarkDisputed}</button>
                        </>
                      )}
                    </span>
                  )}

                  {booking.status === "cancellation_requested" && cancellation?.status === "pending" && (
                    <span className="admin-reference">
                      <select value={scenario} onChange={(event) => setScenarios({ ...scenarios, [booking.id]: event.target.value })} aria-label={t.cancelScenarioLabel}>
                        {CANCELLATION_SCENARIOS.map((item) => <option key={item} value={item}>{t.cancelScenarios[item]}</option>)}
                      </select>
                      <button className="admin-btn admin-btn-primary" type="button" disabled={busy} onClick={() => void run(booking, "admin_decide_cancellation", { target_request: cancellation.id, approve: true, chosen_scenario: scenario, note: "" }, t.cancelApproved)}>
                        <CheckCircle2 size={15} /> {t.cancelApprove}
                      </button>
                      <button className="admin-btn admin-btn-ghost" type="button" disabled={busy} onClick={() => void run(booking, "admin_decide_cancellation", { target_request: cancellation.id, approve: false, chosen_scenario: scenario, note: "" }, t.adminStatusUpdated)}>
                        <X size={15} /> {t.cancelReject}
                      </button>
                    </span>
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
