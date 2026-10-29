"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Armchair, ArrowLeft, ArrowRight, BedSingle, Building2, DoorOpen, ImagePlus, Mars, Pencil, ShieldCheck, Snowflake, Venus, Wifi } from "lucide-react";
import VisitChecklist, { readVisit } from "@/components/visit-checklist";
import { GOVERNORATES, areaLabel, areaSuggestions, normalizeArea, placeLabel } from "@/lib/egypt";
import { compressImage, storagePathFromPublicUrl } from "@/lib/images";
import { DEFAULT_PAYMENT_SETTINGS, fetchPaymentSettings, successFee, type PaymentSettings } from "@/lib/payments";
import { listingImages, type MarketplaceListing } from "@/lib/supabase/listings";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

const STORAGE_BUCKET = "sakani-listings";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGES = 6;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const DRAFT_KEY = "sakani-listing-draft";

/** Airbnb-style flow: three stages, one question per screen. */
const STEPS = ["type", "location", "beds", "amenities", "photos", "text", "price", "contact", "review"] as const;
type StepId = (typeof STEPS)[number];
const STAGE_OF: Record<StepId, number> = { type: 0, location: 0, beds: 0, amenities: 1, photos: 1, text: 1, price: 2, contact: 2, review: 2 };
const STAGE_START = [0, 3, 6];

const AMENITIES = [
  ["wifi", Wifi],
  ["air_conditioning", Snowflake],
  ["security", ShieldCheck],
] as const;
const TYPE_ICONS = { room: DoorOpen, studio: Armchair, apartment: Building2, bed: BedSingle } as const;
const GENDER_ICONS = { male: Mars, female: Venus } as const;

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

type Draft = { step: number; values: Record<string, string | string[]> };

/** The owner's unfinished listing (text only, not photos), kept in this browser so they can finish later. */
function readDraft(): Draft | null {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage blocked: nothing to clear.
  }
}

/** Form values as plain data; checkboxes and radios that share a name are collected. */
function formValues(form: HTMLFormElement) {
  const values: Record<string, string | string[]> = {};
  new FormData(form).forEach((value, key) => {
    if (typeof value !== "string") return;
    const previous = values[key];
    values[key] = previous === undefined ? value : ([] as string[]).concat(previous, value);
  });
  return values;
}

export async function removeListingImages(supabase: SupabaseClient, urls: string[]) {
  const paths = urls.map((url) => storagePathFromPublicUrl(url, STORAGE_BUCKET)).filter((path): path is string => Boolean(path));
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
  if (error) console.error("Could not remove listing images:", error);
}

