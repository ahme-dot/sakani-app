"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Download, LoaderCircle } from "lucide-react";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import SakaniDate from "@/components/sakani-date";

type Summary = {
  booking_value: number;
  rent_value: number;
  guest_commissions: number;
  host_commissions: number;
  platform_commissions: number;
  deposits_held: number;
  deposits_awaiting_transfer: number;
  deposits_transferred: number;
  pending_payments: number;
  refund_requests: number;
  refunded_value: number;
  completed_bookings: number;
  running_stays?: number;
  payouts_sent?: number;
  payouts_due?: number;
  cancelled_bookings: number;
  all_bookings: number;
};

const CSV_COLUMNS = "id,created_at,status,listing_title,move_in,months,rent_amount,guest_fee,host_fee,deposit_amount,total_amount,payout_amount,guest_fee_percent,host_fee_percent,paid_at,contract_signed_at,refunded_at,refund_amount,refund_reference,paid_out_at,payout_reference";

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** A CSV cell: quoted, with quotes doubled. */
function cell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

/** Admin: money for a period. Booking value is what guests paid; only the commissions are Sakani's revenue; deposits are not revenue. */
export default function AdminFinance({ locale, supabase }: { locale: SiteLocale; supabase: SupabaseClient }) {
  const t = SITE_COPY[locale];
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG");
  const [from, setFrom] = useState(() => isoDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.rpc("admin_finance_summary", { from_date: from, to_date: to }).then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) {
        console.error("Could not load the finance summary:", loadError);
        setError(t.financeLoadError);
        return;
      }
      setError("");
      setSummary(data as Summary);
    });
    return () => {
      active = false;
    };
  }, [supabase, from, to, t]);

  async function exportCsv() {
    setExporting(true);
    const { data, error: exportError } = await supabase
      .from("listing_requests")
      .select(CSV_COLUMNS)
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59`)
      .order("created_at")
      .limit(5000);
    setExporting(false);
    if (exportError) {
      console.error("Could not export bookings:", exportError);
      setError(t.financeLoadError);
      return;
    }
    const columns = CSV_COLUMNS.split(",");
    const rows = ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => columns.map((column) => cell(row[column])).join(","));
    // The byte-order mark lets Excel open Arabic text correctly.
    const blob = new Blob([`﻿${columns.join(",")}\n${rows.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `sakani-bookings-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const egp = (value: number) => `${numberFormat.format(value)} ${t.currency}`;
  const cards: Array<{ label: string; value: string; tone?: string }> = summary ? [
    { label: t.financeBookingValue, value: egp(summary.booking_value) },
    { label: t.financePlatformCommissions, value: egp(summary.platform_commissions), tone: "is-revenue" },
    { label: t.financeGuestCommissions, value: egp(summary.guest_commissions), tone: "is-revenue" },
    { label: t.financeHostCommissions, value: egp(summary.host_commissions), tone: "is-revenue" },
    { label: t.financeDepositsHeld, value: egp(summary.deposits_held) },
    { label: t.financeDepositsAwaiting, value: numberFormat.format(summary.deposits_awaiting_transfer) },
    { label: t.financeDepositsTransferred, value: egp(summary.deposits_transferred) },
    { label: t.financePendingPayments, value: numberFormat.format(summary.pending_payments) },
    { label: t.financeRefundRequests, value: numberFormat.format(summary.refund_requests) },
    { label: t.financeRefunded, value: egp(summary.refunded_value) },
    { label: t.financePayoutsSent, value: egp(summary.payouts_sent ?? 0) },
    { label: t.financePayoutsDue, value: egp(summary.payouts_due ?? 0) },
    { label: t.financeRunningStays, value: numberFormat.format(summary.running_stays ?? 0) },
    { label: t.financeCompleted, value: numberFormat.format(summary.completed_bookings) },
    { label: t.financeCancelled, value: numberFormat.format(summary.cancelled_bookings) },
  ] : [];

  return (
    <section className="admin-finance">
      <div className="admin-users-toolbar">
        <label className="owner-field"><span>{t.financeFrom}</span><SakaniDate value={from} max={to} onChange={(event) => setFrom(event.target.value)} dir="ltr" /></label>
        <label className="owner-field"><span>{t.financeTo}</span><SakaniDate value={to} min={from} onChange={(event) => setTo(event.target.value)} dir="ltr" /></label>
        <button className="admin-btn admin-btn-ghost" type="button" disabled={exporting} onClick={() => void exportCsv()}>
          {exporting ? <LoaderCircle className="spinner" size={15} /> : <Download size={15} />} {t.financeExport}
        </button>
      </div>
      <p className="field-hint">{t.financeNote}</p>
      {error && <p className="owner-feedback owner-feedback-error admin-feedback" role="alert">{error}</p>}
      {!summary ? (
        !error && <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>
      ) : (
        <div className="admin-finance-grid">
          {cards.map((card) => (
            <div key={card.label} className={`admin-finance-card ${card.tone ?? ""}`}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
