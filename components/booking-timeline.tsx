import { Check } from "lucide-react";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type Props = {
  locale: SiteLocale;
  status: string;
  hostDecision?: "pending" | "accepted" | "declined" | null;
  contractSigned: boolean;
};

const ORDER = ["pending_payment", "payment_review", "confirmed", "moved_in", "completed"];

/** Where a booking is: paid → payment confirmed → host accepted → contract signed → moved in. */
export default function BookingTimeline({ locale, status, hostDecision, contractSigned }: Props) {
  const t = SITE_COPY[locale];
  const at = ORDER.indexOf(status);
  // Cancelled and refund bookings have their own status chip; no timeline.
  if (at === -1) return null;
  const steps = [
    { label: t.timelinePaid, done: at >= 1 },
    { label: t.timelineConfirmed, done: at >= 2 },
    { label: t.timelineHost, done: hostDecision === "accepted" || at >= 2 },
    { label: t.timelineContract, done: contractSigned },
    { label: t.timelineMovedIn, done: at >= 3 },
  ];
  const current = steps.findIndex((step) => !step.done);

  return (
    <ol className="booking-timeline" aria-label={t.timelineTitle}>
      {steps.map((step, index) => (
        <li key={step.label} className={step.done ? "is-done" : index === current ? "is-current" : ""} aria-current={index === current ? "step" : undefined}>
          <span className="booking-timeline-dot">{step.done ? <Check size={12} strokeWidth={3} /> : index + 1}</span>
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}