/** The step-by-step listing form shared by the owner portal and the admin "Add listing" view. */
export default function ListingForm({ locale, supabase, ownerId, editing = null, mode = "owner", onSaved, onCancel }: Props) {
  const t = SITE_COPY[locale];
  const isAdmin = mode === "admin";
  const formRef = useRef<HTMLFormElement>(null);
  // New owner listings remember what was typed; editing and admin forms start from the listing or empty.
  const [draft] = useState<Draft | null>(() => (!editing && !isAdmin ? readDraft() : null));
  const saved = draft?.values ?? {};
  const text = (name: string) => (typeof saved[name] === "string" ? (saved[name] as string) : undefined);
  const [step, setStep] = useState(() => Math.min(draft?.step ?? 0, STEPS.length - 2));
  const [reached, setReached] = useState(() => (editing || isAdmin ? STEPS.length - 1 : Math.min(draft?.step ?? 0, STEPS.length - 2)));
  const [submitting, setSubmitting] = useState(false);
  const [busyText, setBusyText] = useState("");
  const [error, setError] = useState("");
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [visited, setVisited] = useState(false);
  const [summary, setSummary] = useState<Record<string, string | string[]>>({});
  const [price, setPrice] = useState(String(editing?.monthly_price ?? text("monthly_price") ?? ""));
  const [fees, setFees] = useState<PaymentSettings | null>(null);
  // Chosen governorate: narrows the neighbourhood suggestions.
  const [governorate, setGovernorate] = useState(editing?.governorate ?? text("governorate") ?? "");
  const current: StepId = STEPS[step];
  const isLast = step === STEPS.length - 1;

  useEffect(() => {
    return () => {
      imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imagePreviews]);

  useEffect(() => {
    if (isAdmin) return;
    let mounted = true;
    void fetchPaymentSettings(supabase).then((loaded) => {
      if (mounted) setFees(loaded ?? DEFAULT_PAYMENT_SETTINGS);
    });
    return () => {
      mounted = false;
    };
  }, [isAdmin, supabase]);

  function saveDraft(nextStep = step) {
    if (editing || isAdmin || !formRef.current) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ step: nextStep, values: formValues(formRef.current) }));
    } catch {
      // Storage blocked: the form still works, it just won't be remembered.
    }
  }

  /** Checks one screen. Shows the browser's message on the first problem; returns false if something is missing. */
  function checkStep(index: number, report: boolean) {
    const form = formRef.current;
    if (!form) return false;
    const section = form.querySelector<HTMLElement>(`[data-step="${STEPS[index]}"]`);
    const fields = Array.from(section?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea") ?? []);
    const invalid = fields.find((field) => !field.checkValidity());
    if (invalid) {
      if (report) invalid.reportValidity();
      return false;
    }
    const data = new FormData(form);
    if (STEPS[index] === "beds" && Number(data.get("available_beds")) > Number(data.get("total_beds"))) {
      if (report) setError(t.bedsError);
      return false;
    }
    if (STEPS[index] === "photos") {
      const files = data.getAll("images").filter((value): value is File => value instanceof File && value.size > 0);
      if ((!editing && files.length === 0) || files.some((file) => !ALLOWED_IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_SIZE)) {
        if (report) setError(t.imageError);
        return false;
      }
      if (files.length > MAX_IMAGES) {
        if (report) setError(t.tooManyPhotos);
        return false;
      }
    }
    return true;
  }

  function goTo(index: number) {
    setError("");
    if (STEPS[index] === "review" && formRef.current) setSummary(formValues(formRef.current));
    setStep(index);
    setReached((value) => Math.max(value, index));
    saveDraft(Math.min(index, STEPS.length - 2));
    formRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function next() {
    setError("");
    if (checkStep(step, true)) goTo(step + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Enter in a field moves to the next screen until the review.
    if (!isLast) {
      next();
      return;
    }
    setError("");
    const form = event.currentTarget;
    // Every screen must be complete; open the first one that isn't.
    const incomplete = STEPS.findIndex((_, index) => !checkStep(index, false));
    if (incomplete !== -1 && incomplete !== STEPS.length - 1) {
      setStep(incomplete);
      window.setTimeout(() => checkStep(incomplete, true), 50);
      return;
    }
    const formData = new FormData(form);
    const selectedImages = formData.getAll("images").filter((value): value is File => value instanceof File && value.size > 0);
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
      governorate: String(formData.get("governorate")),
      area: normalizeArea(String(formData.get("area"))),
      gender: String(formData.get("gender")),
      property_type: String(formData.get("property_type")),
      monthly_price: Number(formData.get("monthly_price")),
      deposit: Number(formData.get("deposit")),
      available_beds: Number(formData.get("available_beds")),
      total_beds: Number(formData.get("total_beds")),
      whatsapp_number: String(formData.get("whatsapp_number")).trim(),
      wifi: formData.has("wifi"),
      air_conditioning: formData.has("air_conditioning"),
      security: formData.has("security"),
      image_url: imageUrls[0],
      image_urls: imageUrls,
      // New listings always start pending (database rule); admins publish right after saving.
      status: "pending" as const,
    };
    const publishNow = isAdmin && formData.has("publish_now");

    const { data: savedRows, error: saveError } = editing
      ? await supabase.from("properties").update(values).eq("id", editing.id).select("id")
      : await supabase.from("properties").insert({ ...values, owner_id: ownerId }).select("id");

    if (saveError || !savedRows?.length) {
      console.error("Could not save listing:", saveError ?? "no rows were saved");
      if (uploadedPaths.length) await supabase.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
      setError(saveError?.message.includes("listing_rate_limit") ? t.rateLimitError : saveError?.message.includes("unpaid_fee") ? t.unpaidFeeError : t.formError);
      setSubmitting(false);
      setBusyText("");
      return;
    }

    const listingId = (savedRows[0] as { id: string }).id;
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
    if (!editing && !isAdmin) clearDraft();
    form.reset();
    setImagePreviews([]);
    setVisited(false);
    setSubmitting(false);
    setBusyText("");
    setStep(0);
    await onSaved({ created: !editing, listingId });
  }

  const stage = STAGE_OF[current];
  const stageNames = [t.stageAbout, t.stageStandOut, t.stageFinish];
  const stepInStage = step - STAGE_START[stage];
  const stageSize = (STAGE_START[stage + 1] ?? STEPS.length) - STAGE_START[stage];
  const photos = imagePreviews.length > 0 ? imagePreviews : editing ? listingImages(editing) : [];
  const fee = fees && Number(price) > 0 ? successFee(Number(price), fees) : null;
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG");
  const value = (name: string) => (typeof summary[name] === "string" ? (summary[name] as string) : "");
  const chosen = (name: string) => summary[name] !== undefined;

  /** A screen of the flow; every screen stays in the page so its values are submitted together. */
  const screen = (id: StepId, title: string, intro: string | null, children: ReactNode) => (
    <fieldset className="listing-screen" data-step={id} hidden={current !== id}>
      <legend className="listing-screen-title">{title}</legend>
      {intro && <p className="listing-screen-intro">{intro}</p>}
      {children}
    </fieldset>
  );

  const reviewRow = (label: string, content: ReactNode, target: StepId) => (
    <div className="listing-review-row">
      <dt>{label}</dt>
      <dd>{content}</dd>
      <button type="button" className="listing-review-edit" onClick={() => goTo(STEPS.indexOf(target))} aria-label={`${t.reviewEdit}: ${label}`}>
        <Pencil size={14} /> {t.reviewEdit}
      </button>
    </div>
  );

  const Back = locale === "ar" ? ArrowRight : ArrowLeft;
  const Forward = locale === "ar" ? ArrowLeft : ArrowRight;

  return (
    <form className="owner-form listing-steps" id="owner-form" ref={formRef} noValidate onSubmit={submit} onChange={() => saveDraft()}>
      <nav className="listing-stages" aria-label={t.stepCount(step + 1, STEPS.length)}>
        {stageNames.map((name, index) => {
          const done = index < stage ? 1 : index > stage ? 0 : (stepInStage + (isLast ? 1 : 0)) / stageSize;
          return (
            <button
              key={name}
              type="button"
              className={`listing-stage${index === stage ? " is-current" : ""}`}
              disabled={STAGE_START[index] > reached || index === stage}
              aria-current={index === stage ? "step" : undefined}
              onClick={() => goTo(STAGE_START[index])}
            >
              <span className="listing-stage-bar"><span style={{ width: `${Math.max(done, index === stage ? 0.08 : 0) * 100}%` }} /></span>
              <span className="listing-stage-name"><b>{index + 1}</b> {name}</span>
            </button>
          );
        })}
      </nav>
      <p className="listing-step-count">{t.stepCount(step + 1, STEPS.length)}</p>

      {screen("type", t.stepTypeTitle, t.stepTypeText, (
        <>
          <div className="tile-grid" role="radiogroup" aria-label={t.propertyType}>
            {(["room", "studio", "apartment", "bed"] as const).map((type) => {
              const Icon = TYPE_ICONS[type];
              return (
                <label className="tile" key={type}>
                  <input type="radio" name="property_type" value={type} required defaultChecked={(editing?.property_type ?? text("property_type") ?? "room") === type} />
                  <span><Icon size={26} strokeWidth={1.6} /><strong>{t[type]}</strong></span>
                </label>
              );
            })}
          </div>
          <div className="owner-field" role="radiogroup" aria-label={t.adminDetailsGender}>
            <span>{t.adminDetailsGender}</span>
            <div className="tile-grid tile-grid-compact">
              {(["male", "female"] as const).map((gender) => {
                const Icon = GENDER_ICONS[gender];
                return (
                  <label className="tile" key={gender}>
                    <input type="radio" name="gender" value={gender} required defaultChecked={(editing?.gender ?? text("gender")) === gender} />
                    <span><Icon size={22} strokeWidth={1.6} /><strong>{t[gender]}</strong></span>
                  </label>
                );
              })}
            </div>
          </div>
        </>
      ))}

      {screen("location", t.stepLocationTitle, t.stepLocationText, (
        <div className="owner-form-grid">
          <label className="owner-field">
            <span>{t.governorate}</span>
            <select name="governorate" required value={governorate} onChange={(event) => setGovernorate(event.target.value)}>
              <option value="" disabled>{t.chooseGovernorate}</option>
              {GOVERNORATES.map((item) => <option key={item.id} value={item.name_en}>{locale === "ar" ? item.name : item.name_en}</option>)}
            </select>
          </label>
          <label className="owner-field">
            <span>{t.area}</span>
            <input name="area" required minLength={2} maxLength={60} list="area-suggestions" autoComplete="off" defaultValue={editing ? areaLabel(locale, editing.area) : text("area") ?? ""} />
            <datalist id="area-suggestions">
              {areaSuggestions(locale, governorate).map((name) => <option key={name} value={name} />)}
            </datalist>
            <small className="field-hint">{t.areaTypeHint}</small>
          </label>
        </div>
      ))}

      {screen("beds", t.stepBedsTitle, t.stepBedsText, (
        <div className="owner-form-grid">
          <label className="owner-field"><span>{t.availableBeds}</span><input name="available_beds" type="number" inputMode="numeric" min="1" max="100" defaultValue={editing?.available_beds ?? text("available_beds") ?? 1} required /></label>
          <label className="owner-field"><span>{t.totalBeds}</span><input name="total_beds" type="number" inputMode="numeric" min="1" max="100" defaultValue={editing?.total_beds ?? text("total_beds") ?? 1} required /></label>
        </div>
      ))}

      {screen("amenities", t.stepAmenitiesTitle, t.stepAmenitiesText, (
        <div className="tile-grid">
          {AMENITIES.map(([name, Icon]) => (
            <label className="tile" key={name}>
              <input name={name} type="checkbox" defaultChecked={editing ? editing[name] : saved[name] !== undefined} />
              <span><Icon size={26} strokeWidth={1.6} /><strong>{name === "wifi" ? t.wifi : name === "air_conditioning" ? t.airConditioning : t.secure}</strong></span>
            </label>
          ))}
        </div>
      ))}

      {screen("photos", t.stepPhotosTitle, editing ? t.keepPhotosHint : t.photosHint, (
        <>
          <label className="photo-drop">
            <ImagePlus size={28} />
            <strong>{t.photosDrop}</strong>
            <small>{t.stepPhotosLimit}</small>
            <input
              name="images"
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(",")}
              multiple
              onChange={(event) => {
                setError("");
                const files = Array.from(event.target.files ?? []).slice(0, MAX_IMAGES);
                setImagePreviews(files.map((file) => URL.createObjectURL(file)));
              }}
            />
          </label>
          {photos.length > 0 && (
            <div className="listing-photo-grid">
              {photos.map((src, index) => (
                <figure key={src} className={index === 0 ? "is-cover" : undefined}>
                  <Image src={src} alt={t.photoAlt(t.listingPhoto, index + 1)} width={320} height={220} unoptimized={src.startsWith("blob:")} />
                  {index === 0 && <figcaption>{t.coverPhoto}</figcaption>}
                </figure>
              ))}
            </div>
          )}
        </>
      ))}

      {screen("text", t.stepTextTitle, t.stepTextText, (
        <>
          <label className="owner-field">
            <span>{t.listingTitle}</span>
            <input name="title" required minLength={5} maxLength={120} placeholder={t.listingTitlePlaceholder} defaultValue={editing ? (locale === "ar" ? editing.title_ar : editing.title_en) : text("title")} />
          </label>
          <label className="owner-field">
            <span>{t.listingDescription}</span>
            <textarea name="description" required minLength={20} rows={6} maxLength={2000} placeholder={t.descriptionPlaceholder} defaultValue={editing ? (locale === "ar" ? editing.description_ar : editing.description_en) : text("description")} />
            <small className="field-hint">{t.anyLanguageHint}</small>
          </label>
        </>
      ))}

      {screen("price", t.stepPriceTitle, t.stepPriceText, (
        <>
          <label className="owner-field listing-price-field">
            <span>{t.price}</span>
            <input name="monthly_price" type="number" inputMode="numeric" min="1" max="1000000" required value={price} onChange={(event) => setPrice(event.target.value)} dir="ltr" />
          </label>
          {fee !== null && <p className="listing-fee-note">{t.stepFeeNote(numberFormat.format(fee))}</p>}
          <label className="owner-field"><span>{t.deposit}</span><input name="deposit" type="number" inputMode="numeric" min="0" max="1000000" defaultValue={editing?.deposit ?? text("deposit") ?? 0} required dir="ltr" /></label>
        </>
      ))}

      {screen("contact", t.stepContactTitle, t.ownerNumberPrivate, (
        <label className="owner-field"><span>{isAdmin ? t.ownerWhatsapp : t.phoneNumber}</span><input name="whatsapp_number" type="tel" inputMode="tel" autoComplete={isAdmin ? "off" : "tel"} pattern="[0-9+ \(\)\-]{8,20}" placeholder={t.whatsappHint} required dir="ltr" defaultValue={editing?.whatsapp_number ?? text("whatsapp_number")} /></label>
      ))}

      {screen("review", t.stepReviewTitle, isAdmin ? null : t.stepReviewText, (
        <>
          <div className="listing-review">
            {photos[0] && <Image className="listing-review-cover" src={photos[0]} alt="" width={640} height={420} unoptimized={photos[0].startsWith("blob:")} />}
            <dl>
              {reviewRow(t.listingTitle, value("title"), "text")}
              {reviewRow(t.formSectionLocation, placeLabel(locale, value("area"), value("governorate")), "location")}
              {reviewRow(t.formSectionHome, `${value("property_type") ? t[value("property_type") as "room"] : ""} · ${value("gender") ? t[value("gender") as "female"] : ""} · ${t.availableBeds}: ${value("available_beds")}/${value("total_beds")}`, "type")}
              {reviewRow(t.amenitiesTitle, AMENITIES.filter(([name]) => chosen(name)).map(([name]) => (name === "wifi" ? t.wifi : name === "air_conditioning" ? t.airConditioning : t.secure)).join(" · ") || "—", "amenities")}
              {reviewRow(t.formSectionPhotos, numberFormat.format(photos.length), "photos")}
              {reviewRow(t.price, <><strong>{numberFormat.format(Number(value("monthly_price")))}</strong> {t.perMonth} · {t.deposit}: {numberFormat.format(Number(value("deposit")))}</>, "price")}
              {reviewRow(isAdmin ? t.ownerWhatsapp : t.phoneNumber, <span dir="ltr">{value("whatsapp_number")}</span>, "contact")}
            </dl>
          </div>
          {isAdmin && (
            <div className="form-section form-section-admin">
              <strong>{t.adminPublishSection}</strong>
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
            </div>
          )}
        </>
      ))}

      {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
      {!editing && !isAdmin && step > 0 && <p className="listing-draft-note">{t.draftSavedNote}</p>}
      <div className="listing-step-actions">
        {step > 0 ? (
          <button className="listing-step-back" type="button" disabled={submitting} onClick={() => goTo(step - 1)}><Back size={16} /> {t.formBack}</button>
        ) : onCancel ? (
          <button className="listing-step-back" type="button" disabled={submitting} onClick={onCancel}>{t.cancel}</button>
        ) : <span />}
        {isLast ? (
          <button key="submit" className="button button-primary owner-submit" type="submit" disabled={submitting}>
            {submitting ? busyText || t.submitting : editing ? t.saveChanges : isAdmin ? t.adminAddListingSubmit : t.submitListing}
          </button>
        ) : (
          <button key="next" className="button button-primary listing-next" type="button" onClick={next}>{t.formNext} <Forward size={16} /></button>
        )}
      </div>
    </form>
  );
}
