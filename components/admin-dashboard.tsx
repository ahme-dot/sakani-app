"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { BadgeCheck, ExternalLink, LoaderCircle, LockKeyhole, LogOut, Pencil, Search } from "lucide-react";
import AdminListingEditor from "@/components/admin-listing-editor";
import AdminTeam from "@/components/admin-team";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PUBLIC_LISTING_COLUMNS, listingImages, type MarketplaceListing } from "@/lib/supabase/listings";
import { storagePathFromPublicUrl } from "@/lib/images";
import { listingPath, whatsappLink } from "@/lib/site";

const ADMIN_LISTING_COLUMNS = `${PUBLIC_LISTING_COLUMNS},rejection_reason`;
const STORAGE_BUCKET = "sakani-listings";
const SEARCH_COLUMNS = ["title_ar", "title_en", "area", "university", "whatsapp_number"];
const SEARCH_DEBOUNCE_MS = 300;
type DashboardState = "loading" | "unconfigured" | "signed-out" | "checking" | "denied" | "ready";
type ReviewFilter = MarketplaceListing["status"];
type AdminListing = Omit<MarketplaceListing, "owner_id">;
type ListingPatch = Partial<Pick<AdminListing, "status" | "verified" | "rejection_reason">>;

/** Strips characters that have meaning in a PostgREST `or` filter so user input stays a plain search term. */
function searchTerm(value: string) {
  return value.replace(/[,()*%\\"]/g, " ").replace(/\s+/g, " ").trim();
}

export default function AdminDashboard({ locale }: { locale: SiteLocale }) {
  const t = SITE_COPY[locale];
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<DashboardState>(supabase ? "loading" : "unconfigured");
  const [listings, setListings] = useState<AdminListing[]>([]);
  const [filter, setFilter] = useState<ReviewFilter>("pending");
  const [loadingListings, setLoadingListings] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [view, setView] = useState<"listings" | "team">("listings");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (sessionError) {
        console.error("Could not restore admin session:", sessionError);
        setError(t.adminLoadError);
      }
      const currentUser = data.session?.user ?? null;
      setUser((previous) => (previous?.id === currentUser?.id ? previous : currentUser));
      setState((previous) => (currentUser ? (previous === "ready" ? previous : "checking") : "signed-out"));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const currentUser = session?.user ?? null;
      // Token refreshes emit a new user object for the same account; only re-check admin access when the account changes.
      setUser((previous) => (previous?.id === currentUser?.id ? previous : currentUser));
      setState((previous) => (currentUser ? (previous === "ready" ? previous : "checking") : "signed-out"));
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase, t.adminLoadError]);

  useEffect(() => {
    if (!supabase || !user) return;
    let mounted = true;

    void supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error: adminError }) => {
        if (!mounted) return;
        if (adminError) {
          console.error("Could not verify admin access:", adminError);
          setError(t.adminLoadError);
          setState("denied");
        } else {
          setState(data ? "ready" : "denied");
        }
      });

    return () => {
      mounted = false;
    };
  }, [supabase, user, t.adminLoadError]);

  useEffect(() => {
    const term = searchTerm(search);
    if (term === query) return;
    const timer = window.setTimeout(() => {
      setLoadingListings(true);
      setEditingId(null);
      setQuery(term);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search, query]);

  useEffect(() => {
    if (!supabase || state !== "ready") return;
    let mounted = true;
    let request = supabase
      .from("properties")
      .select(ADMIN_LISTING_COLUMNS)
      .eq("status", filter);
    if (query) request = request.or(SEARCH_COLUMNS.map((column) => `${column}.ilike.*${query}*`).join(","));
    void request
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error: listingError }) => {
        if (!mounted) return;
        if (listingError) {
          console.error("Could not load listings for review:", listingError);
          setListings([]);
          setError(t.adminLoadError);
        } else {
          setListings((data ?? []) as unknown as AdminListing[]);
          setError("");
        }
        setLoadingListings(false);
      });

    return () => {
      mounted = false;
    };
  }, [supabase, state, filter, query, t.adminLoadError]);

  async function updateListing(listingId: string, patch: ListingPatch) {
    if (!supabase) return;
    setUpdatingId(listingId);
    setError("");
    setMessage("");

    const { data: updatedRows, error: updateError } = await supabase
      .from("properties")
      .update(patch)
      .eq("id", listingId)
      .eq("status", filter)
      .select("id");

    // Row-level security silently skips rows the user may not update, so an empty result is also a failure.
    if (updateError || !updatedRows?.length) {
      console.error("Could not update listing review status:", updateError ?? "no rows were updated");
      setError(t.adminUpdateError);
      setUpdatingId(null);
      return;
    }

    if (patch.status && patch.status !== filter) {
      setListings((current) => current.filter((listing) => listing.id !== listingId));
    } else {
      setListings((current) => current.map((listing) => (listing.id === listingId ? { ...listing, ...patch } : listing)));
    }
    setRejectingId(null);
    setRejectReason("");
    setMessage(t.adminStatusUpdated);
    setUpdatingId(null);
  }

  async function deleteListing(listing: AdminListing) {
    if (!supabase) return;
    setUpdatingId(listing.id);
    setError("");
    setMessage("");

    const { data, error: deleteError } = await supabase.from("properties").delete().eq("id", listing.id).select("id");
    if (deleteError || !data?.length) {
      console.error("Could not delete listing:", deleteError ?? "no rows were deleted");
      setError(t.adminUpdateError);
    } else {
      const paths = listingImages(listing)
        .map((url) => storagePathFromPublicUrl(url, STORAGE_BUCKET))
        .filter((path): path is string => Boolean(path));
      if (paths.length) {
        const { error: removeError } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
        if (removeError) console.warn("Listing images were not removed from storage:", removeError);
      }
      setListings((current) => current.filter((item) => item.id !== listing.id));
      setMessage(t.adminStatusUpdated);
    }
    setDeletingId(null);
    setUpdatingId(null);
  }

  async function signOut() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      console.error("Could not sign out admin:", signOutError);
      setError(t.adminSignInError);
    } else {
      router.replace(`/${locale}/sign-in`);
    }
  }

  if (state === "loading" || state === "checking") {
    return <main className="admin-page" dir={locale === "ar" ? "rtl" : "ltr"}><div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div></main>;
  }

  if (state !== "ready") {
    const unavailableMessage = state === "unconfigured"
      ? t.ownerSetupNeeded
      : state === "denied"
        ? t.adminAccessDenied
        : t.signInDescription;

    return (
      <main className="admin-page" dir={locale === "ar" ? "rtl" : "ltr"}>
        <section className="admin-auth-panel">
          <span className="signin-icon"><LockKeyhole size={20} /></span>
          <span className="section-kicker">{t.adminNav}</span>
          <h1>{t.adminNav}</h1>
          <p>{unavailableMessage}</p>
          {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
          {state === "signed-out" && <Link className="button button-primary owner-submit" href={`/${locale}/sign-in`}>{t.signIn}</Link>}
          {state === "denied" && <button className="signout-button" type="button" onClick={() => void signOut()}><LogOut size={15} />{t.adminSignOut}</button>}
          <Link className="admin-home-link" href={locale === "ar" ? "/ar" : "/en"}>{t.adminBackHome}</Link>
        </section>
      </main>
    );
  }

  const tabs: Array<{ value: ReviewFilter; label: string }> = [
    { value: "pending", label: t.adminPending },
    { value: "approved", label: t.adminApproved },
    { value: "rejected", label: t.adminRejected },
  ];
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG");

  return (
    <main className="admin-page admin-dashboard-page" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="admin-dashboard">
        <header className="admin-dashboard-header">
          <div>
            <span className="section-kicker"><BadgeCheck size={15} /> {user?.email}</span>
            <h1>{t.adminDashboardTitle}</h1>
            <p>{t.adminDashboardDescription}</p>
          </div>
          <div className="admin-header-actions">
            <Link className="admin-home-link" href={locale === "ar" ? "/ar" : "/en"}>{t.adminBackHome}</Link>
            <button className="signout-button" type="button" onClick={() => void signOut()}><LogOut size={15} />{t.adminSignOut}</button>
          </div>
        </header>

        <nav className="admin-view-switch" aria-label={t.adminNav}>
          {(["listings", "team"] as const).map((value) => (
            <button key={value} type="button" className={view === value ? "is-active" : ""} aria-pressed={view === value} onClick={() => setView(value)}>
              {value === "listings" ? t.adminViewListings : t.adminViewTeam}
            </button>
          ))}
        </nav>

        {view === "team" && supabase && user ? (
          <AdminTeam locale={locale} supabase={supabase} currentUserId={user.id} />
        ) : (
        <>
        <nav className="admin-filter-tabs" aria-label={t.adminDashboardTitle}>
          {tabs.map((tab) => (
            <button
              className={filter === tab.value ? "is-active" : ""}
              type="button"
              key={tab.value}
              aria-pressed={filter === tab.value}
              onClick={() => {
                if (tab.value === filter) return;
                setLoadingListings(true);
                setRejectingId(null);
                setDeletingId(null);
                setEditingId(null);
                setMessage("");
                setFilter(tab.value);
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <label className="admin-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" value={search} aria-label={t.adminSearchLabel} placeholder={t.adminSearchPlaceholder} onChange={(event) => setSearch(event.target.value)} />
        </label>

        {message && <p className="owner-feedback owner-feedback-success" role="status">{message}</p>}
        {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}

        {loadingListings ? (
          <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>
        ) : listings.length === 0 ? (
          <section className="admin-empty-state"><p>{query ? t.adminNoSearchResults : t.adminNoListings}</p></section>
        ) : (
          <div className="admin-listing-grid">
            {listings.map((listing) => {
              const title = locale === "ar" ? listing.title_ar : listing.title_en;
              const images = listingImages(listing);
              const busy = updatingId === listing.id;
              if (editingId === listing.id && supabase) {
                return (
                  <article className="admin-listing-card is-editing" key={listing.id}>
                    <div className="admin-listing-content">
                      <AdminListingEditor
                        locale={locale}
                        supabase={supabase}
                        listing={listing}
                        columns={ADMIN_LISTING_COLUMNS}
                        onCancel={() => setEditingId(null)}
                        onSaved={(saved) => {
                          setListings((current) => current.map((item) => (item.id === saved.id ? saved : item)));
                          setEditingId(null);
                          setError("");
                          setMessage(t.adminListingSaved);
                        }}
                      />
                    </div>
                  </article>
                );
              }
              return (
                <article className="admin-listing-card" key={listing.id}>
                  <Image className="admin-listing-image" src={images[0]} alt={title} width={700} height={420} sizes="(max-width: 640px) 100vw, 520px" />
                  {images.length > 1 && (
                    <div className="admin-listing-thumbs">
                      {images.slice(1).map((src, index) => (
                        <a key={src} href={src} target="_blank" rel="noreferrer">
                          <Image src={src} alt={t.photoAlt(title, index + 2)} width={96} height={72} />
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="admin-listing-content">
                    <div className="admin-listing-heading">
                      <span className="admin-listing-badges">
                        <span className={`listing-status listing-status-${listing.status}`}>{tabs.find((tab) => tab.value === listing.status)?.label}</span>
                        {listing.verified && <span className="listing-status listing-status-approved"><BadgeCheck size={12} /> {t.adminVerifiedBadge}</span>}
                      </span>
                      <time dateTime={listing.created_at}>{t.adminSubmitted}: {new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-EG", { dateStyle: "medium" }).format(new Date(listing.created_at))}</time>
                    </div>
                    <h2>{title}</h2>
                    <p>{locale === "ar" ? listing.description_ar : listing.description_en}</p>
                    <dl className="admin-listing-details">
                      <div><dt>{t.area}</dt><dd>{listing.area}</dd></div>
                      <div><dt>{t.university}</dt><dd>{listing.university}</dd></div>
                      <div><dt>{t.adminDetailsType}</dt><dd>{t[listing.property_type]}</dd></div>
                      <div><dt>{t.adminDetailsGender}</dt><dd>{t[listing.gender]}</dd></div>
                      <div><dt>{t.price}</dt><dd>{numberFormat.format(listing.monthly_price)}</dd></div>
                      <div><dt>{t.deposit}</dt><dd>{numberFormat.format(listing.deposit)}</dd></div>
                      <div><dt>{t.adminDetailsBeds}</dt><dd>{listing.available_beds} / {listing.total_beds}</dd></div>
                      <div><dt>{t.adminDetailsWalk}</dt><dd>{t.walkingMinutes(listing.walking_distance_minutes)}</dd></div>
                      <div><dt>{t.adminContact}</dt><dd><a href={whatsappLink(listing.whatsapp_number)} target="_blank" rel="noreferrer" dir="ltr">{listing.whatsapp_number}</a></dd></div>
                    </dl>
                    {listing.status === "rejected" && listing.rejection_reason && (
                      <p className="owner-review-note"><strong>{t.reviewNote}:</strong> {listing.rejection_reason}</p>
                    )}

                    {rejectingId === listing.id ? (
                      <form
                        className="admin-reject-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void updateListing(listing.id, { status: "rejected", rejection_reason: rejectReason.trim() || null });
                        }}
                      >
                        <label className="owner-field">
                          <span>{t.adminRejectReason}</span>
                          <textarea rows={2} maxLength={500} value={rejectReason} placeholder={t.adminRejectReasonPlaceholder} onChange={(event) => setRejectReason(event.target.value)} />
                        </label>
                        <div className="admin-listing-actions">
                          <button className="button admin-reject-button" type="submit" disabled={busy}>{busy ? t.sending : t.adminConfirmReject}</button>
                          <button className="signout-button" type="button" disabled={busy} onClick={() => setRejectingId(null)}>{t.cancel}</button>
                        </div>
                      </form>
                    ) : deletingId === listing.id ? (
                      <div className="admin-listing-actions">
                        <button className="button admin-reject-button" type="button" disabled={busy} onClick={() => void deleteListing(listing)}>{busy ? t.sending : t.adminConfirmDelete}</button>
                        <button className="signout-button" type="button" disabled={busy} onClick={() => setDeletingId(null)}>{t.cancel}</button>
                      </div>
                    ) : (
                      <div className="admin-listing-actions">
                        {listing.status !== "approved" && (
                          <button className="button button-primary owner-submit" type="button" disabled={busy} onClick={() => void updateListing(listing.id, { status: "approved", rejection_reason: null })}>
                            {busy ? t.sending : listing.status === "pending" ? t.adminApprove : t.adminRestore}
                          </button>
                        )}
                        {listing.status !== "rejected" && (
                          <button className="button admin-reject-button" type="button" disabled={busy} onClick={() => { setRejectingId(listing.id); setRejectReason(""); }}>
                            {listing.status === "pending" ? t.adminReject : t.adminUnpublish}
                          </button>
                        )}
                        {listing.status !== "rejected" && (
                          <button className="signout-button" type="button" disabled={busy} onClick={() => void updateListing(listing.id, { verified: !listing.verified })}>
                            {listing.verified ? t.adminUnverify : t.adminVerify}
                          </button>
                        )}
                        {listing.status === "approved" && (
                          <Link className="signout-button admin-view-link" href={listingPath(locale, listing.id)} target="_blank"><ExternalLink size={13} /> {t.adminViewPublic}</Link>
                        )}
                        <button className="signout-button" type="button" disabled={busy} onClick={() => { setEditingId(listing.id); setRejectingId(null); setDeletingId(null); setMessage(""); }}>
                          <Pencil size={13} /> {t.adminEdit}
                        </button>
                        <button className="owner-text-button is-danger" type="button" disabled={busy} onClick={() => setDeletingId(listing.id)}>{t.adminDelete}</button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        </>
        )}
      </div>
    </main>
  );
}
