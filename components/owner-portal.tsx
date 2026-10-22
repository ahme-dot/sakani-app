"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { BadgeCheck, ImagePlus, Plus, Sparkles } from "lucide-react";
import Captcha, { CAPTCHA_SITE_KEY } from "@/components/captcha";
import ListingForm, { removeListingImages } from "@/components/listing-form";
import OwnerPayments from "@/components/owner-payments";
import {
  DEFAULT_PAYMENT_SETTINGS,
  RENTAL_FEE_COLUMNS,
  fetchPaymentSettings,
  isMissingFunction,
  successFee,
  type PaymentSettings,
  type RentalFee,
} from "@/lib/payments";
import { listingPath } from "@/lib/site";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PUBLIC_LISTING_COLUMNS, listingImages, type MarketplaceListing } from "@/lib/supabase/listings";

const OWNER_LISTING_COLUMNS = `${PUBLIC_LISTING_COLUMNS},rejection_reason`;

type Props = {
  locale: SiteLocale;
  /** The host page has its own introduction, so it hides the side intro. */
  showIntro?: boolean;
};
type PortalState = "loading" | "unconfigured" | "signed-out" | "signed-in";
type OwnerListing = Omit<MarketplaceListing, "owner_id">;

async function fetchOwnerListings(client: SupabaseClient, ownerId: string) {
  return client
    .from("properties")
    .select(OWNER_LISTING_COLUMNS)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
}

