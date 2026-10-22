"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ImagePlus } from "lucide-react";
import VisitChecklist, { readVisit } from "@/components/visit-checklist";
import { areas, universities } from "@/lib/data";
import { compressImage, storagePathFromPublicUrl } from "@/lib/images";
import { listingImages, type MarketplaceListing } from "@/lib/supabase/listings";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

const STORAGE_BUCKET = "sakani-listings";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGES = 6;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type EditableListing = Omit<MarketplaceListing, "owner_id">;

type Props = {
  locale: SiteLocale;
  supabase: SupabaseClient;
  /** Account the listing belongs to; photos are stored under this id. */
  ownerId: string;
  editing?: EditableListing | null;
  /** "admin" adds Publish now / visited-and-verified options and skips owner review. */
  mode?: "owner" | "admin";
  onSaved: (result: { created: boolean; listingId: string }) => void | Promise<void>;
  onCancel?: () => void;
};

export async function removeListingImages(supabase: SupabaseClient, urls: string[]) {
  const paths = urls.map((url) => storagePathFromPublicUrl(url, STORAGE_BUCKET)).filter((path): path is string => Boolean(path));
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
  if (error) console.error("Could not remove listing images:", error);
}

/** The six-section listing form shared by the owner portal and the admin "Add listing" view. */
export default function ListingForm({ locale, supabase, ownerId, editing = null, mode = "owner", onSaved, onCancel }: Props) {
  const t = SITE_COPY[locale];
  const isAdmin = mode === "admin";
  const [submitting, setSubmitting] = useState(false);
  const [busyText, setBusyText] = useState("");
  const [error, setError] = useState("");
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [visited, setVisited] = useState(false);

  useEffect(() => {
    return () => {
      imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imagePreviews]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const selectedImages = formData.getAll("images").filter((value): value is File => value instanceof File && value.size > 0);

    if (!editing && selectedImages.length === 0) {
      setError(t.imageError);
      return;
    }
    if (selectedImages.length > MAX_IMAGES) {
      setError(t.tooManyPhotos);
      return;
    }
    if (selectedImages.some((file) => !ALLOWED_IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_SIZE)) {
      setError(t.imageError);
      return;
    }
    if (Number(formData.get("available_beds")) > Number(formData.get("total_beds"))) {
      setError(t.bedsError);
      return;
    }
    const visit = isAdmin && visited ? readVisit(formData) : null;
    if (isAdmin && visited && !visit) {
      setError(t.visitIncomplete);
      return;
    }

    setSubmitting(true);
    let imageUrls = editing ? listingImages(editing) : [];
    const uploadedPaths: string[] = [];

    if (selectedImages.length > 0) {
      setBusyText(t.preparingPhotos);
      const compressed = await Promise.all(selectedImages.map(compressImage));
      setBusyText(t.submitting);

      for (const file of compressed) {
        const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        const imagePath = `${ownerId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(imagePath, file, {
          cacheControl: "31536000",
          contentType: file.type,
          upsert: false,
        });
        if (uploadError) {
          console.error("Could not upload listing image:", uploadError);
          if (uploadedPaths.length) await supabase.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
          setError(t.formError);
          setSubmitting(false);
          setBusyText("");
          return;
        }
        uploadedPaths.push(imagePath);
      }
      imageUrls = uploadedPaths.map((path) => supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl);
    }

    // Owners write the title and description once, in either language; both language versions show the same text.
    const title = String(formData.get("title")).trim();
    const description = String(formData.get("description")).trim();
    const values = {
      title_ar: title,
      title_en: title,
      description_ar: description,
      description_en: description,
      area: String(formData.get("area")),
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
      image_url: imageUrls[0],
      image_urls: imageUrls,
      // New listings always start pending (database rule); admins publish right after saving.
      status: "pending" as const,
    };
    const publishNow = isAdmin && formData.has("publish_now");

    const { data: saved, error: saveError } = editing
      ? await supabase.from("properties").update(values).eq("id", editing.id).select("id")
      : await supabase.from("properties").insert({ ...values, owner_id: ownerId }).select("id");

    if (saveError || !saved?.length) {
      console.error("Could not save listing:", saveError ?? "no rows were saved");
      if (uploadedPaths.length) await supabase.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
      setError(saveError?.message.includes("listing_rate_limit") ? t.rateLimitError : t.formError);
      setSubmitting(false);
      setBusyText("");
      return;
    }

    const listingId = (saved[0] as { id: string }).id;
    if (publishNow) {
      const { data: published, error: publishError } = await supabase
        .from("properties")
        .update({ status: "approved", rejection_reason: null })
        .eq("id", listingId)
        .select("id");
      if (publishError || !published?.length) {
        console.error("Listing saved but could not be published:", publishError ?? "no rows were updated");
        setError(t.adminUpdateError);
      }
    }
    if (visit) {
      const { error: verifyError } = await supabase.rpc("admin_verify_listing", {
        target_listing: listingId,
        visit_date: visit.date,
        visit_checklist: visit.checklist,
        visit_notes: visit.notes,
      });
      if (verifyError) {
        console.error("Listing saved but the visit could not be recorded:", verifyError);
        setError(t.visitSaveError);
      }
    }

    if (editing && uploadedPaths.length) await removeListingImages(supabase, listingImages(editing));
    form.reset();
    setImagePreviews([]);
    setVisited(false);
    setSubmitting(false);
    setBusyText("");
    await onSaved({ created: !editing, listingId });
  }

  return (
    <form className="owner-form" id="owner-form" onSubmit={submit}>
      <fieldset className="form-section">
        <legend><span className="form-step">1</span> {t.formSectionHome}</legend>
        <label className="owner-field">
          <span>{t.listingTitle}</span>
          <input name="title" required minLength={5} maxLength={120} placeholder={t.listingTitlePlaceholder} defaultValue={editing ? (locale === "ar" ? editing.title_ar : editing.title_en) : undefined} />
        </label>
        <label className="owner-field">
          <span>{t.listingDescription}</span>
          <textarea name="description" required minLength={20} rows={4} maxLength={2000} placeholder={t.descriptionPlaceholder} defaultValue={editing ? (locale === "ar" ? editing.description_ar : editing.description_en) : undefined} />
          <small className="field-hint">{t.anyLanguageHint}</small>
        </label>
        <div className="owner-form-grid">
          <div className="owner-field" role="radiogroup" aria-label={t.propertyType}>
            <span>{t.propertyType}</span>
            <div className="choice-row">
              {(["room", "apartment", "bed"] as const).map((type) => (
                <label className="choice" key={type}>
                  <input type="radio" name="property_type" value={type} required defaultChecked={(editing?.property_type ?? "room") === type} />
                  <span>{t[type]}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="owner-field" role="radiogroup" aria-label={t.adminDetailsGender}>
            <span>{t.adminDetailsGender}</span>
            <div className="choice-row">
              {(["female", "male", "mixed"] as const).map((gender) => (
                <label className="choice" key={gender}>
                  <input type="radio" name="gender" value={gender} required defaultChecked={editing?.gender === gender} />
                  <span>{t[gender]}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend><span className="form-step">2</span> {t.formSectionLocation}</legend>
        <div className="owner-form-grid owner-form-grid-three">
          <label className="owner-field"><span>{t.area}</span><select name="area" required defaultValue={editing?.area ?? ""}><option value="" disabled>{t.chooseArea}</option>{areas.map((area) => <option key={area.id} value={area.name_en}>{locale === "ar" ? area.name : area.name_en}</option>)}</select></label>
          <label className="owner-field"><span>{t.university}</span><select name="university" required defaultValue={editing?.university ?? ""}><option value="" disabled>{t.chooseUniversity}</option>{universities.map((university) => <option key={university.id} value={university.name_en}>{locale === "ar" ? university.name : university.name_en}</option>)}</select></label>
          <label className="owner-field"><span>{t.walkingDistance}</span><input name="walking_distance_minutes" type="number" inputMode="numeric" min="0" max="300" defaultValue={editing?.walking_distance_minutes ?? 0} required /></label>
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend><span className="form-step">3</span> {t.formSectionPrice}</legend>
        <div className="owner-form-grid">
          <label className="owner-field"><span>{t.price}</span><input name="monthly_price" type="number" inputMode="numeric" min="1" max="1000000" required defaultValue={editing?.monthly_price} /></label>
          <label className="owner-field"><span>{t.deposit}</span><input name="deposit" type="number" inputMode="numeric" min="0" max="1000000" defaultValue={editing?.deposit ?? 0} required /></label>
          <label className="owner-field"><span>{t.availableBeds}</span><input name="available_beds" type="number" inputMode="numeric" min="1" max="100" defaultValue={editing?.available_beds ?? 1} required /></label>
          <label className="owner-field"><span>{t.totalBeds}</span><input name="total_beds" type="number" inputMode="numeric" min="1" max="100" defaultValue={editing?.total_beds ?? 1} required /></label>
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend><span className="form-step">4</span> {t.amenitiesTitle}</legend>
        <div className="choice-row">
          {([
            ["furnished", t.furnished],
            ["wifi", t.wifi],
            ["air_conditioning", t.airConditioning],
            ["security", t.secure],
          ] as const).map(([name, label]) => (
            <label className="choice" key={name}>
              <input name={name} type="checkbox" defaultChecked={editing?.[name]} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend><span className="form-step">5</span> {t.formSectionPhotos}</legend>
        <label className="photo-drop">
          <ImagePlus size={24} />
          <strong>{t.photosDrop}</strong>
          <small>{editing ? t.keepPhotosHint : t.photosHint}</small>
          <input
            name="images"
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(",")}
            multiple
            required={!editing}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []).slice(0, MAX_IMAGES);
              setImagePreviews(files.map((file) => URL.createObjectURL(file)));
            }}
          />
        </label>
        {(imagePreviews.length > 0 || editing) && (
          <div className="owner-image-previews">
            {(imagePreviews.length > 0 ? imagePreviews : listingImages(editing!)).map((src, index) => (
              <Image key={src} className="owner-image-preview" src={src} alt={t.photoAlt(t.listingPhoto, index + 1)} width={160} height={110} unoptimized={src.startsWith("blob:")} />
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="form-section">
        <legend><span className="form-step">6</span> {t.formSectionContact}</legend>
        <label className="owner-field"><span>{isAdmin ? t.ownerWhatsapp : t.phoneNumber}</span><input name="whatsapp_number" type="tel" inputMode="tel" autoComplete={isAdmin ? "off" : "tel"} pattern="[0-9+ \(\)\-]{8,20}" placeholder={t.whatsappHint} required dir="ltr" defaultValue={editing?.whatsapp_number} /></label>
      </fieldset>

      {isAdmin && (
        <fieldset className="form-section form-section-admin">
          <legend><span className="form-step">7</span> {t.adminPublishSection}</legend>
          <div className="choice-row">
            <label className="choice">
              <input name="publish_now" type="checkbox" defaultChecked />
              <span>{t.adminPublishNow}</span>
            </label>
            <label className="choice">
              <input type="checkbox" checked={visited} onChange={(event) => setVisited(event.target.checked)} />
              <span>{t.adminVisitedToggle}</span>
            </label>
          </div>
          {visited && <VisitChecklist locale={locale} />}
        </fieldset>
      )}

      {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
      <div className="owner-form-actions">
        <button className="button button-primary owner-submit" type="submit" disabled={submitting}>
          {submitting ? busyText || t.submitting : editing ? t.saveChanges : isAdmin ? t.adminAddListingSubmit : t.submitListing}
        </button>
        {onCancel && <button className="signout-button" type="button" disabled={submitting} onClick={onCancel}>{t.cancel}</button>}
      </div>
    </form>
  );
}
