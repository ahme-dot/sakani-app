"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Armchair, ArrowLeft, ArrowRight, BedSingle, Building2, DoorOpen, ImagePlus, Mars, Pencil, Venus } from "lucide-react";
import { AMENITIES, AMENITY_KEYS } from "@/lib/amenities";
import VisitChecklist, { readVisit } from "@/components/visit-checklist";
import { GOVERNORATES, areaLabel, areaSuggestions, normalizeArea, placeLabel } from "@/lib/egypt";
import { isEgyptMobile, latinDigits, numberField, onDigitsInput, outOfRange } from "@/lib/digits";
import { compressImage, storagePathFromPublicUrl } from "@/lib/images";
import { DEFAULT_PAYMENT_SETTINGS, fetchPaymentSettings, successFee, type PaymentSettings } from "@/lib/payments";
import { PHONE_PATTERN } from "@/lib/account";
import { editNeedsReview, listingImages, type MarketplaceListing } from "@/lib/supabase/listings";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import SakaniSelect from "@/components/sakani-select";
import SakaniDate from "@/components/sakani-date";

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
const PHOTOS_STEP = STEPS.indexOf("photos");

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
  /** A signed-in host's phone and InstaPay; what's missing is asked before submitting. Left out for everyone else. */
  hostContact?: { phone: string; instapay_address: string } | null;
  onHostContactSaved?: (saved: { phone?: string; instapay_address?: string }) => void;
  /** `reviewed`: false when an edit of a published or paused place didn't need a new review. */
  onSaved: (result: { created: boolean; listingId: string; reviewed: boolean }) => void | Promise<void>;
  onCancel?: () => void;
};

/** `photos`: how many were chosen when the draft was saved. The files themselves can't be kept. */
type Draft = { step: number; values: Record<string, string | string[]>; photos?: number };
type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** What the owner sees as this field's name: a choice by its group, anything else by its own label (not the screen's title). */
function fieldLabel(field: Field) {
  const group = field.closest('[role="radiogroup"]');
  if (group) return group.getAttribute("aria-label") ?? "";
  return field.closest("label")?.querySelector("span")?.textContent?.trim() ?? "";
}

