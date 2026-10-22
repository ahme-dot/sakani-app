"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  BadgeCheck,
  BedDouble,
  Building2,
  Clock3,
  ExternalLink,
  Flag,
  GraduationCap,
  Home,
  Images,
  Inbox,
  LayoutList,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MapPin,
  MessageCircle,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  UsersRound,
  Eye,
  Megaphone,
  PlusCircle,
  Wallet,
  X,
} from "lucide-react";
import AdminGrow from "@/components/admin-grow";
import AdminPayments from "@/components/admin-payments";
import AdminInbox from "@/components/admin-inbox";
import ListingForm from "@/components/listing-form";
import VisitChecklist, { readVisit } from "@/components/visit-checklist";
import AdminListingEditor from "@/components/admin-listing-editor";
import AdminReports from "@/components/admin-reports";
import AdminTeam from "@/components/admin-team";
import AdminUsers, { type DirectoryUser } from "@/components/admin-users";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PUBLIC_LISTING_COLUMNS, listingImages, type MarketplaceListing } from "@/lib/supabase/listings";
import { storagePathFromPublicUrl } from "@/lib/images";
import { listingPath, whatsappLink } from "@/lib/site";
import { areas, universities } from "@/lib/data";

const ADMIN_LISTING_COLUMNS = `${PUBLIC_LISTING_COLUMNS},owner_id,rejection_reason`;
const STORAGE_BUCKET = "sakani-listings";
const SEARCH_COLUMNS = ["title_ar", "title_en", "area", "university", "whatsapp_number"];
const SEARCH_DEBOUNCE_MS = 300;
/** Published listings not updated or confirmed for this long are flagged as possibly out of date. */
const STALE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
type DashboardState = "loading" | "unconfigured" | "signed-out" | "checking" | "denied" | "ready";
type ReviewFilter = MarketplaceListing["status"];
type AdminView = "listings" | "add" | "reports" | "inbox" | "payments" | "users" | "grow" | "team";
type ListingStats = { views: number; whatsapp_clicks: number };
type AdminListing = MarketplaceListing;
type ListingPatch = Partial<Pick<AdminListing, "status" | "verified" | "rejection_reason">>;
type Counts = Record<ReviewFilter | "verified", number>;

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
  const [view, setView] = useState<AdminView>("listings");
  const [listings, setListings] = useState<AdminListing[]>([]);
  const [filter, setFilter] = useState<ReviewFilter>("pending");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [countsVersion, setCountsVersion] = useState(0);
  const [loadingListings, setLoadingListings] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [listingStats, setListingStats] = useState<Record<string, ListingStats>>({});
  const [addVersion, setAddVersion] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<DirectoryUser | null>(null);
  const [listingIdFilter, setListingIdFilter] = useState<string | null>(null);
  const [staleOnly, setStaleOnly] = useState(false);
  // When the current listings were loaded; listing ages are measured from this, not during render.
  const [loadedAt, setLoadedAt] = useState(0);
  const [openReports, setOpenReports] = useState(0);
  const [openMessages, setOpenMessages] = useState(0);
  const [feesToCheck, setFeesToCheck] = useState(0);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState("");
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
    if (ownerFilter) request = request.eq("owner_id", ownerFilter.user_id);
    if (listingIdFilter) request = request.eq("id", listingIdFilter);
    if (staleOnly && filter === "approved") request = request.lt("updated_at", new Date(Date.now() - STALE_DAYS * DAY_MS).toISOString());
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
          setLoadedAt(Date.now());
          setError("");
        }
        setLoadingListings(false);
      });

    return () => {
      mounted = false;
    };
  }, [supabase, state, filter, query, ownerFilter, listingIdFilter, staleOnly, t.adminLoadError]);

  // Users and their listing counts (admin-only database function); refreshed with the summary counts.
  useEffect(() => {
    if (!supabase || state !== "ready") return;
    let mounted = true;
    void supabase.rpc("admin_user_directory").then(({ data, error: directoryLoadError }) => {
      if (!mounted) return;
      if (directoryLoadError) {
        console.error("Could not load users:", directoryLoadError);
        setDirectoryError(t.usersLoadError);
      } else {
        setDirectory((data ?? []) as DirectoryUser[]);
        setDirectoryError("");
      }
      setDirectoryLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [supabase, state, countsVersion, t.usersLoadError]);

  const ownersById = useMemo(() => new Map(directory.map((entry) => [entry.user_id, entry])), [directory]);

  // Views and WhatsApp clicks for the listings on screen.
  const listingIds = useMemo(() => listings.map((listing) => listing.id).join(","), [listings]);
  useEffect(() => {
    if (!supabase || state !== "ready" || !listingIds) return;
    let mounted = true;
    void supabase.rpc("listing_stats", { listing_ids: listingIds.split(",") }).then(({ data, error: statsError }) => {
      if (!mounted) return;
      if (statsError) {
        console.warn("Listing stats unavailable:", statsError.message);
        return;
      }
      const rows = (data ?? []) as Array<{ listing_id: string; views: number; whatsapp_clicks: number }>;
      setListingStats(Object.fromEntries(rows.map((row) => [row.listing_id, { views: row.views, whatsapp_clicks: row.whatsapp_clicks }])));
    });
    return () => {
      mounted = false;
    };
  }, [supabase, state, listingIds]);

  // Summary counts for the overview cards; refreshed after every change.
  useEffect(() => {
    if (!supabase || state !== "ready") return;
    let mounted = true;
    const count = (status: ReviewFilter, verifiedOnly = false) => {
      let request = supabase.from("properties").select("id", { count: "exact", head: true }).eq("status", status);
      if (verifiedOnly) request = request.eq("verified", true);
      return request.then(({ count: value }) => value ?? 0);
    };
    void Promise.all([count("pending"), count("approved"), count("rejected"), count("paused"), count("approved", true)]).then(
      ([pending, approved, rejected, paused, verified]) => {
        if (mounted) setCounts({ pending, approved, rejected, paused, verified });
      },
    );
    void supabase
      .from("listing_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .then(({ count: reportCount }) => {
        if (mounted) setOpenReports(reportCount ?? 0);
      });
    void supabase
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .then(({ count: messageCount }) => {
        if (mounted) setOpenMessages(messageCount ?? 0);
      });
    // Fees with a transfer to check (0 until the payments migration is installed).
    void supabase
      .from("rental_fees")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted")
      .then(({ count: feeCount, error: feeError }) => {
        if (mounted) setFeesToCheck(feeError ? 0 : feeCount ?? 0);
      });
    return () => {
      mounted = false;
    };
  }, [supabase, state, countsVersion]);

  const refreshCounts = () => setCountsVersion((value) => value + 1);

  async function chargeFee(listingId: string) {
    if (!supabase) return;
    setUpdatingId(listingId);
    setError("");
    setMessage("");
    const { error: chargeError } = await supabase.rpc("admin_charge_fee", { target_listing: listingId });
    setUpdatingId(null);
    if (chargeError) {
      console.error("Could not add success fee:", chargeError);
      setError(chargeError.code === "PGRST202" ? t.paymentsMigration : t.adminUpdateError);
      return;
    }
    setMessage(t.feeCharged);
    refreshCounts();
  }

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
    refreshCounts();
  }

  async function verifyListing(listingId: string, formData: FormData) {
    if (!supabase) return;
    const visit = readVisit(formData);
    if (!visit) {
      setError(t.visitIncomplete);
      return;
    }
    setUpdatingId(listingId);
    setError("");
    setMessage("");
    const { error: verifyError } = await supabase.rpc("admin_verify_listing", {
      target_listing: listingId,
      visit_date: visit.date,
      visit_checklist: visit.checklist,
      visit_notes: visit.notes,
    });
    if (verifyError) {
      console.error("Could not record the verification visit:", verifyError);
      setError(t.adminUpdateError);
    } else {
      setListings((current) => current.map((listing) => (listing.id === listingId ? { ...listing, verified: true, verified_at: visit.date } : listing)));
      setVerifyingId(null);
      setMessage(t.adminStatusUpdated);
      refreshCounts();
    }
    setUpdatingId(null);
  }

  async function unverifyListing(listingId: string) {
    if (!supabase) return;
    setUpdatingId(listingId);
    setError("");
    setMessage("");
    const { error: unverifyError } = await supabase.rpc("admin_unverify_listing", { target_listing: listingId });
    if (unverifyError) {
      console.error("Could not remove verification:", unverifyError);
      setError(t.adminUpdateError);
    } else {
      setListings((current) => current.map((listing) => (listing.id === listingId ? { ...listing, verified: false, verified_at: null } : listing)));
      setMessage(t.adminStatusUpdated);
      refreshCounts();
    }
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
      refreshCounts();
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

  function selectFilter(next: ReviewFilter) {
    if (next === filter) return;
    setLoadingListings(true);
    setRejectingId(null);
    setDeletingId(null);
    setEditingId(null);
    setMessage("");
    setFilter(next);
  }

  function selectView(next: AdminView) {
    setView(next);
    setMessage("");
    setError("");
  }

  function reviewReportedListing(listingId: string, status: ReviewFilter) {
    setLoadingListings(true);
    setEditingId(null);
    setRejectingId(null);
    setDeletingId(null);
    setOwnerFilter(null);
    setListingIdFilter(listingId);
    setFilter(status);
    setView("listings");
  }

  function showOwnerListings(owner: DirectoryUser | null) {
    setLoadingListings(true);
    setEditingId(null);
    setRejectingId(null);
    setDeletingId(null);
    setListingIdFilter(null);
    setOwnerFilter(owner);
    if (owner) {
      // Open the tab where this person has listings, preferring ones waiting for review.
      const status: ReviewFilter = owner.listings_pending > 0 ? "pending" : owner.listings_approved > 0 ? "approved" : "rejected";
      setFilter(status);
      setView("listings");
    }
  }

  const dir = locale === "ar" ? "rtl" : "ltr";

  if (state === "loading" || state === "checking") {
    return <main className="admin-page" dir={dir}><div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div></main>;
  }

  if (state !== "ready") {
    const unavailableMessage = state === "unconfigured"
      ? t.ownerSetupNeeded
      : state === "denied"
        ? t.adminAccessDenied
        : t.signInDescription;

    return (
      <main className="admin-page" dir={dir}>
        <section className="admin-auth-panel">
          <span className="signin-icon"><LockKeyhole size={20} /></span>
          <span className="section-kicker">{t.adminNav}</span>
          <h1>{t.adminNav}</h1>
          <p>{unavailableMessage}</p>
          {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
          {state === "signed-out" && <Link className="button button-primary owner-submit" href={`/${locale}/sign-in`}>{t.signIn}</Link>}
          {state === "denied" && <button className="signout-button" type="button" onClick={() => void signOut()}><LogOut size={15} />{t.adminSignOut}</button>}
          <Link className="admin-home-link" href={`/${locale}`}>{t.adminBackHome}</Link>
        </section>
      </main>
    );
  }

  const statusLabel: Record<ReviewFilter, string> = { pending: t.adminPending, approved: t.adminApproved, rejected: t.adminRejected, paused: t.adminStatusPaused };
  const stats: Array<{ value: ReviewFilter; label: string; hint: string }> = [
    { value: "pending", label: t.adminPending, hint: t.adminStatPendingHint },
    { value: "approved", label: t.adminApproved, hint: t.adminStatApprovedHint },
    { value: "paused", label: t.adminStatusPaused, hint: t.adminStatPausedHint },
    { value: "rejected", label: t.adminRejected, hint: t.adminStatRejectedHint },
  ];
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG");
  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "medium" });
  const navItems: Array<{ value: AdminView; label: string; icon: typeof Users; badge?: number }> = [
    { value: "listings", label: t.adminViewListings, icon: LayoutList, badge: counts?.pending },
    { value: "add", label: t.adminViewAddListing, icon: PlusCircle },
    { value: "reports", label: t.adminViewReports, icon: Flag, badge: openReports },
    { value: "inbox", label: t.adminViewInbox, icon: Inbox, badge: openMessages },
    { value: "payments", label: t.adminViewPayments, icon: Wallet, badge: feesToCheck },
    { value: "users", label: t.adminViewUsers, icon: UsersRound },
    { value: "grow", label: t.adminViewGrow, icon: Megaphone },
    { value: "team", label: t.adminViewTeam, icon: Users },
  ];
  const viewHeadings: Record<AdminView, { title: string; description: string }> = {
    listings: { title: t.adminDashboardTitle, description: t.adminDashboardDescription },
    add: { title: t.addListingTitle, description: t.addListingDescription },
    reports: { title: t.reportsTitle, description: t.reportsDescription },
    inbox: { title: t.inboxTitle, description: t.inboxDescription },
    payments: { title: t.adminViewPayments, description: t.paymentsAdminDescription },
    users: { title: t.usersTitle, description: t.usersDescription },
    grow: { title: t.growTitle, description: t.growDescription },
    team: { title: t.teamTitle, description: t.teamDescription },
  };

  return (
    <div className="admin-shell" dir={dir}>
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="brand-mark"><Building2 size={19} strokeWidth={2.2} /></span>
          <span><strong>{t.brandLabel}</strong><small>{t.adminPanel}</small></span>
        </div>
        <nav className="admin-nav" aria-label={t.adminPanel}>
          {navItems.map(({ value, label, icon: Icon, badge }) => (
            <button key={value} type="button" className={view === value ? "is-active" : ""} aria-current={view === value ? "page" : undefined} onClick={() => selectView(value)}>
              <Icon size={18} />
              <span>{label}</span>
              {Boolean(badge) && <span className="admin-nav-badge">{numberFormat.format(badge!)}</span>}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <div className="admin-user" title={user?.email}>
            <span className="admin-avatar" aria-hidden="true">{user?.email?.[0]?.toUpperCase()}</span>
            <span dir="ltr">{user?.email}</span>
          </div>
          <Link className="admin-side-link" href={`/${locale}`}><Home size={16} /><span>{t.adminBackHome}</span></Link>
          <button className="admin-side-link" type="button" onClick={() => void signOut()}><LogOut size={16} /><span>{t.adminSignOut}</span></button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-main-header">
          <h1>{viewHeadings[view].title}</h1>
          <p>{viewHeadings[view].description}</p>
        </header>

        {view === "team" && supabase && user ? (
          <AdminTeam locale={locale} supabase={supabase} currentUserId={user.id} />
        ) : view === "reports" && supabase && user ? (
          <AdminReports locale={locale} supabase={supabase} currentUserId={user.id} onChanged={refreshCounts} onReviewListing={reviewReportedListing} />
        ) : view === "add" && supabase && user ? (
          <section className="admin-add">
            {message && <p className="owner-feedback owner-feedback-success admin-feedback" role="status">{message}</p>}
            <div className="admin-add-card">
              <ListingForm
                key={addVersion}
                locale={locale}
                supabase={supabase}
                ownerId={user.id}
                mode="admin"
                onSaved={() => {
                  setMessage(t.addListingSaved);
                  setAddVersion((value) => value + 1);
                  refreshCounts();
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            </div>
          </section>
        ) : view === "payments" ? (
          <AdminPayments locale={locale} supabase={supabase!} onChanged={refreshCounts} />
        ) : view === "grow" ? (
          <AdminGrow locale={locale} />
        ) : view === "inbox" && supabase && user ? (
          <AdminInbox locale={locale} supabase={supabase} currentUserId={user.id} onChanged={refreshCounts} />
        ) : view === "users" ? (
          <AdminUsers locale={locale} users={directory} loading={directoryLoading} error={directoryError} onViewListings={showOwnerListings} />
        ) : (
          <>
            <div className="admin-stats" role="tablist" aria-label={t.adminDashboardTitle}>
              {stats.map((stat) => (
                <button
                  key={stat.value}
                  type="button"
                  role="tab"
                  aria-selected={filter === stat.value}
                  className={`admin-stat admin-stat-${stat.value}${filter === stat.value ? " is-active" : ""}`}
                  onClick={() => selectFilter(stat.value)}
                >
                  <span className="admin-stat-label">{stat.label}</span>
                  <strong>{counts ? numberFormat.format(counts[stat.value]) : "–"}</strong>
                  <small>{stat.hint}</small>
                </button>
              ))}
              <div className="admin-stat admin-stat-verified">
                <span className="admin-stat-label"><ShieldCheck size={14} /> {t.adminVerifiedBadge}</span>
                <strong>{counts ? numberFormat.format(counts.verified) : "–"}</strong>
                <small>{counts ? t.adminStatVerifiedHint(counts.approved) : ""}</small>
              </div>
            </div>

            <div className="admin-toolbar">
              <label className="admin-search">
                <Search size={16} aria-hidden="true" />
                <input type="search" value={search} aria-label={t.adminSearchLabel} placeholder={t.adminSearchPlaceholder} onChange={(event) => setSearch(event.target.value)} />
              </label>
              {filter === "approved" && (
                <label className="choice admin-stale-toggle">
                  <input type="checkbox" checked={staleOnly} onChange={(event) => { setLoadingListings(true); setStaleOnly(event.target.checked); }} />
                  <span><Clock3 size={14} /> {t.adminStaleFilter}</span>
                </label>
              )}
              <span className="admin-toolbar-count">{loadingListings ? "" : t.adminShowingCount(listings.length, statusLabel[filter])}</span>
            </div>

            {listingIdFilter && (
              <div className="admin-owner-filter">
                <Flag size={15} />
                <span>{t.reportReviewListing}</span>
                <button type="button" onClick={() => { setLoadingListings(true); setListingIdFilter(null); }} aria-label={t.clearOwnerFilter}><X size={14} /> {t.clearOwnerFilter}</button>
              </div>
            )}

            {ownerFilter && (
              <div className="admin-owner-filter">
                <UserRound size={15} />
                <span>{t.filteringByOwner(ownerFilter.is_guest ? t.ownerGuest : ownerFilter.full_name || ownerFilter.email)}</span>
                <button type="button" onClick={() => showOwnerListings(null)} aria-label={t.clearOwnerFilter}><X size={14} /> {t.clearOwnerFilter}</button>
              </div>
            )}

            {message && <p className="owner-feedback owner-feedback-success admin-feedback" role="status">{message}</p>}
            {error && <p className="owner-feedback owner-feedback-error admin-feedback" role="alert">{error}</p>}

            {loadingListings ? (
              <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>
            ) : listings.length === 0 ? (
              <section className="admin-empty-state">
                <LayoutList size={26} />
                <p>{query ? t.adminNoSearchResults : t.adminNoListings}</p>
              </section>
            ) : (
              <div className="admin-card-list">
                {listings.map((listing, index) => {
                  const title = locale === "ar" ? listing.title_ar : listing.title_en;
                  const images = listingImages(listing);
                  const busy = updatingId === listing.id;
                  const area = areas.find((candidate) => candidate.name_en === listing.area);
                  const university = universities.find((candidate) => candidate.name_en === listing.university);

                  if (editingId === listing.id && supabase) {
                    return (
                      <article className="admin-card is-editing" key={listing.id}>
                        <div className="admin-card-body">
                          <AdminListingEditor
                            locale={locale}
                            supabase={supabase}
                            listing={listing}
                            columns={ADMIN_LISTING_COLUMNS}
                            onCancel={() => setEditingId(null)}
                            onSaved={(saved) => {
                              setListings((current) => current.map((item) => (item.id === saved.id ? { ...item, ...saved } : item)));
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
                    <article className="admin-card" key={listing.id}>
                      <a className="admin-card-media" href={images[0]} target="_blank" rel="noreferrer" aria-label={t.photoAlt(title, 1)}>
                        <Image src={images[0]} alt="" fill sizes="(max-width: 760px) 100vw, 280px" priority={index < 2} />
                        {images.length > 1 && <span className="admin-card-photos"><Images size={13} /> {numberFormat.format(images.length)}</span>}
                      </a>

                      <div className="admin-card-body">
                        <div className="admin-card-top">
                          <span className="admin-card-badges">
                            <span className={`listing-status listing-status-${listing.status}`}>{statusLabel[listing.status]}</span>
                            {listing.verified && <span className="listing-status listing-status-approved"><BadgeCheck size={12} /> {t.adminVerifiedBadge}</span>}
                            {listing.status === "approved" && loadedAt - new Date(listing.updated_at).getTime() > STALE_DAYS * DAY_MS && (
                              <span className="listing-status listing-status-stale"><Clock3 size={12} /> {t.adminStaleBadge(numberFormat.format(Math.floor((loadedAt - new Date(listing.updated_at).getTime()) / DAY_MS)))}</span>
                            )}
                          </span>
                          <time dateTime={listing.created_at}>{dateFormat.format(new Date(listing.created_at))}</time>
                        </div>

                        <h2>{title}</h2>
                        <p className="admin-card-meta">
                          <span><MapPin size={14} /> {locale === "ar" ? area?.name ?? listing.area : listing.area}</span>
                          <span><GraduationCap size={14} /> {locale === "ar" ? university?.name ?? listing.university : listing.university}</span>
                        </p>
                        <p className="admin-card-desc">{locale === "ar" ? listing.description_ar : listing.description_en}</p>

                        <ul className="admin-card-facts">
                          <li className="is-price"><Wallet size={14} /> <strong>{numberFormat.format(listing.monthly_price)}</strong> {t.perMonth}</li>
                          <li>{t.adminDepositShort}: {numberFormat.format(listing.deposit)}</li>
                          <li><Building2 size={14} /> {t[listing.property_type]} · {t[listing.gender]}</li>
                          <li><BedDouble size={14} /> {t.bedsSummary(listing.available_beds, listing.total_beds)}</li>
                          <li><Clock3 size={14} /> {t.walkingMinutes(listing.walking_distance_minutes)}</li>
                          {listing.status === "approved" && listingStats[listing.id] && (
                            <li className="is-stats">
                              <Eye size={14} /> {t.statsViews(numberFormat.format(listingStats[listing.id].views))} · {t.statsWhatsapp(numberFormat.format(listingStats[listing.id].whatsapp_clicks))}
                            </li>
                          )}
                          <li>
                            <a href={whatsappLink(listing.whatsapp_number)} target="_blank" rel="noreferrer" dir="ltr"><MessageCircle size={14} /> {listing.whatsapp_number}</a>
                          </li>
                        </ul>

                        {listing.status === "rejected" && listing.rejection_reason && (
                          <p className="owner-review-note"><strong>{t.reviewNote}:</strong> {listing.rejection_reason}</p>
                        )}

                        {(() => {
                          const owner = ownersById.get(listing.owner_id);
                          return (
                            <div className="admin-card-owner">
                              <span className={`admin-avatar${!owner || owner.is_guest ? " is-guest" : ""}`} aria-hidden="true">
                                {!owner || owner.is_guest ? <UserRound size={14} /> : (owner.full_name || owner.email)[0]?.toUpperCase()}
                              </span>
                              <span className="admin-card-owner-text">
                                <small>{t.ownerLabel}</small>
                                <strong>{!owner ? "–" : owner.is_guest ? t.ownerGuest : owner.full_name || owner.email}</strong>
                                {owner && !owner.is_guest && owner.email && (
                                  <a href={`mailto:${owner.email}`} dir="ltr">{owner.email}</a>
                                )}
                              </span>
                              {owner && !ownerFilter && owner.listings_total > 1 && (
                                <button className="admin-owner-more" type="button" onClick={() => showOwnerListings(owner)}>
                                  {t.ownerListingCount(owner.listings_total)}
                                </button>
                              )}
                            </div>
                          );
                        })()}

                        {rejectingId === listing.id ? (
                          <form
                            className="admin-inline-panel"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void updateListing(listing.id, { status: "rejected", rejection_reason: rejectReason.trim() || null });
                            }}
                          >
                            <label className="owner-field">
                              <span>{t.adminRejectReason}</span>
                              <textarea rows={2} maxLength={500} value={rejectReason} placeholder={t.adminRejectReasonPlaceholder} onChange={(event) => setRejectReason(event.target.value)} autoFocus />
                            </label>
                            <div className="admin-card-actions">
                              <button className="admin-btn admin-btn-danger" type="submit" disabled={busy}>{busy ? t.sending : t.adminConfirmReject}</button>
                              <button className="admin-btn admin-btn-ghost" type="button" disabled={busy} onClick={() => setRejectingId(null)}>{t.cancel}</button>
                            </div>
                          </form>
                        ) : verifyingId === listing.id ? (
                          <form
                            className="admin-inline-panel"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void verifyListing(listing.id, new FormData(event.currentTarget));
                            }}
                          >
                            <VisitChecklist locale={locale} />
                            <div className="admin-card-actions">
                              <button className="admin-btn admin-btn-primary" type="submit" disabled={busy}><BadgeCheck size={15} /> {busy ? t.sending : t.visitConfirm}</button>
                              <button className="admin-btn admin-btn-ghost" type="button" disabled={busy} onClick={() => setVerifyingId(null)}>{t.cancel}</button>
                            </div>
                          </form>
                        ) : deletingId === listing.id ? (
                          <div className="admin-inline-panel is-danger">
                            <p>{t.adminDeleteWarning}</p>
                            <div className="admin-card-actions">
                              <button className="admin-btn admin-btn-danger" type="button" disabled={busy} onClick={() => void deleteListing(listing)}>{busy ? t.sending : t.adminConfirmDelete}</button>
                              <button className="admin-btn admin-btn-ghost" type="button" disabled={busy} onClick={() => setDeletingId(null)}>{t.cancel}</button>
                            </div>
                          </div>
                        ) : (
                          <div className="admin-card-actions">
                            {listing.status !== "approved" && (
                              <button className="admin-btn admin-btn-primary" type="button" disabled={busy} onClick={() => void updateListing(listing.id, { status: "approved", rejection_reason: null })}>
                                {busy ? t.sending : listing.status === "pending" ? t.adminApprove : t.adminRestore}
                              </button>
                            )}
                            {listing.status !== "rejected" && (
                              <button className="admin-btn admin-btn-danger-outline" type="button" disabled={busy} onClick={() => { setRejectingId(listing.id); setRejectReason(""); }}>
                                {listing.status === "pending" ? t.adminReject : t.adminUnpublish}
                              </button>
                            )}
                            {listing.status !== "rejected" && (
                              <button
                                className={`admin-btn admin-btn-ghost${listing.verified ? " is-on" : ""}`}
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  if (listing.verified) void unverifyListing(listing.id);
                                  else { setVerifyingId(listing.id); setRejectingId(null); setDeletingId(null); }
                                }}
                              >
                                <BadgeCheck size={15} /> {listing.verified ? t.adminUnverify : t.adminVerify}
                              </button>
                            )}
                            <button className="admin-btn admin-btn-ghost" type="button" disabled={busy} onClick={() => { setEditingId(listing.id); setRejectingId(null); setDeletingId(null); setMessage(""); }}>
                              <Pencil size={14} /> {t.adminEdit}
                            </button>
                            {listing.status === "approved" && (
                              <Link className="admin-btn admin-btn-ghost" href={listingPath(locale, listing.id)} target="_blank"><ExternalLink size={14} /> {t.adminViewPublic}</Link>
                            )}
                            {(listing.status === "approved" || listing.status === "paused") && (
                              <button className="admin-btn admin-btn-ghost" type="button" disabled={busy} onClick={() => void chargeFee(listing.id)}>
                                <Wallet size={14} /> {t.adminChargeFee}
                              </button>
                            )}
                            <button className="admin-icon-btn" type="button" disabled={busy} aria-label={t.adminDelete} title={t.adminDelete} onClick={() => setDeletingId(listing.id)}>
                              <Trash2 size={16} />
                            </button>
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
      </main>
    </div>
  );
}
