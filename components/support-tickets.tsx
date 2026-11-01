"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Ticket } from "lucide-react";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

export const TICKET_CATEGORIES = ["booking", "payment", "refund", "property", "other"] as const;
export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export type SupportTicket = { id: string; number: number; category: string; subject: string; status: (typeof TICKET_STATUSES)[number]; created_at: string };

type Props = {
  locale: SiteLocale;
  supabase: SupabaseClient;
  /** The user whose tickets to show (their own, or — for admins — the person in the open conversation). */
  userId: string;
  /** Admins change a ticket's status; users open new tickets. */
  asTeam?: boolean;
  bookingId?: string | null;
  onCreated?: () => void;
};

/** Support tickets: a numbered request with a type and a status, on top of the chat with the Sakani team. */
export default function SupportTickets({ locale, supabase, userId, asTeam = false, bookingId = null, onCreated }: Props) {
  const t = SITE_COPY[locale];
  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "medium" });
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  // Finished tickets fold away so the open ones stay on top.
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.from("support_tickets").select("id,number,category,subject,status,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50).then(({ data }) => {
      if (active) setTickets((data ?? []) as SupportTicket[]);
    });
    return () => {
      active = false;
    };
  }, [supabase, userId, version]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const subject = String(form.get("subject") ?? "").trim();
    const body = String(form.get("body") ?? "").trim();
    if (subject.length < 3 || body.length < 1) {
      setError(t.ticketInvalid);
      return;
    }
    setBusy(true);
    setError("");
    const { error: createError } = await supabase.rpc("create_support_ticket", {
      ticket_category: String(form.get("category")),
      ticket_subject: subject,
      first_message: body,
      target_booking: bookingId,
    });
    setBusy(false);
    if (createError) {
      console.error("Could not open the ticket:", createError);
      setError(t.chatSendError);
      return;
    }
    setOpen(false);
    setVersion((value) => value + 1);
    onCreated?.();
  }

  async function setStatus(ticket: SupportTicket, status: string) {
    const { error: updateError } = await supabase.from("support_tickets").update({ status, updated_at: new Date().toISOString() }).eq("id", ticket.id);
    if (updateError) {
      console.error("Could not update the ticket:", updateError);
      return;
    }
    setVersion((value) => value + 1);
  }

  return (
    <section className="tickets">
      <div className="tickets-head">
        <strong><Ticket size={17} /> {t.ticketsTitle}</strong>
        {!asTeam && <button className="button button-outline" type="button" onClick={() => setOpen((value) => !value)}>{t.ticketNew}</button>}
      </div>
      {open && (
        <form className="tickets-form" onSubmit={(event) => void create(event)}>
          <label className="owner-field">
            <span>{t.ticketCategory}</span>
            <select name="category" defaultValue={bookingId ? "booking" : "other"}>
              {TICKET_CATEGORIES.map((category) => <option key={category} value={category}>{t.ticketCategories[category]}</option>)}
            </select>
          </label>
          <label className="owner-field"><span>{t.ticketSubject}</span><input name="subject" maxLength={120} required /></label>
          <label className="owner-field"><span>{t.chatPlaceholder}</span><textarea name="body" rows={3} maxLength={2000} required /></label>
          {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
          <button className="button button-primary" type="submit" disabled={busy}>{t.ticketSubmit}</button>
        </form>
      )}
      {tickets.length > 0 && (
        <ul className="tickets-list">
          {tickets.filter((ticket) => asTeam || showDone || (ticket.status !== "resolved" && ticket.status !== "closed")).map((ticket) => (
            <li key={ticket.id}>
              <span dir="ltr">#{ticket.number}</span>
              <span className="tickets-subject">{ticket.subject} · {t.ticketCategories[ticket.category as keyof typeof t.ticketCategories]} · {dateFormat.format(new Date(ticket.created_at))}</span>
              {asTeam ? (
                <select value={ticket.status} onChange={(event) => void setStatus(ticket, event.target.value)} aria-label={t.ticketStatusLabel}>
                  {TICKET_STATUSES.map((status) => <option key={status} value={status}>{t.ticketStatus[status]}</option>)}
                </select>
              ) : (
                <span className={`status-chip is-${ticket.status === "resolved" || ticket.status === "closed" ? "paid" : "pending"}`}>{t.ticketStatus[ticket.status]}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {!asTeam && tickets.some((ticket) => ticket.status === "resolved" || ticket.status === "closed") && (
        <button className="text-button tickets-toggle" type="button" onClick={() => setShowDone((value) => !value)}>
          {showDone ? t.ticketsHideDone : t.ticketsShowDone(tickets.filter((ticket) => ticket.status === "resolved" || ticket.status === "closed").length)}
        </button>
      )}
      {!asTeam && !open && tickets.length === 0 && <p className="field-hint">{t.ticketsEmpty}</p>}
    </section>
  );
}