/** The element that shows the red mark: a group of tiles as a whole, otherwise the field. */
const markOf = (field: Field): HTMLElement => field.closest<HTMLElement>('[role="radiogroup"]') ?? field;

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
export default function ListingForm({ locale, supabase, ownerId, editing = null, mode = "owner", hostContact = null, onHostContactSaved, onSaved, onCancel }: Props) {
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
  // The field the error message is about; marked until it's fixed.
  const flagged = useRef<Field | null>(null);
  const shownStep = useRef(step);
  // A restored draft has its words but not its photos, so say so rather than let the owner find out at the end.
  const [photosLost, setPhotosLost] = useState(() => Boolean(draft && ((draft.photos ?? 0) > 0 || draft.step > PHOTOS_STEP)));
  // A whole flat or studio is described by its rooms; rooms and beds by their free beds.
  const [placeType, setPlaceType] = useState<string>(() => editing?.property_type ?? text("property_type") ?? "room");
  const wholePlace = placeType === "apartment" || placeType === "studio";
  const [visited, setVisited] = useState(false);
  const [summary, setSummary] = useState<Record<string, string | string[]>>({});
  const [price, setPrice] = useState(String(editing?.monthly_price ?? text("monthly_price") ?? ""));
  const [fees, setFees] = useState<PaymentSettings | null>(null);
  // Chosen governorate: narrows the neighbourhood suggestions.
  const [governorate, setGovernorate] = useState(editing?.governorate ?? text("governorate") ?? "");
  const current: StepId = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const askPhone = !isAdmin && Boolean(hostContact) && !hostContact?.phone.trim();
  const askInstapay = !isAdmin && Boolean(hostContact) && !hostContact?.instapay_address.trim();

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

  // A new screen: bring the top of the form back into view, clear of the sticky header. Done after the screen has
  // changed, because the form's height (and so the target) changes with it.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    const form = formRef.current;
    if (!form) return;
    const bars = Array.from(document.querySelectorAll<HTMLElement>(".site-header, .admin-sidebar")).filter(
      (bar) => bar.offsetWidth > window.innerWidth * 0.6 && ["sticky", "fixed"].includes(getComputedStyle(bar).position),
    );
    const covered = Math.max(0, ...bars.map((bar) => bar.getBoundingClientRect().bottom));
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: form.getBoundingClientRect().top + window.scrollY - covered - 12, behavior: still ? "auto" : "smooth" });
  }, [step]);

  function saveDraft(nextStep = step) {
    if (editing || isAdmin || !formRef.current) return;
    try {
      const photos = formRef.current.querySelector<HTMLInputElement>('input[type="file"]')?.files?.length ?? 0;
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ step: nextStep, values: formValues(formRef.current), photos }));
    } catch {
      // Storage blocked: the form still works, it just won't be remembered.
    }
  }

  /** What's wrong with one field, naming it and its limit, in the page's language; empty when it's fine. */
  function problemWith(field: Field) {
    const label = fieldLabel(field);
    if (field instanceof HTMLInputElement && field.type === "file") {
      const files = Array.from(field.files ?? []);
      if ((!editing && files.length === 0) || files.some((file) => !ALLOWED_IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_SIZE)) return t.imageError;
      return files.length > MAX_IMAGES ? t.tooManyPhotos : "";
    }
    const entered = field.value.trim();
    if (field.validity.valueMissing || (field.required && !entered)) return t.formFieldCheck(label);
    if (!entered) return "";
    if (field instanceof HTMLInputElement && field.dataset.min && outOfRange(field)) {
      return t.formNumberRange(label, Number(field.dataset.min).toLocaleString("en-US"), Number(field.dataset.max).toLocaleString("en-US"));
    }
    if (field.name === "available_beds") {
      const total = field.form?.elements.namedItem("total_beds") as HTMLInputElement | null;
      if (total && Number(entered) > Number(total.value)) return t.bedsError;
    }
    // A number saved before this check shouldn't stop the owner fixing a typo elsewhere in the listing.
    if (field.name === "whatsapp_number" && !isEgyptMobile(entered) && entered !== editing?.whatsapp_number) return t.formPhoneEgypt;
    if ("minLength" in field && field.minLength > 0 && entered.length < field.minLength) return t.formTooShort(label, field.minLength, entered.length);
    return field.validity.valid ? "" : t.formFieldCheck(label);
  }

  function unflag() {
    if (flagged.current) markOf(flagged.current).removeAttribute("aria-invalid");
    flagged.current = null;
  }

  /** Our own message (the browser's would be in the browser's language), the field marked, and the owner taken to it. */
  function flag(field: Field, message: string) {
    unflag();
    flagged.current = field;
    markOf(field).setAttribute("aria-invalid", "true");
    setError(message);
    field.focus({ preventScroll: true });
    (field.closest<HTMLElement>('[role="radiogroup"]') ?? field.closest<HTMLElement>("label"))?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  /** While a field is marked, every change looks at it again: the message follows the value and goes once it's right. */
  function recheck() {
    if (!flagged.current) return;
    const message = problemWith(flagged.current);
    if (message) {
      setError(message);
    } else {
      unflag();
      setError("");
    }
  }

  /** Checks one screen and, if asked, reports its first problem; returns false if there is one. */
  function checkStep(index: number, report: boolean) {
    const section = formRef.current?.querySelector<HTMLElement>(`[data-step="${STEPS[index]}"]`);
    if (!section) return false;
    for (const field of section.querySelectorAll<Field>("input, select, textarea")) {
      const message = problemWith(field);
      if (message) {
        if (report) flag(field, message);
        return false;
      }
    }
    return true;
  }

  function goTo(index: number) {
    unflag();
    setError("");
    if (STEPS[index] === "review" && formRef.current) setSummary(formValues(formRef.current));
    setStep(index);
    setReached((value) => Math.max(value, index));
    saveDraft(Math.min(index, STEPS.length - 2));
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

    // Owners write the title and description once, in either language; both language versions show the same text.
    // Left as it was, a text keeps both versions, so re-saving a place doesn't count as changing them.
    const optional = (name: string) => {
      const value = String(formData.get(name) ?? "").trim();
      return value === "" ? null : Number(value);
    };
    const title = String(formData.get("title")).trim();
    const description = String(formData.get("description")).trim();
    const area = String(formData.get("area")).trim();
    const sameTitle = editing && title === (locale === "ar" ? editing.title_ar : editing.title_en).trim();
    const sameDescription = editing && description === (locale === "ar" ? editing.description_ar : editing.description_en).trim();
    const fields = {
      title_ar: sameTitle ? editing.title_ar : title,
      title_en: sameTitle ? editing.title_en : title,
      description_ar: sameDescription ? editing.description_ar : description,
      description_en: sameDescription ? editing.description_en : description,
      governorate: String(formData.get("governorate")),
      area: editing && area === areaLabel(locale, editing.area).trim() ? editing.area : normalizeArea(area),
      gender: String(formData.get("gender")),
      property_type: String(formData.get("property_type")),
      monthly_price: Number(formData.get("monthly_price")),
      deposit: Number(formData.get("deposit")),
      available_beds: Number(formData.get("available_beds")),
      total_beds: Number(formData.get("total_beds")),
      bedrooms: optional("bedrooms"),
      bathrooms: optional("bathrooms"),
      area_sqm: optional("area_sqm"),
      min_months: Number(formData.get("min_months") || 1),
      available_from: String(formData.get("available_from") ?? "") || null,
      whatsapp_number: String(formData.get("whatsapp_number")).trim(),
      // Every amenity is a clear yes or no once the owner has been through this step.
      ...Object.fromEntries(AMENITY_KEYS.map((key) => [key, formData.has(key)])),
      // New listings always start pending (database rule); admins publish right after saving.
      status: "pending" as const,
    };

    // Only what the database would really send back to review is worth a warning, and only before anything is saved.
    const needsReview = Boolean(editing) && (selectedImages.length > 0 || editNeedsReview({ ...editing }, fields));
    if (!isAdmin && needsReview && !window.confirm(t.editPublishedWarn)) return;

    setSubmitting(true);

    // The details the database needs before this host's places can be booked, into the profile.
    const contact = {
      ...(askPhone && PHONE_PATTERN.test(fields.whatsapp_number) ? { phone: fields.whatsapp_number } : {}),
      ...(askInstapay ? { instapay_address: latinDigits(String(formData.get("host_instapay") ?? "")).trim().slice(0, 80) } : {}),
    };
    if (Object.keys(contact).length > 0) {
      const { error: contactError } = await supabase.from("profiles").update(contact).eq("id", ownerId);
      if (contactError) {
        console.error("Could not save the host's details:", contactError);
        setError(t.formError);
        setSubmitting(false);
        return;
      }
      onHostContactSaved?.(contact);
    }

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

    // No new photos: the stored values as they are, so an older place's empty list doesn't count as a change.
    const keepPhotos = editing && selectedImages.length === 0;
    const values = {
      ...fields,
      image_url: keepPhotos ? editing.image_url : imageUrls[0],
      image_urls: keepPhotos ? editing.image_urls : imageUrls,
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
    setPhotosLost(false);
    form.reset();
    setImagePreviews([]);
    setVisited(false);
    setSubmitting(false);
    setBusyText("");
    setStep(0);
    await onSaved({ created: !editing, listingId, reviewed: !editing || needsReview || (editing.status !== "approved" && editing.status !== "paused") });
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
    <form className="owner-form listing-steps" id="owner-form" data-step-index={step} ref={formRef} noValidate onSubmit={submit} onChange={() => { saveDraft(); recheck(); }}>
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
      {photosLost && (
        <p className="listing-photos-lost" role="status">
          {t.draftPhotosLost}
          {current !== "photos" && <button type="button" onClick={() => goTo(PHOTOS_STEP)}>{t.draftPhotosAdd}</button>}
        </p>
      )}

      {screen("type", t.stepTypeTitle, t.stepTypeText, (
        <>
          <div className="tile-grid" role="radiogroup" aria-label={t.propertyType}>
            {(["room", "studio", "apartment", "bed"] as const).map((type) => {
              const Icon = TYPE_ICONS[type];
              return (
                <label className="tile" key={type}>
                  <input type="radio" name="property_type" value={type} required defaultChecked={(editing?.property_type ?? text("property_type") ?? "room") === type} onChange={() => setPlaceType(type)} />
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
            <SakaniSelect name="governorate" required value={governorate} onChange={(event) => setGovernorate(event.target.value)}>
              <option value="" disabled>{t.chooseGovernorate}</option>
              {GOVERNORATES.map((item) => <option key={item.id} value={item.name_en}>{locale === "ar" ? item.name : item.name_en}</option>)}
            </SakaniSelect>
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

      {screen("beds", wholePlace ? t.stepPlaceTitle : t.stepBedsTitle, wholePlace ? t.stepPlaceText : t.stepBedsText, (
        <div className="owner-form-grid">
          {/* A flat or studio is booked whole: one "bed" each, kept out of sight. */}
          <label className="owner-field" hidden={wholePlace}><span>{t.availableBeds}</span><input name="available_beds" {...numberField(1, 100)} defaultValue={editing?.available_beds ?? text("available_beds") ?? 1} required /></label>
          <label className="owner-field" hidden={wholePlace}><span>{t.totalBeds}</span><input name="total_beds" {...numberField(1, 100)} defaultValue={editing?.total_beds ?? text("total_beds") ?? 1} required /></label>
          <label className="owner-field"><span>{t.bedroomsLabel}</span><input name="bedrooms" {...numberField(0, 20)} defaultValue={editing?.bedrooms ?? text("bedrooms") ?? ""} required={wholePlace} /></label>
          <label className="owner-field"><span>{t.bathroomsLabel}</span><input name="bathrooms" {...numberField(0, 20)} defaultValue={editing?.bathrooms ?? text("bathrooms") ?? ""} /></label>
          <label className="owner-field"><span>{t.areaSqmLabel}</span><input name="area_sqm" {...numberField(5, 2000)} defaultValue={editing?.area_sqm ?? text("area_sqm") ?? ""} /></label>
          <label className="owner-field"><span>{t.minMonthsLabel}</span><input name="min_months" {...numberField(1, 24)} defaultValue={editing?.min_months ?? text("min_months") ?? 1} required /></label>
          <label className="owner-field"><span>{t.availableFromLabel}</span><SakaniDate name="available_from" dir="ltr" defaultValue={editing?.available_from ?? text("available_from") ?? ""} /></label>
        </div>
      ))}

      {screen("amenities", t.stepAmenitiesTitle, t.stepAmenitiesText, (
        <div className="tile-grid">
          {AMENITIES.map(({ key, icon: Icon, ...label }) => (
            <label className="tile" key={key}>
              <input name={key} type="checkbox" defaultChecked={editing ? Boolean(editing[key]) : saved[key] !== undefined} />
              <span><Icon size={26} strokeWidth={1.6} /><strong>{label[locale]}</strong></span>
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
                if (files.length > 0) setPhotosLost(false);
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
            <input name="monthly_price" {...numberField(1, 1000000)} required value={price} onChange={(event) => setPrice(latinDigits(event.target.value))} dir="ltr" />
          </label>
          {fee !== null && <p className="listing-fee-note">{t.stepFeeNote(numberFormat.format(fee))}</p>}
          <label className="owner-field"><span>{t.deposit}</span><input name="deposit" {...numberField(0, 1000000)} defaultValue={editing?.deposit ?? text("deposit") ?? 0} required dir="ltr" /></label>
        </>
      ))}

      {screen("contact", t.stepContactTitle, t.ownerNumberPrivate, (
        <>
          <label className="owner-field">
            <span>{isAdmin ? t.ownerWhatsapp : t.phoneNumber}</span>
            <input name="whatsapp_number" type="tel" inputMode="tel" autoComplete={isAdmin ? "off" : "tel"} placeholder={t.whatsappHint} required dir="ltr" defaultValue={editing?.whatsapp_number ?? text("whatsapp_number")} onInput={onDigitsInput} />
            {askPhone && <small className="field-hint">{t.listingPhoneSaved}</small>}
          </label>
          {askInstapay && (
            <label className="owner-field">
              <span>{t.instapayLabel}</span>
              <input name="host_instapay" required maxLength={80} autoComplete="off" dir="ltr" placeholder="name@instapay" defaultValue={text("host_instapay")} onInput={onDigitsInput} />
              <small className="field-hint">{t.listingInstapayAsk}</small>
            </label>
          )}
        </>
      ))}

      {screen("review", t.stepReviewTitle, isAdmin ? null : t.stepReviewText, (
        <>
          <div className="listing-review">
            {photos[0] && <Image className="listing-review-cover" src={photos[0]} alt="" width={640} height={420} unoptimized={photos[0].startsWith("blob:")} />}
            <dl>
              {reviewRow(t.listingTitle, value("title"), "text")}
              {reviewRow(t.formSectionLocation, placeLabel(locale, value("area"), value("governorate")), "location")}
              {reviewRow(t.formSectionHome, `${value("property_type") ? t[value("property_type") as "room"] : ""} · ${value("gender") ? t[value("gender") as "female"] : ""} · ${value("property_type") === "apartment" || value("property_type") === "studio" ? (value("bedrooms") ? t.bedroomsCount(Number(value("bedrooms"))) : "") : `${t.availableBeds}: ${value("available_beds")}/${value("total_beds")}`}`, "type")}
              {reviewRow(t.amenitiesTitle, AMENITIES.filter(({ key }) => chosen(key)).map((amenity) => amenity[locale]).join(" · ") || "—", "amenities")}
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
      {/* Said once, on the first screen after the start. */}
      {!editing && !isAdmin && step === 1 && reached === 1 && <p className="listing-draft-note">{t.draftSavedNote}</p>}
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
