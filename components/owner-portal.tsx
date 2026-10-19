"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { BadgeCheck, ImagePlus, LoaderCircle, Sparkles } from "lucide-react";
import { areas, universities } from "@/lib/data";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MarketplaceListing } from "@/lib/supabase/listings";

const STORAGE_BUCKET = "sakani-listings";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const OWNER_LISTING_COLUMNS = "id,title_ar,title_en,status,created_at";

type Props = { locale: SiteLocale };
type PortalState = "loading" | "unconfigured" | "signed-out" | "signed-in";
type OwnerListing = Pick<MarketplaceListing, "id" | "title_ar" | "title_en" | "status" | "created_at">;

export default function OwnerPortal({ locale }: Props) {
  const t = SITE_COPY[locale];
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [portalState, setPortalState] = useState<PortalState>(supabase ? "loading" : "unconfigured");
  const [ownerListings, setOwnerListings] = useState<OwnerListing[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [imagePreview, setImagePreview] = useState("");

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    let mounted = true;

    async function applySession(currentUser: User | null) {
      if (!mounted) return;
      setUser(currentUser);
      setPortalState(currentUser ? "signed-in" : "signed-out");
      if (!currentUser) {
        setOwnerListings([]);
        return;
      }

      setLoadingListings(true);
      const { data, error: listingError } = await client
        .from("properties")
        .select(OWNER_LISTING_COLUMNS)
        .eq("owner_id", currentUser.id)
        .order("created_at", { ascending: false });

      if (!mounted) return;
      if (listingError) {
        console.error("Could not load owner listings:", listingError);
        setError(t.formError);
      } else {
        setOwnerListings((data ?? []) as OwnerListing[]);
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
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  async function startEmailFreeSession() {
    if (!supabase) return;
    setSubmitting(true);
    setError("");
    setMessage("");

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("Could not restore owner session:", sessionError);
      setError(t.authError);
      setSubmitting(false);
      return;
    }
    if (sessionData.session?.user) {
      setUser(sessionData.session.user);
      setPortalState("signed-in");
      setSubmitting(false);
      return;
    }

    const { data, error: signInError } = await supabase.auth.signInAnonymously();
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
      setMessage("");
      setError("");
    }
  }

  async function submitListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user) return;

    setError("");
    setMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const selectedImage = formData.get("image");

    if (!(selectedImage instanceof File) || selectedImage.size === 0) {
      setError(t.imageError);
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(selectedImage.type) || selectedImage.size > MAX_IMAGE_SIZE) {
      setError(t.imageError);
      return;
    }
    if (Number(formData.get("available_beds")) > Number(formData.get("total_beds"))) {
      setError(t.bedsError);
      return;
    }

    setSubmitting(true);
    const extension = selectedImage.type === "image/png" ? "png" : selectedImage.type === "image/webp" ? "webp" : "jpg";
    const imagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(imagePath, selectedImage, {
        cacheControl: "3600",
        contentType: selectedImage.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Could not upload listing image:", uploadError);
      setError(t.formError);
      setSubmitting(false);
      return;
    }

    const { data: imageData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(imagePath);
    const { error: insertError } = await supabase.from("properties").insert({
      owner_id: user.id,
      title_ar: String(formData.get("title_ar")).trim(),
      title_en: String(formData.get("title_en")).trim(),
      description_ar: String(formData.get("description_ar")).trim(),
      description_en: String(formData.get("description_en")).trim(),
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
      image_url: imageData.publicUrl,
      status: "pending",
    });

    if (insertError) {
      console.error("Could not save owner listing:", insertError);
      const { error: cleanupError } = await supabase.storage.from(STORAGE_BUCKET).remove([imagePath]);
      if (cleanupError) console.error("Could not clean up the failed listing image upload:", cleanupError);
      setError(t.formError);
      setSubmitting(false);
      return;
    }

    form.reset();
    setImagePreview("");
    setMessage(t.listingSubmitted);
    const { data: updatedListings, error: refreshError } = await supabase
      .from("properties")
      .select(OWNER_LISTING_COLUMNS)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (refreshError) {
      console.error("Could not refresh owner listings:", refreshError);
      setError(t.formError);
    } else {
      setOwnerListings((updatedListings ?? []) as OwnerListing[]);
    }
    setSubmitting(false);
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
              <button className="button button-primary owner-submit" type="button" disabled={submitting} onClick={() => void startEmailFreeSession()}>
                {submitting ? t.sending : t.startListing}
              </button>
            </div>
          )}

          {portalState === "signed-in" && user && (
            <div className="owner-dashboard">
              <div className="owner-dashboard-heading">
                <div><span className="section-kicker">{t.ownerListings}</span><h3>{t.ownerFormTitle}</h3></div>
                <button type="button" className="signout-button" onClick={() => void signOutOwner()}>{t.signOut}</button>
              </div>

              <form className="owner-form" onSubmit={submitListing}>
                <div className="owner-form-grid">
                  <label className="owner-field"><span>{t.titleArabic}</span><input name="title_ar" required minLength={5} maxLength={120} /></label>
                  <label className="owner-field"><span>{t.titleEnglish}</span><input name="title_en" required minLength={5} maxLength={120} dir="ltr" /></label>
                </div>
                <div className="owner-form-grid">
                  <label className="owner-field"><span>{t.descriptionArabic}</span><textarea name="description_ar" required minLength={20} rows={3} maxLength={2000} /></label>
                  <label className="owner-field"><span>{t.descriptionEnglish}</span><textarea name="description_en" required minLength={20} rows={3} maxLength={2000} dir="ltr" /></label>
                </div>
                <div className="owner-form-grid owner-form-grid-three">
                  <label className="owner-field"><span>{t.area}</span><select name="area" required defaultValue=""><option value="" disabled>{t.chooseArea}</option>{areas.map((area) => <option key={area.id} value={area.name_en}>{locale === "ar" ? area.name : area.name_en}</option>)}</select></label>
                  <label className="owner-field"><span>{t.university}</span><select name="university" required defaultValue=""><option value="" disabled>{t.chooseUniversity}</option>{universities.map((university) => <option key={university.id} value={university.name_en}>{locale === "ar" ? university.name : university.name_en}</option>)}</select></label>
                  <label className="owner-field"><span>{t.housing}</span><select name="gender" required defaultValue=""><option value="" disabled>{t.all}</option><option value="female">{t.female}</option><option value="male">{t.male}</option><option value="mixed">{t.mixed}</option></select></label>
                </div>
                <div className="owner-form-grid owner-form-grid-three">
                  <label className="owner-field"><span>{t.propertyType}</span><select name="property_type" required defaultValue="room"><option value="room">{t.room}</option><option value="apartment">{t.apartment}</option><option value="bed">{t.bed}</option></select></label>
                  <label className="owner-field"><span>{t.price}</span><input name="monthly_price" type="number" min="1" max="1000000" required /></label>
                  <label className="owner-field"><span>{t.deposit}</span><input name="deposit" type="number" min="0" max="1000000" defaultValue="0" required /></label>
                </div>
                <div className="owner-form-grid owner-form-grid-three">
                  <label className="owner-field"><span>{t.availableBeds}</span><input name="available_beds" type="number" min="1" max="100" defaultValue="1" required /></label>
                  <label className="owner-field"><span>{t.totalBeds}</span><input name="total_beds" type="number" min="1" max="100" defaultValue="1" required /></label>
                  <label className="owner-field"><span>{t.walkingDistance}</span><input name="walking_distance_minutes" type="number" min="0" max="300" defaultValue="0" required /></label>
                </div>
                <div className="owner-form-grid">
                  <label className="owner-field"><span>{t.phoneNumber}</span><input name="whatsapp_number" type="tel" inputMode="tel" autoComplete="tel" pattern="[+0-9 ()-]{8,20}" required dir="ltr" /></label>
                  <label className="owner-field"><span className="file-field-label"><ImagePlus size={14} /> {t.listingPhoto}</span><input name="image" type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => { const file = event.target.files?.[0] ?? null; setImagePreview(file ? URL.createObjectURL(file) : ""); }} /></label>
                </div>
                {imagePreview && <Image className="owner-image-preview" src={imagePreview} alt={t.listingPhoto} width={560} height={260} unoptimized />}
                <fieldset className="amenity-fieldset">
                  <legend>{t.amenitiesTitle}</legend>
                  <label><input name="furnished" type="checkbox" /> {t.furnished}</label>
                  <label><input name="wifi" type="checkbox" /> {t.wifi}</label>
                  <label><input name="air_conditioning" type="checkbox" /> {t.airConditioning}</label>
                  <label><input name="security" type="checkbox" /> {t.secure}</label>
                </fieldset>
                <button className="button button-primary owner-submit" type="submit" disabled={submitting}>
                  {submitting ? t.submitting : t.submitListing}
                </button>
              </form>

              <div className="owner-listings">
                <h4>{t.ownerListings}</h4>
                {loadingListings ? <p>{t.loading}</p> : ownerListings.length === 0 ? <p>{t.noOwnerListings}</p> : ownerListings.map((listing) => (
                  <div className="owner-listing-row" key={listing.id}>
                    <span>{locale === "ar" ? listing.title_ar : listing.title_en}</span>
                    <span className={`listing-status listing-status-${listing.status}`}>{statusLabel(listing.status)}</span>
                  </div>
                ))}
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
