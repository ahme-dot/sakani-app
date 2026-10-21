"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Flag, LoaderCircle } from "lucide-react";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import type { MarketplaceListing } from "@/lib/supabase/listings";

type ReportStatus = "open" | "resolved" | "dismissed";
type Report = {
  id: string;
  listing_id: string;
  reason: "scam" | "unavailable" | "wrong_info" | "inappropriate" | "other";
  details: string | null;
  contact: string | null;
  status: ReportStatus;
  created_at: string;
  properties: Pick<MarketplaceListing, "title_ar" | "title_en" | "status" | "image_url"> | null;
};

const REPORT_COLUMNS = "id,listing_id,reason,details,contact,status,created_at,properties(title_ar,title_en,status,image_url)";

export default function AdminReports({
  locale,
  supabase,
  currentUserId,
  onChanged,
  onReviewListing,
}: {
  locale: SiteLocale;
  supabase: SupabaseClient;
  currentUserId: string;
  onChanged: () => void;
  onReviewListing: (listingId: string, status: MarketplaceListing["status"]) => void;
}) {
  const t = SITE_COPY[locale];
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "medium", timeStyle: "short" });
  const reasonLabels: Record<Report["reason"], string> = {
    scam: t.reportReasonScam,
    unavailable: t.reportReasonUnavailable,
    wrong_info: t.reportReasonWrongInfo,
    inappropriate: t.reportReasonInappropriate,
    other: t.reportReasonOther,
  };

  useEffect(() => {
    let mounted = true;
    let request = supabase.from("listing_reports").select(REPORT_COLUMNS);
    request = tab === "open" ? request.eq("status", "open") : request.neq("status", "open");
    void request
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error: loadError }) => {
        if (!mounted) return;
        if (loadError) {
          console.error("Could not load reports:", loadError);
          setError(t.reportsLoadError);
          setReports([]);
        } else {
          setError("");
          setReports((data ?? []) as unknown as Report[]);
        }
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [supabase, tab, t.reportsLoadError]);

  async function setStatus(report: Report, status: ReportStatus) {
    setBusyId(report.id);
    setError("");
    const closing = status !== "open";
    const { data, error: updateError } = await supabase
      .from("listing_reports")
      .update({ status, resolved_at: closing ? new Date().toISOString() : null, resolved_by: closing ? currentUserId : null })
      .eq("id", report.id)
      .select("id");
    if (updateError || !data?.length) {
      console.error("Could not update report:", updateError ?? "no rows were updated");
      setError(t.adminUpdateError);
    } else {
      setReports((current) => current.filter((item) => item.id !== report.id));
      onChanged();
    }
    setBusyId(null);
  }

  function selectTab(next: "open" | "closed") {
    if (next === tab) return;
    setLoading(true);
    setTab(next);
  }

  return (
    <section className="admin-reports" aria-label={t.reportsTitle}>
      <div className="admin-users-toolbar">
        <div className="admin-segment" role="tablist" aria-label={t.reportsTitle}>
          <button type="button" role="tab" aria-selected={tab === "open"} className={tab === "open" ? "is-active" : ""} onClick={() => selectTab("open")}>{t.reportsOpen}</button>
          <button type="button" role="tab" aria-selected={tab === "closed"} className={tab === "closed" ? "is-active" : ""} onClick={() => selectTab("closed")}>{t.reportsClosed}</button>
        </div>
      </div>

      {error && <p className="owner-feedback owner-feedback-error admin-feedback" role="alert">{error}</p>}

      {loading ? (
        <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>
      ) : reports.length === 0 ? (
        <section className="admin-empty-state"><Flag size={26} /><p>{t.reportsEmpty}</p></section>
      ) : (
        <div className="admin-report-list">
          {reports.map((report) => {
            const listing = report.properties;
            const title = listing ? (locale === "ar" ? listing.title_ar : listing.title_en) : t.reportListingRemoved;
            const busy = busyId === report.id;
            return (
              <article className="admin-report" key={report.id}>
                <div className="admin-report-thumb">
                  {listing?.image_url && <Image src={listing.image_url} alt="" fill sizes="96px" />}
                </div>
                <div className="admin-report-body">
                  <div className="admin-report-top">
                    <span className={`report-reason report-reason-${report.reason}`}><Flag size={12} /> {reasonLabels[report.reason]}</span>
                    <time dateTime={report.created_at}>{dateFormat.format(new Date(report.created_at))}</time>
                  </div>
                  <h3>{title}</h3>
                  {report.details && <p className="admin-report-details">{report.details}</p>}
                  {report.contact && (
                    <p className="admin-report-contact"><strong>{t.reportContactLabel}:</strong> <span dir="ltr">{report.contact}</span></p>
                  )}
                  {report.status !== "open" && (
                    <span className="listing-status listing-status-approved">{report.status === "resolved" ? t.reportStatusResolved : t.reportStatusDismissed}</span>
                  )}
                  <div className="admin-card-actions">
                    {listing && (
                      <button className="admin-btn admin-btn-ghost" type="button" onClick={() => onReviewListing(report.listing_id, listing.status)}>{t.reportReviewListing}</button>
                    )}
                    {report.status === "open" ? (
                      <>
                        <button className="admin-btn admin-btn-primary" type="button" disabled={busy} onClick={() => void setStatus(report, "resolved")}>{busy ? t.sending : t.reportResolve}</button>
                        <button className="admin-btn admin-btn-ghost" type="button" disabled={busy} onClick={() => void setStatus(report, "dismissed")}>{t.reportDismiss}</button>
                      </>
                    ) : (
                      <button className="admin-btn admin-btn-ghost" type="button" disabled={busy} onClick={() => void setStatus(report, "open")}>{t.reportReopen}</button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