export default function OwnerPortal({ locale, showIntro = true }: Props) {
  const t = SITE_COPY[locale];
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [portalState, setPortalState] = useState<PortalState>(supabase ? "loading" : "unconfigured");
  const [ownerListings, setOwnerListings] = useState<OwnerListing[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<OwnerListing | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  const [ownerStats, setOwnerStats] = useState<Record<string, { views: number; whatsapp_clicks: number }>>({});
  // Hidden until the availability migration is installed (the functions below do not exist yet).
  const [availabilityReady, setAvailabilityReady] = useState(true);
  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "medium" });
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG");
  // Success fees: off until the payments migration is installed.
  const [paymentsReady, setPaymentsReady] = useState(true);
  const [fees, setFees] = useState<RentalFee[]>([]);
  const [feesLoadedAt, setFeesLoadedAt] = useState(0);
  const [paySettings, setPaySettings] = useState<PaymentSettings | null>(null);
  const [feesVersion, setFeesVersion] = useState(0);
  const [reportingId, setReportingId] = useState<string | null>(null);
  // Returning owners see their listings first; the form opens with "Add another home".
  const [formOpen, setFormOpen] = useState(false);

  // Views and WhatsApp clicks for the owner's published listings.
  const publishedIds = ownerListings.filter((listing) => listing.status === "approved").map((listing) => listing.id).join(",");
  useEffect(() => {
    if (!supabase || !publishedIds) return;
    let mounted = true;
    // Probe for the availability functions: a missing function (PGRST202) means the migration is not installed yet.
    void supabase.rpc("confirm_listing", { target_listing: "00000000-0000-0000-0000-000000000000" }).then(({ error: probeError }) => {
      if (mounted && probeError?.code === "PGRST202") setAvailabilityReady(false);
    });
    void supabase.rpc("listing_stats", { listing_ids: publishedIds.split(",") }).then(({ data, error: statsError }) => {
      if (!mounted || statsError) return;
      const rows = (data ?? []) as Array<{ listing_id: string; views: number; whatsapp_clicks: number }>;
      setOwnerStats(Object.fromEntries(rows.map((row) => [row.listing_id, { views: row.views, whatsapp_clicks: row.whatsapp_clicks }])));
    });
    return () => {
      mounted = false;
    };
  }, [supabase, publishedIds]);

  const ownerId = user?.id ?? null;
  useEffect(() => {
    if (!supabase || !ownerId) return;
    let mounted = true;
    void Promise.all([
      supabase.from("rental_fees").select(RENTAL_FEE_COLUMNS).eq("owner_id", ownerId).order("created_at", { ascending: false }),
      fetchPaymentSettings(supabase),
    ]).then(([{ data, error: feesError }, settings]) => {
      if (!mounted) return;
      if (feesError) {
        if (isMissingFunction(feesError)) setPaymentsReady(false);
        else console.error("Could not load success fees:", feesError);
        return;
      }
      setFees((data ?? []) as unknown as RentalFee[]);
      setFeesLoadedAt(Date.now());
      setPaySettings(settings);
    });
    return () => {
      mounted = false;
    };
  }, [supabase, ownerId, feesVersion]);

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
    setMessage("");
    setError("");
    setConfirmingDeleteId(null);
    document.getElementById("owner-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function stopEditing() {
    setEditing(null);
    setFormVersion((version) => version + 1);
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
      await removeListingImages(supabase, listingImages(listing));
      if (editing?.id === listing.id) stopEditing();
      setOwnerListings((current) => current.filter((item) => item.id !== listing.id));
      setMessage(t.listingDeleted);
    }
    setConfirmingDeleteId(null);
    setSubmitting(false);
  }

  async function setPaused(listing: OwnerListing, pause: boolean) {
    if (!supabase) return;
    setSubmitting(true);
    setError("");
    setMessage("");
    const { data, error: rpcError } = await supabase.rpc("owner_set_listing_paused", { target_listing: listing.id, pause });
    if (rpcError) {
      console.error("Could not change listing availability:", rpcError);
      if (rpcError.code === "PGRST202") setAvailabilityReady(false);
      setError(t.availabilityError);
    } else {
      setOwnerListings((current) => current.map((item) => item.id === listing.id ? { ...item, status: data as OwnerListing["status"], updated_at: new Date().toISOString() } : item));
      setMessage(pause ? t.listingPausedMessage : t.listingResumedMessage);
    }
    setSubmitting(false);
  }

  async function reportRental(listing: OwnerListing, viaSakani: boolean) {
    if (!supabase) return;
    setSubmitting(true);
    setError("");
    setMessage("");
    const { error: rpcError } = await supabase.rpc("owner_report_rental", { target_listing: listing.id, via_sakani: viaSakani });
    setSubmitting(false);
    setReportingId(null);
    if (isMissingFunction(rpcError)) {
      setPaymentsReady(false);
      await setPaused(listing, true);
      return;
    }
    if (rpcError) {
      console.error("Could not report rental:", rpcError);
      setError(t.availabilityError);
      return;
    }
    setOwnerListings((current) => current.map((item) => item.id === listing.id ? { ...item, status: "paused", updated_at: new Date().toISOString() } : item));
    setMessage(viaSakani ? t.rentedThanks : t.rentedHidden);
    setFeesVersion((version) => version + 1);
  }

  async function confirmAvailable(listing: OwnerListing) {
    if (!supabase) return;
    setSubmitting(true);
    setError("");
    setMessage("");
    const { data, error: rpcError } = await supabase.rpc("confirm_listing", { target_listing: listing.id });
    if (rpcError) {
      console.error("Could not confirm listing:", rpcError);
      if (rpcError.code === "PGRST202") setAvailabilityReady(false);
      setError(t.availabilityError);
    } else {
      setOwnerListings((current) => current.map((item) => item.id === listing.id ? { ...item, updated_at: String(data) } : item));
      setMessage(t.listingConfirmedMessage);
    }
    setSubmitting(false);
  }

  const statusLabel = (status: OwnerListing["status"]) => {
    if (status === "approved") return t.statusApproved;
    if (status === "rejected") return t.statusRejected;
    if (status === "paused") return t.statusPaused;
    return t.statusPending;
  };

  return (
    <section className="owner-section" id="owner">
      <div className={`section-wrap owner-layout${showIntro ? "" : " is-standalone"}`}>
        {showIntro && <div className="owner-intro">
          <span className="section-kicker">{t.ownerKicker}</span>
          <h2>{t.ownerTitle}</h2>
          <p>{t.ownerDescription}</p>
          <div className="owner-promotion">
            <span className="promotion-icon"><Sparkles size={19} /></span>
            <span className="promotion-copy"><small>{t.promotionKicker}</small><strong>{t.promotionTitle}</strong><span>{t.promotionText}</span></span>
          </div>
        </div>}

        <div className="owner-panel">
          {portalState === "unconfigured" && (
            <div className="portal-message">
              <BadgeCheck size={25} />
              <h3>{t.ownerSignInTitle}</h3>
              <p>{t.ownerSetupNeeded}</p>
            </div>
          )}

          {/* Shown straight away while the saved session is checked: most visitors are not signed in,
              and a returning owner switches to their dashboard as soon as the page has loaded. */}
          {(portalState === "signed-out" || portalState === "loading") && (
            <div className="owner-signin">
              <span className="signin-icon"><ImagePlus size={19} /></span>
              <h3>{t.ownerSignInTitle}</h3>
              <p>{t.ownerSignInText}</p>
              <Link className="button button-primary owner-submit" href={`/${locale}/account`}>{t.ownerLoginButton}</Link>
              <Captcha locale={locale} onToken={setCaptchaToken} resetKey={captchaReset} />
              <button className="button button-outline owner-guest-button" type="button" disabled={submitting || portalState === "loading"} onClick={() => void startEmailFreeSession()}>
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

              {paymentsReady && supabase && (
                <OwnerPayments
                  locale={locale}
                  supabase={supabase}
                  fees={fees}
                  settings={paySettings}
                  loadedAt={feesLoadedAt}
                  onChanged={() => setFeesVersion((version) => version + 1)}
                />
              )}

              {!(formOpen || editing || (!loadingListings && ownerListings.length === 0)) && (
                <button type="button" className="button button-outline owner-add-another" onClick={() => setFormOpen(true)}>
                  <Plus size={17} /> {t.addAnotherHome}
                </button>
              )}

              {(formOpen || editing || (!loadingListings && ownerListings.length === 0)) && <ListingForm
                key={`${editing?.id ?? "new"}-${formVersion}`}
                locale={locale}
                supabase={supabase!}
                ownerId={user.id}
                editing={editing}
                onCancel={editing ? stopEditing : undefined}
                onSaved={async ({ created }) => {
                  setError("");
                  setMessage(created ? t.listingSubmitted : t.listingUpdated);
                  setFormOpen(false);
                  stopEditing();
                  await refreshListings();
                }}
              />}

              <div className="owner-listings">
                <h4>{t.ownerListings}</h4>
                {availabilityReady && ownerListings.some((listing) => listing.status === "approved") && <p className="owner-listings-hint">{t.confirmReminder}</p>}
                {loadingListings ? <p>{t.loading}</p> : ownerListings.length === 0 ? <p>{t.noOwnerListings}</p> : ownerListings.map((listing) => {
                  const title = locale === "ar" ? listing.title_ar : listing.title_en;
                  const canChange = listing.status === "pending" || listing.status === "rejected";
                  const canDelete = canChange || listing.status === "paused";
                  return (
                    <div className="owner-listing-item" key={listing.id}>
                    <div className="owner-listing-row">
                      <div className="owner-listing-main">
                        {listing.status === "approved"
                          ? <Link href={listingPath(locale, listing.id)}>{title}</Link>
                          : <span>{title}</span>}
                        {listing.status === "rejected" && listing.rejection_reason && (
                          <small className="owner-review-note"><strong>{t.reviewNote}:</strong> {listing.rejection_reason}</small>
                        )}
                        {(listing.status === "approved" || listing.status === "paused") && (
                          <small className="owner-listing-updated">{t.lastUpdated(dateFormat.format(new Date(listing.updated_at)))}</small>
                        )}
                        {listing.status === "approved" && ownerStats[listing.id] && (
                          <small className="owner-listing-stats">
                            {t.statsViews(String(ownerStats[listing.id].views))} · {t.statsWhatsapp(String(ownerStats[listing.id].whatsapp_clicks))}
                          </small>
                        )}
                      </div>
                      <div className="owner-listing-actions">
                        <span className={`listing-status listing-status-${listing.status}`}>{statusLabel(listing.status)}</span>
                        {availabilityReady && listing.status === "approved" && (
                          <>
                            <button type="button" className="owner-text-button" disabled={submitting} onClick={() => void confirmAvailable(listing)}>{t.confirmAvailable}</button>
                            <button type="button" className="owner-text-button" disabled={submitting} onClick={() => (paymentsReady ? setReportingId(listing.id) : void setPaused(listing, true))}>{t.pauseListing}</button>
                          </>
                        )}
                        {availabilityReady && listing.status === "paused" && confirmingDeleteId !== listing.id && (
                          <button type="button" className="owner-text-button" disabled={submitting} onClick={() => void setPaused(listing, false)}>{t.resumeListing}</button>
                        )}
                        {canChange && confirmingDeleteId !== listing.id && (
                          <button type="button" className="owner-text-button" disabled={submitting} onClick={() => startEditing(listing)}>{t.editListing}</button>
                        )}
                        {canDelete && confirmingDeleteId !== listing.id && (
                          <button type="button" className="owner-text-button is-danger" disabled={submitting} onClick={() => setConfirmingDeleteId(listing.id)}>{t.deleteListing}</button>
                        )}
                        {confirmingDeleteId === listing.id && (
                          <>
                            <button type="button" className="owner-text-button is-danger" disabled={submitting} onClick={() => void deleteListing(listing)}>{t.confirmDelete}</button>
                            <button type="button" className="owner-text-button" disabled={submitting} onClick={() => setConfirmingDeleteId(null)}>{t.cancel}</button>
                          </>
                        )}
                      </div>
                    </div>
                    {reportingId === listing.id && (
                      <div className="owner-rented-panel" role="group" aria-label={t.rentedQuestion}>
                        <strong>{t.rentedQuestion}</strong>
                        <p>{t.rentedFeeExplain(numberFormat.format((paySettings ?? DEFAULT_PAYMENT_SETTINGS).fee_percent), numberFormat.format((paySettings ?? DEFAULT_PAYMENT_SETTINGS).fee_minimum))}</p>
                        <div className="owner-rented-actions">
                          <button type="button" className="button button-primary" disabled={submitting} onClick={() => void reportRental(listing, true)}>
                            {t.rentedYes(numberFormat.format(successFee(listing.monthly_price, paySettings ?? DEFAULT_PAYMENT_SETTINGS)))}
                          </button>
                          <button type="button" className="button button-outline" disabled={submitting} onClick={() => void reportRental(listing, false)}>{t.rentedNo}</button>
                          <button type="button" className="text-button" disabled={submitting} onClick={() => setReportingId(null)}>{t.cancel}</button>
                        </div>
                      </div>
                    )}
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
