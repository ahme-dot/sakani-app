"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarCheck, CheckCircle2, ExternalLink, LoaderCircle, MessageCircle, Phone, RotateCcw, X } from "lucide-react";
import { isMissingFunction } from "@/lib/payments";
import { listingPath, whatsappLink } from "@/lib/site";
import { fetchPrivateContacts, listingRef } from "@/lib/supabase/listings";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type RequestStatus = "new" | "contacted" | "visit" | "rented" | "closed";
type ListingRequest = {
  id: string;
  listing_id: string | null;
  listing_title: string;
  name: string;
  contact: string;
  preferred_time: string | null;
  note: string | null;
  locale: SiteLocale;
  status: RequestStatus;
  created_at: string;
};

const TABS: RequestStatus[] = ["new", "contacted", "visit", "rented", "closed"];
const REQUEST_COLUMNS = "id,listing_id,listing_title,name,contact,preferred_time,note,locale,status,created_at";

/** Admin: student visit requests. The team contacts the owner and the student; "Rented" creates both fees. */
export default function AdminRequests({ locale, supabase, onChanged }: { locale: SiteLocale; supabase: SupabaseClient; onChanged: () => void }) {
  const t = SITE_COPY[locale];
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG");
  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "medium", timeStyle: "short" });
  const [ready, setReady] = useState<boolean | null>(null);
  const [requests, setRequests] = useState<ListingRequest[]>([]);
  const [ownerNumbers, setOwnerNumbers] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<RequestStatus>("new");
  const [version, setVersion] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    void supabase
      .from("listing_requests")
      .select(REQUEST_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(async ({ data, error: loadError }) => {
        if (!mounted) return;
        if (loadError) {
          if (!isMissingFunction(loadError)) console.error("Could not load requests:", loadError);
          setReady(false);
          return;
        }
        const rows = (data ?? []) as ListingRequest[];
        setRequests(rows);
        setReady(true);
        const ids = [...new Set(rows.map((row) => row.listing_id).filter((id): id is string => Boolean(id)))];
        const numbers = await fetchPrivateContacts(supabase, ids);
        if (mounted) setOwnerNumbers(numbers);
      });
    return () => {
      mounted = false;
    };
  }, [supabase, version]);

  async function setStatus(request: ListingRequest, status: RequestStatus) {
    setBusyId(request.id);
    setError("");
    setMessage("");
    const { error: updateError } = await supabase.from("listing_requests").update({ status }).eq("id", request.id);
    setBusyId(null);
    if (updateError) {
      console.error("Could not update request:", updateError);
      setError(t.adminUpdateError);
      return;
    }
    setVersion((value) => value + 1);
    onChanged();
  }

  async function markRented(request: ListingRequest) {
    setBusyId(request.id);
    setError("");
    setMessage("");
    const { data, error: closeError } = await supabase.rpc("admin_close_request", { target_request: request.id });
    setBusyId(null);
    if (closeError) {
      console.error("Could not close request:", closeError);
      setError(t.adminUpdateError);
      return;
    }
    const fees = data as { owner_fee: number; student_fee: number };
    setMessage(t.requestRentedDone(numberFormat.format(fees.owner_fee), numberFormat.format(fees.student_fee)));
    setVersion((value) => value + 1);
    onChanged();
  }

  if (ready === null) return <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>;
  if (!ready) return <p className="owner-feedback owner-feedback-error">{t.requestsMigration}</p>;

  const visible = requests.filter((request) => request.status === tab);

  return (
    <div className="admin-requests">
      <div className="admin-segment" role="tablist" aria-label={t.adminViewRequests}>
        {TABS.map((status) => (
          <button key={status} type="button" role="tab" aria-selected={tab === status} className={tab === status ? "is-active" : ""} onClick={() => setTab(status)}>
            {t.requestStatus[status]} <span>{numberFormat.format(requests.filter((request) => request.status === status).length)}</span>
          </button>
        ))}
      </div>

      {message && <p className="owner-feedback owner-feedback-success admin-feedback" role="status">{message}</p>}
      {error && <p className="owner-feedback owner-feedback-error admin-feedback" role="alert">{error}</p>}

      {visible.length === 0 ? (
        <section className="admin-empty-state"><CalendarCheck size={26} /><p>{t.requestsEmpty}</p></section>
      ) : (
        <div className="admin-fee-list">
          {visible.map((request) => {
            const ownerNumber = request.listing_id ? ownerNumbers[request.listing_id] : undefined;
            const busy = busyId === request.id;
            return (
              <article className="admin-fee admin-request" key={request.id}>
                <div className="admin-fee-main">
                  <strong>{request.listing_title}</strong>
                  <span>
                    {request.listing_id && <span dir="ltr">{listingRef(request.listing_id)}</span>}
                    {request.listing_id && <> · <Link href={listingPath(locale, request.listing_id)} target="_blank"><ExternalLink size={12} /> {t.adminViewPublic}</Link></>}
                  </span>
                  <small>{dateFormat.format(new Date(request.created_at))}</small>
                </div>
                <dl className="admin-fee-ref">
                  <div><dt>{t.requestStudent}</dt><dd>{request.name} · <span dir="ltr">{request.contact}</span></dd></div>
                  {request.preferred_time && <div><dt>{t.requestPreferred}</dt><dd>{request.preferred_time}</dd></div>}
                  {request.note && <div><dt>{t.requestNote}</dt><dd>{request.note}</dd></div>}
                  <div><dt>{t.requestOwner}</dt><dd dir="ltr">{ownerNumber ?? "…"}</dd></div>
                </dl>
                <div className="admin-card-actions">
                  <a className="admin-btn admin-btn-ghost" href={whatsappLink(request.contact)} target="_blank" rel="noreferrer"><MessageCircle size={15} /> {t.requestStudent}</a>
                  {ownerNumber && <a className="admin-btn admin-btn-ghost" href={whatsappLink(ownerNumber)} target="_blank" rel="noreferrer"><Phone size={15} /> {t.requestOwner}</a>}
                  {request.status === "new" && <button className="admin-btn admin-btn-ghost" type="button" disabled={busy} onClick={() => void setStatus(request, "contacted")}>{t.markContacted}</button>}
                  {(request.status === "new" || request.status === "contacted") && <button className="admin-btn admin-btn-ghost" type="button" disabled={busy} onClick={() => void setStatus(request, "visit")}><CalendarCheck size={15} /> {t.markVisit}</button>}
                  {request.status !== "rented" && request.status !== "closed" && request.listing_id && (
                    <button className="admin-btn admin-btn-primary" type="button" disabled={busy} onClick={() => void markRented(request)}><CheckCircle2 size={15} /> {t.markRented}</button>
                  )}
                  {request.status !== "closed" && request.status !== "rented" && <button className="admin-btn admin-btn-ghost" type="button" disabled={busy} onClick={() => void setStatus(request, "closed")}><X size={15} /> {t.markClosed}</button>}
                  {request.status === "closed" && <button className="admin-btn admin-btn-ghost" type="button" disabled={busy} onClick={() => void setStatus(request, "new")}><RotateCcw size={15} /> {t.reopenRequest}</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
