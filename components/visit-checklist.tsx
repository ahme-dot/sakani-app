"use client";

import { SITE_COPY, type SiteLocale } from "@/messages/site";

const CHECKS = ["photos_match", "beds_match", "price_confirmed", "owner_identity", "building_safe"] as const;
type CheckKey = (typeof CHECKS)[number];

/**
 * Reads the visit fields rendered by <VisitChecklist /> from a form.
 * Returns null unless there is a visit date and every check is ticked —
 * "Verified" means the home passed all of them.
 */
export function readVisit(formData: FormData) {
  const date = String(formData.get("visit_date") ?? "");
  if (!date) return null;
  const checklist = Object.fromEntries(CHECKS.map((key) => [key, formData.has(`visit_${key}`)])) as Record<CheckKey, boolean>;
  if (!CHECKS.every((key) => checklist[key])) return null;
  const notes = String(formData.get("visit_notes") ?? "").trim();
  return { date, checklist, notes };
}

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** In-person visit fields: date, five required checks, and private notes (only admins can read them). */
export default function VisitChecklist({ locale }: { locale: SiteLocale }) {
  const t = SITE_COPY[locale];
  const labels: Record<CheckKey, string> = {
    photos_match: t.visitPhotosMatch,
    beds_match: t.visitBedsMatch,
    price_confirmed: t.visitPriceConfirmed,
    owner_identity: t.visitOwnerIdentity,
    building_safe: t.visitBuildingSafe,
  };
  const today = todayIso();

  return (
    <div className="visit-checklist">
      <p className="field-hint">{t.visitIntro}</p>
      <label className="owner-field visit-date">
        <span>{t.visitDate}</span>
        <input name="visit_date" type="date" required max={today} defaultValue={today} dir="ltr" />
      </label>
      <div className="visit-checks" role="group" aria-label={t.visitChecksLabel}>
        {CHECKS.map((key) => (
          <label className="visit-check" key={key}>
            <input type="checkbox" name={`visit_${key}`} />
            <span>{labels[key]}</span>
          </label>
        ))}
      </div>
      <label className="owner-field">
        <span>{t.visitNotes}</span>
        <textarea name="visit_notes" rows={2} maxLength={1000} placeholder={t.visitNotesPlaceholder} />
      </label>
    </div>
  );
}
