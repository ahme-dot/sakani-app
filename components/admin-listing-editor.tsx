"use client";

import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GOVERNORATES, OTHER_UNIVERSITY, UNIVERSITIES, areaLabel, normalizeArea, universityLabel } from "@/lib/egypt";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import type { MarketplaceListing } from "@/lib/supabase/listings";

type AdminListing = Omit<MarketplaceListing, "owner_id">;

type Props = {
  locale: SiteLocale;
  supabase: SupabaseClient;
  listing: AdminListing;
  columns: string;
  onSaved: (listing: AdminListing) => void;
  onCancel: () => void;
};

/** Inline admin form for correcting a listing's details without changing its review status. */
export default function AdminListingEditor({ locale, supabase, listing, columns, onSaved, onCancel }: Props) {
  const t = SITE_COPY[locale];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (Number(formData.get("available_beds")) > Number(formData.get("total_beds"))) {
      setError(t.bedsError);
      return;
    }

    setSaving(true);
    setError("");
    const values = {
      title_ar: String(formData.get("title_ar")).trim(),
      title_en: String(formData.get("title_en")).trim(),
      description_ar: String(formData.get("description_ar")).trim(),
      description_en: String(formData.get("description_en")).trim(),
      governorate: String(formData.get("governorate")),
      area: normalizeArea(String(formData.get("area"))),
      university: String(formData.get("university")),
      gender: String(formData.get("gender")),
      property_type: String(formData.get("property_type")),
      monthly_price: Number(formData.get("monthly_price")),
      deposit: Number(formData.get("deposit")),
      available_beds: Number(formData.get("available_beds")),
      total_beds: Number(formData.get("total_beds")),
      walking_distance_minutes: Number(formData.get("walking_distance_minutes")),
      whatsapp_number: String(formData.get("whatsapp_number")).trim(),
      furnished: formData.has("furnished"),
      wifi: formData.has("wifi"),
      air_conditioning: formData.has("air_conditioning"),
      security: formData.has("security"),
    };

    const { data, error: saveError } = await supabase.from("properties").update(values).eq("id", listing.id).select(columns);
    // Row-level security silently skips rows the user may not update, so an empty result is also a failure.
    if (saveError || !data?.length) {
      console.error("Could not save admin listing edits:", saveError ?? "no rows were updated");
      setError(t.adminUpdateError);
      setSaving(false);
      return;
    }
    // The number is a private column, so it is not returned; keep the value that was just saved.
    onSaved({ ...(data[0] as unknown as AdminListing), whatsapp_number: values.whatsapp_number });
  }

  return (
    <form className="owner-form admin-edit-form" onSubmit={save}>
      <div>
        <h2>{t.adminEditTitle}</h2>
        <p className="field-hint">{t.adminEditHint}</p>
        <p className="field-hint">{t.adminTranslateHint}</p>
      </div>
      <div className="owner-form-grid">
        <label className="owner-field"><span>{t.titleArabic}</span><input name="title_ar" required minLength={5} maxLength={120} dir="rtl" defaultValue={listing.title_ar} /></label>
        <label className="owner-field"><span>{t.titleEnglish}</span><input name="title_en" required minLength={5} maxLength={120} dir="ltr" defaultValue={listing.title_en} /></label>
      </div>
      <div className="owner-form-grid">
        <label className="owner-field"><span>{t.descriptionArabic}</span><textarea name="description_ar" required minLength={20} rows={4} maxLength={2000} dir="rtl" defaultValue={listing.description_ar} /></label>
        <label className="owner-field"><span>{t.descriptionEnglish}</span><textarea name="description_en" required minLength={20} rows={4} maxLength={2000} dir="ltr" defaultValue={listing.description_en} /></label>
      </div>
      <div className="owner-form-grid owner-form-grid-three">
        <label className="owner-field"><span>{t.governorate}</span><select name="governorate" required defaultValue={listing.governorate || "Giza"}>{GOVERNORATES.map((item) => <option key={item.id} value={item.name_en}>{locale === "ar" ? item.name : item.name_en}</option>)}</select></label>
        <label className="owner-field"><span>{t.area}</span><input name="area" required minLength={2} maxLength={60} defaultValue={areaLabel(locale, listing.area)} /></label>
        <label className="owner-field"><span>{t.university}</span><select name="university" required defaultValue={listing.university}>{!UNIVERSITIES.some((university) => university.name_en === listing.university) && listing.university !== OTHER_UNIVERSITY && <option value={listing.university}>{listing.university}</option>}{UNIVERSITIES.map((university) => <option key={university.name_en} value={university.name_en}>{locale === "ar" ? university.name : university.name_en}</option>)}<option value={OTHER_UNIVERSITY}>{universityLabel(locale, OTHER_UNIVERSITY)}</option></select></label>
      </div>
      <div className="owner-form-grid owner-form-grid-three">
        <label className="owner-field"><span>{t.housing}</span><select name="gender" required defaultValue={listing.gender}><option value="female">{t.female}</option><option value="male">{t.male}</option><option value="mixed">{t.mixed}</option></select></label>
      </div>
      <div className="owner-form-grid owner-form-grid-three">
        <label className="owner-field"><span>{t.propertyType}</span><select name="property_type" required defaultValue={listing.property_type}><option value="room">{t.room}</option><option value="apartment">{t.apartment}</option><option value="bed">{t.bed}</option></select></label>
        <label className="owner-field"><span>{t.price}</span><input name="monthly_price" type="number" min="1" max="1000000" required defaultValue={listing.monthly_price} /></label>
        <label className="owner-field"><span>{t.deposit}</span><input name="deposit" type="number" min="0" max="1000000" required defaultValue={listing.deposit} /></label>
      </div>
      <div className="owner-form-grid owner-form-grid-three">
        <label className="owner-field"><span>{t.availableBeds}</span><input name="available_beds" type="number" min="1" max="100" required defaultValue={listing.available_beds} /></label>
        <label className="owner-field"><span>{t.totalBeds}</span><input name="total_beds" type="number" min="1" max="100" required defaultValue={listing.total_beds} /></label>
        <label className="owner-field"><span>{t.walkingDistance}</span><input name="walking_distance_minutes" type="number" min="0" max="300" required defaultValue={listing.walking_distance_minutes} /></label>
      </div>
      <label className="owner-field"><span>{t.phoneNumber}</span><input name="whatsapp_number" type="tel" inputMode="tel" pattern="[0-9+ \(\)\-]{8,20}" required dir="ltr" defaultValue={listing.whatsapp_number} /></label>
      <fieldset className="amenity-fieldset">
        <legend>{t.amenitiesTitle}</legend>
        <div className="choice-row">
          {([["furnished", t.furnished], ["wifi", t.wifi], ["air_conditioning", t.airConditioning], ["security", t.secure]] as const).map(([name, label]) => (
            <label className="choice" key={name}>
              <input name={name} type="checkbox" defaultChecked={listing[name]} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
      <div className="admin-listing-actions">
        <button className="button button-primary owner-submit" type="submit" disabled={saving}>{saving ? t.sending : t.adminSaveEdit}</button>
        <button className="signout-button" type="button" disabled={saving} onClick={onCancel}>{t.cancel}</button>
      </div>
    </form>
  );
}
