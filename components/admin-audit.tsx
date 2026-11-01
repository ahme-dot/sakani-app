"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LoaderCircle, ScrollText } from "lucide-react";
import { DOCUMENTS_COPY } from "@/messages/documents";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type AuditEntry = {
  id: number;
  at: string;
  actor: string | null;
  entity: string;
  entity_id: string | null;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

const ENTITIES = ["", "listing_requests", "rental_fees", "deposit_transfers", "contract_acceptances", "cancellation_requests", "app_settings"] as const;
// The fields worth showing when they change; the full rows stay in the database.
const WATCHED = ["status", "amount", "total_amount", "deposit_amount", "host_decision", "fee_percent", "student_fee_percent", "reference", "refund_reference", "payout_reference", "transfer_reference", "contract_signed_at", "document", "document_version", "party", "scenario", "decision", "slug"];
const ISO_TIME = /^d{4}-d{2}-d{2}Td{2}:d{2}/;

/** Admin: the append-only record of every money change (bookings, payments, deposits, fee settings). */
export default function AdminAudit({ locale, supabase }: { locale: SiteLocale; supabase: SupabaseClient }) {
  const t = SITE_COPY[locale];
  const timeFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "medium", timeStyle: "medium" });
  const [entity, setEntity] = useState<(typeof ENTITIES)[number]>("");
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    let query = supabase.from("audit_logs").select("id,at,actor,entity,entity_id,action,old_data,new_data").order("at", { ascending: false }).limit(200);
    if (entity) query = query.eq("entity", entity);
    void query.then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error("Could not load the audit log:", error);
        setFailed(true);
        return;
      }
      const rows = (data ?? []) as AuditEntry[];
      setEntries(rows);
      // Who made each change, by name rather than an id.
      const actors = [...new Set(rows.map((row) => row.actor).filter((actor): actor is string => Boolean(actor)))];
      if (actors.length) {
        void supabase.from("profiles").select("id,full_name").in("id", actors).then(({ data: people }) => {
          if (active) setNames(Object.fromEntries((people ?? []).map((person: { id: string; full_name: string | null }) => [person.id, person.full_name ?? ""])));
        });
      }
    });
    return () => {
      active = false;
    };
  }, [supabase, entity]);

  // Field names and statuses in words; amounts and references as they are.
  const statusWord = (entity: string, value: unknown) => {
    const map: Record<string, string> = entity === "rental_fees" ? t.feeStatus : entity === "listing_requests" ? t.adminBookingTabs : {};
    return typeof value === "string" ? map[value] ?? value : String(value ?? "—");
  };
  const documents = DOCUMENTS_COPY[locale].titles as Record<string, string>;
  const show = (entry: AuditEntry, key: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return "—";
    if (key === "status") return statusWord(entry.entity, value);
    if (key === "host_decision") return t.hostDecisionAdmin[value as keyof typeof t.hostDecisionAdmin] ?? String(value);
    if (key === "document") return documents[String(value)] ?? String(value);
    if (key === "party") return value === "host" ? t.roleHost : t.roleGuest;
    if (typeof value === "string" && ISO_TIME.test(value)) return timeFormat.format(new Date(value));
    if (typeof value === "number") return new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG").format(value);
    return String(value);
  };
  const changes = (entry: AuditEntry) =>
    WATCHED.filter((key) => (entry.old_data?.[key] ?? null) !== (entry.new_data?.[key] ?? null) && (entry.new_data?.[key] !== undefined || entry.old_data?.[key] !== undefined))
      .map((key) => ({ key, label: t.auditFields[key as keyof typeof t.auditFields] ?? key, from: show(entry, key, entry.old_data?.[key]), to: show(entry, key, entry.new_data?.[key]) }));

  if (failed) return <p className="owner-feedback owner-feedback-error">{t.auditLoadError}</p>;

  return (
    <section className="admin-audit">
      <div className="admin-segment" role="tablist" aria-label={t.adminViewAudit}>
        {ENTITIES.map((value) => (
          <button key={value || "all"} type="button" role="tab" aria-selected={entity === value} className={entity === value ? "is-active" : ""} onClick={() => { setEntries(null); setEntity(value); }}>
            {value ? t.auditEntities[value] : t.usersFilterAll}
          </button>
        ))}
      </div>
      {entries === null ? (
        <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>
      ) : entries.length === 0 ? (
        <section className="admin-empty-state"><ScrollText size={26} /><p>{t.auditEmpty}</p></section>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">{t.auditTime}</th>
                <th scope="col">{t.auditWhat}</th>
                <th scope="col">{t.auditChange}</th>
                <th scope="col">{t.auditBy}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="admin-audit-time">{timeFormat.format(new Date(entry.at))}</td>
                  <td>{t.auditEntities[entry.entity as keyof typeof t.auditEntities] ?? entry.entity} · {t.auditActions[entry.action as keyof typeof t.auditActions] ?? entry.action}<br /><small dir="ltr" className="admin-audit-id">#{entry.entity_id?.slice(0, 8)}</small></td>
                  <td className="admin-audit-change">
                    {changes(entry).length === 0 ? "—" : (
                      <ul>
                        {/* Each value is isolated so numbers and codes keep their direction in Arabic lines. */}
                        {changes(entry).map((change) => (
                          <li key={change.key}>
                            <span>{change.label}:</span>{" "}
                            {change.from !== "—" && <><bdi>{change.from}</bdi> {locale === "ar" ? "←" : "→"} </>}
                            <bdi><strong>{change.to}</strong></bdi>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td><small>{entry.actor ? names[entry.actor] || t.auditSomeone : t.auditSystem}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
