import { Wallet } from "lucide-react";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type Booking = {
  id: string;
  listing_title: string;
  status: string;
  host_decision: string;
  payout_amount: number | null;
  paid_out_at: string | null;
  deposit_amount: number;
  deposit_status: string | null;
};

/** The host's money at a glance: paid out, on its way, and deposits. */
export default function HostEarnings({ locale, bookings }: { locale: SiteLocale; bookings: Booking[] }) {
  const t = SITE_COPY[locale];
  const intlLocale = locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG";
  const money = (value: number) => `${new Intl.NumberFormat(intlLocale).format(value)} ${t.currency}`;

  const paid = bookings.filter((booking) => booking.paid_out_at);
  // Rent − host fee is sent after the guest moves in; confirmed bookings are on their way.
  const coming = bookings.filter((booking) => !booking.paid_out_at && (booking.status === "confirmed" || booking.status === "moved_in" || booking.status === "payment_review") && booking.host_decision !== "declined");
  const deposits = bookings.filter((booking) => booking.deposit_status === "transferred" || booking.deposit_status === "acknowledged");
  const sum = (list: Booking[], pick: (booking: Booking) => number) => list.reduce((total, booking) => total + pick(booking), 0);

  if (!paid.length && !coming.length && !deposits.length) return null;

  return (
    <section className="profile-section host-earnings" aria-labelledby="earnings-title">
      <h2 id="earnings-title"><Wallet size={20} /> {t.earningsTitle}</h2>
      <div className="host-earnings-stats">
        <div><span>{t.earningsPaid}</span><strong>{money(sum(paid, (booking) => booking.payout_amount ?? 0))}</strong></div>
        <div><span>{t.earningsComing}</span><strong>{money(sum(coming, (booking) => booking.payout_amount ?? 0))}</strong></div>
        <div><span>{t.earningsDeposits}</span><strong>{money(sum(deposits, (booking) => booking.deposit_amount))}</strong></div>
      </div>
      <p className="field-hint">{t.earningsNote}</p>
    </section>
  );
}
