"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { BadgeCheck, ImagePlus, LoaderCircle, Sparkles } from "lucide-react";
import Captcha, { CAPTCHA_SITE_KEY } from "@/components/captcha";
import { areas, universities } from "@/lib/data";
import { compressImage, storagePathFromPublicUrl } from "@/lib/images";
import { listingPath } from "@/lib/site";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PUBLIC_LISTING_COLUMNS, listingImages, type MarketplaceListing } from "@/lib/supabase/listings";

const STORAGE_BUCKET = "sakani-listings";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGES = 6;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const OWNER_LISTING_COLUMNS = `${PUBLIC_LISTING_COLUMNS},rejection_reason`;

type Props = { locale: SiteLocale };
type PortalState = "loading" | "unconfigured" | "signed-out" | "signed-in";
type OwnerListing = Omit<MarketplaceListing, "owner_id">;

async function fetchOwnerListings(client: SupabaseClient, ownerId: string) {
  return client
    .from("properties")
    .select(OWNER_LISTING_COLUMNS)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
}

export default function OwnerPortal({ locale }: Props) {
  const t = SITE_COPY[locale];
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [portalState, setPortalState] = useState<PortalState>(supabase ? "loading" : "unconfigured");
  const [ownerListings, setOwnerListings] = useState<OwnerListing[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyText, setBusyText] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [editing, setEditing] = useState<OwnerListing | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let mounted = true;
    let currentUserId: string | null | undefined;

    async function applySession(currentUser: User | null) {
      if (!mounted) return;
      // Token refreshes report the same user again; only reload when the account changes.
      // `undefined` means "not checked yet", so a first check with no session (null) still runs.
      const nextUserId = currentUser?.id ?? null;
      if (nextUserId === currentUserId) return;
      currentUserId = nextUserId;

      setUser(currentUser);
      setPortalState(currentUser ? "signed-in" : "signed-out");
      if (!currentUser) {
        setOwnerListings([]);
        return;
      }

      setLoadingListings(true);
      const { data, error: listingError } = await fetchOwnerListings(client, currentUser.id);
      if (!mounted) return;
      if (listingError) {
        console.error("Could not load owner listings:", listingError);
        setError(t.formError);
      } else {
        setOwnerListings((data ?? []) as unknown as OwnerListing[]);
      }
      setLoadingListings(false);
    }

    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        console.error("Could not restore owner session:", sessionError);
        if (mounted) setError(t.authError);
      }
      void applySession(data.session?.user ?? null);
    });

    const { data: authListener } = client.auth.onAuthStateChange((_event, session) => {
      void applySession(session?.user ?? null);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [supabase, t.authError, t.formError]);

  useEffect(() => {
    return () => {
      imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imagePreviews]);

  async function refreshListings() {
    if (!supabase || !user) return;
    const { data, error: refreshError } = await fetchOwnerListings(supabase, user.id);
    if (refreshError) {
      console.error("Could not refresh owner listings:", refreshError);
      setError(t.formError);
    } else {
      setOwnerListings((data ?? []) as unknown as OwnerListing[]);
    }
  }

  async function startEmailFreeSession() {
    if (!supabase) return;
    if (CAPTCHA_SITE_KEY && !captchaToken) {
      setError(t.captchaRequired);
      return;
    }
    setSubmitting(true);
    setError("");
    setMessage("");

    const { data, error: signInError } = await supabase.auth.signInAnonymously(
      captchaToken ? { options: { captchaToken } } : undefined,
    );
    // Captcha tokens are single-use; get a fresh one for any retry.
    setCaptchaReset((value) => value + 1);
    if (signInError) {
      console.error("Could not start an email-free listing session:", signInError);
      setError(t.anonymousSetupError);
      setSubmitting(false);
      return;
    }
    setUser(data.user);
    setPortalState("signed-in");
    setSubmitting(false);
  }

  async function signOutOwner() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      console.error("Could not end owner session:", signOutError);
      setError(t.authError);
    } else {
      setOwnerListings([]);
      setEditing(null);
      setMessage("");
      setError("");
    }
  }

  function startEditing(listing: OwnerListing) {
    setEditing(listing);
    setImagePreviews([]);
    setMessage("");
    setError("");
    setConfirmingDeleteId(null);
    document.getElementById("owner-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function stopEditing() {
    setEditing(null);
    setImagePreviews([]);
    setFormVersion((version) => version + 1);
  }

  async function removeStoredImages(urls: string[]) {
    if (!supabase) return;
    const paths = urls.map((url) => storagePathFromPublicUrl(url, STORAGE_BUCKET)).filter((path): path is string => Boolean(path));
    if (paths.length === 0) return;
    const { error: removeError } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
    if (removeError) console.error("Could not remove listing images:", removeError);
  }

  async function deleteListing(listing: OwnerListing) {
    if (!supabase) return;
    setSubmitting(true);
    setError("");
    setMessage("");

    const { data, error: deleteError } = await supabase.from("properties").delete().eq("id", listing.id).select("id");
    if (deleteError || !data?.length) {
      console.error("Could not delete listing:", deleteError ?? "no rows were deleted");
      setError(t.deleteError);
    } else {
      await removeStoredImages(listingImages(listing));
      if (editing?.id === listing.id) stopEditing();
      setOwnerListings((current) => current.filter((item) => item.id !== listing.id));
      setMessage(t.listingDeleted);
    }
    setConfirmingDeleteId(null);
    setSubmitting(false);
  }

  async function submitListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user) return;

    setError("");
    setMessage("");
    const formData = new FormData(event.currentTarget);
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

    setSubmitting(true);
    let imageUrls = editing ? listingImages(editing) : [];
    const uploadedPaths: string[] = [];

    if (selectedImages.length > 0) {
      setBusyText(t.preparingPhotos);
      const compressed = await Promise.all(selectedImages.map(compressImage));
      setBusyText(t.submitting);

      for (const file of compressed) {
        const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        const imagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
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
      status: "pending" as const,
    };

    const { data: saved, error: saveError } = editing
      ? await supabase.from("properties").update(values).eq("id", editing.id).select("id")
      : await supabase.from("properties").insert({ ...values, owner_id: user.id }).select("id");

    if (saveError || !saved?.length) {
      console.error("Could not save owner listing:", saveError ?? "no rows were saved");
      if (uploadedPaths.length) await supabase.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
      setError(saveError?.message.includes("listing_rate_limit") ? t.rateLimitError : t.formError);
      setSubmitting(false);
      setBusyText("");
      return;
    }

    if (editing && uploadedPaths.length) await removeStoredImages(listingImages(editing));
    setMessage(editing ? t.listingUpdated : t.listingSubmitted);
    stopEditing();
    await refreshListings();
    setSubmitting(false);
    setBusyText("");
  }

  const statusLabel = (status: OwnerListing["status"]) => {
    if (status === "approved") return t.statusApproved;
    if (status === "rejected") return t.statusRejected;
    return t.statusPending;
  };

  return (
    <section className="owner-section" id="owner">
      <div className="section-wrap owner-layout">
        <div className="owner-intro">
          <span className="section-kicker">{t.ownerKicker}</span>
          <h2>{t.ownerTitle}</h2>
          <p>{t.ownerDescription}</p>
          <div className="owner-promotion">
            <span className="promotion-icon"><Sparkles size={19} /></span>
            <span className="promotion-copy"><small>{t.promotionKicker}</small><strong>{t.promotionTitle}</strong><span>{t.promotionText}</span></span>
          </div>
        </div>

        <div className="owner-panel">
          {portalState === "loading" && (
            <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>
          )}

          {portalState === "unconfigured" && (
            <div className="portal-message">
              <BadgeCheck size={25} />
              <h3>{t.ownerSignInTitle}</h3>
              <p>{t.ownerSetupNeeded}</p>
            </div>
          )}

          {portalState === "signed-out" && (
            <div className="owner-signin">
              <span className="signin-icon"><ImagePlus size={19} /></span>
              <h3>{t.ownerSignInTitle}</h3>
              <p>{t.ownerSignInText}</p>
              <Link className="button button-primary owner-submit" href={`/${locale}/account`}>{t.ownerLoginButton}</Link>
              <Captcha locale={locale} onToken={setCaptchaToken} resetKey={captchaReset} />
              <button className="button button-outline owner-guest-button" type="button" disabled={submitting} onClick={() => void startEmailFreeSession()}>
                {submitting ? t.sending : t.ownerGuestButton}
              </button>
            </div>
          )}

          {portalState === "signed-in" && user && (
            <div className="owner-dashboard">
              <div className="owner-dashboard-heading">
                <div>
                  <span className="section-kicker">{user.is_anonymous ? t.ownerListings : t.ownerSignedInAs(user.email ?? "")}</span>
                  <h3>{editing ? t.editingTitle : t.ownerFormTitle}</h3>
                </div>
                <button type="button" className="signout-button" onClick={() => void signOutOwner()}>{t.signOut}</button>
              </div>

              {user.is_anonymous && (
                <div className="owner-guest-notice">
                  <p>{t.ownerGuestNotice}</p>
                  <Link className="button button-primary" href={`/${locale}/account?mode=signup`}>{t.ownerGuestCta}</Link>
                </div>
              )}

              <form className="owner-form" id="owner-form" key={`${editing?.id ?? "new"}-${formVersion}`} onSubmit={submitListing}>
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
                  <label className="owner-field"><span>{t.phoneNumber}</span><input name="whatsapp_number" type="tel" inputMode="tel" autoComplete="tel" pattern="[+0-9 ()-]{8,20}" placeholder={t.whatsappHint} required dir="ltr" defaultValue={editing?.whatsapp_number} /></label>
                </fieldset>
                <div className="owner-form-actions">
                  <button className="button button-primary owner-submit" type="submit" disabled={submitting}>
                    {submitting ? busyText || t.submitting : editing ? t.saveChanges : t.submitListing}
                  </button>
                  {editing && <button className="signout-button" type="button" disabled={submitting} onClick={stopEditing}>{t.cancel}</button>}
                </div>
              </form>

              <div className="owner-listings">
                <h4>{t.ownerListings}</h4>
                {loadingListings ? <p>{t.loading}</p> : ownerListings.length === 0 ? <p>{t.noOwnerListings}</p> : ownerListings.map((listing) => {
                  const title = locale === "ar" ? listing.title_ar : listing.title_en;
                  const canChange = listing.status !== "approved";
                  return (
                    <div className="owner-listing-row" key={listing.id}>
                      <div className="owner-listing-main">
                        {listing.status === "approved"
                          ? <Link href={listingPath(locale, listing.id)}>{title}</Link>
                          : <span>{title}</span>}
                        {listing.status === "rejected" && listing.rejection_reason && (
                          <small className="owner-review-note"><strong>{t.reviewNote}:</strong> {listing.rejection_reason}</small>
                        )}
                      </div>
                      <div className="owner-listing-actions">
                        <span className={`listing-status listing-status-${listing.status}`}>{statusLabel(listing.status)}</span>
                        {canChange && confirmingDeleteId !== listing.id && (
                          <>
                            <button type="button" className="owner-text-button" disabled={submitting} onClick={() => startEditing(listing)}>{t.editListing}</button>
                            <button type="button" className="owner-text-button is-danger" disabled={submitting} onClick={() => setConfirmingDeleteId(listing.id)}>{t.deleteListing}</button>
                          </>
                        )}
                        {confirmingDeleteId === listing.id && (
                          <>
                            <button type="button" className="owner-text-button is-danger" disabled={submitting} onClick={() => void deleteListing(listing)}>{t.confirmDelete}</button>
                            <button type="button" className="owner-text-button" disabled={submitting} onClick={() => setConfirmingDeleteId(null)}>{t.cancel}</button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {message && <p className="owner-feedback owner-feedback-success" role="status">{message}</p>}
          {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
        </div>
      </div>
    </section>
  );
}
