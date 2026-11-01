/**
 * Booking documents. The texts live in messages/documents.ts. Raise DOCUMENT_VERSION whenever a template's meaning
 * changes: acceptances record the version, so earlier agreements stay tied to the text that was accepted.
 */
export const DOCUMENT_VERSION = "2026-11-draft-1";

export const BOOKING_DOCUMENTS = [
  "booking_confirmation",
  "payment_receipt",
  "rental_agreement",
  "deposit_receipt",
  "cancellation_request",
  "refund_receipt",
] as const;
export type BookingDocument = (typeof BOOKING_DOCUMENTS)[number];
export type PlatformDocument = "guest_platform" | "host_platform";

/** What booking_document_data returns (only to the booking's guest, its host or an admin). */
export type DocumentData = {
  viewer: "guest" | "host" | "admin";
  booking: {
    id: string;
    status: string;
    created_at: string;
    move_in: string | null;
    months: number | null;
    guests: number;
    listing_id: string | null;
    listing_title: string;
    host_decision: string;
    rent_amount: number | null;
    guest_fee: number | null;
    host_fee: number | null;
    deposit_amount: number;
    total_amount: number | null;
    payout_amount: number | null;
    guest_fee_percent: number | null;
    host_fee_percent: number | null;
    paid_at: string | null;
    moved_in_at: string | null;
    contract_signed_at: string | null;
    problem_note: string | null;
    problem_at: string | null;
    refund_reference: string | null;
    refunded_at: string | null;
    payout_reference: string | null;
    paid_out_at: string | null;
  };
  listing: { title_ar: string; title_en: string; governorate: string; area: string; property_type: string; gender: string } | null;
  guest_name: string;
  host_name: string;
  payment: { id: string; status: string; method: string | null; reference: string | null; submitted_at: string | null; decided_at: string | null } | null;
  deposit: { status: string; amount: number; transfer_reference: string; transferred_at: string; acknowledged_at: string | null; refund_reference: string | null; refunded_at: string | null } | null;
  acceptances: Array<{ party: "guest" | "host"; document: string; version: string; accepted_at: string }>;
};

const CONFIRMED = ["confirmed", "moved_in", "completed"];

/** Whether a booking document can be shown yet. */
export function documentReady(doc: BookingDocument, data: DocumentData) {
  const { booking, payment, deposit } = data;
  switch (doc) {
    case "booking_confirmation":
    case "rental_agreement":
      return CONFIRMED.includes(booking.status);
    case "payment_receipt":
      return payment?.status === "paid" || payment?.status === "refunded";
    case "deposit_receipt":
      return Boolean(deposit);
    case "cancellation_request":
      return Boolean(booking.problem_note);
    case "refund_receipt":
      return booking.status === "refunded";
  }
}

/** When this party accepted this document (current version), if they did. */
export function acceptedAt(data: DocumentData, document: string, party: "guest" | "host") {
  return data.acceptances.find((item) => item.document === document && item.party === party && item.version === DOCUMENT_VERSION)?.accepted_at ?? null;
}

/** Short printable reference for a booking, e.g. "BK-3F9A2C". */
export function bookingRef(id: string) {
  return `BK-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}
