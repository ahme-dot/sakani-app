"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { BadgeCheck, LoaderCircle, LockKeyhole, LogOut } from "lucide-react";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MarketplaceListing } from "@/lib/supabase/listings";

const ADMIN_LISTING_COLUMNS =
  "id,title_ar,title_en,description_ar,description_en,area,university,gender,property_type,monthly_price,whatsapp_number,image_url,status,created_at";
type DashboardState = "loading" | "unconfigured" | "signed-out" | "checking" | "denied" | "ready";
type ReviewFilter = MarketplaceListing["status"];

export default function AdminDashboard({ locale }: { locale: SiteLocale }) {
  const t = SITE_COPY[locale];
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<DashboardState>(supabase ? "loading" : "unconfigured");
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [filter, setFilter] = useState<ReviewFilter>("pending");
  const [loadingListings, setLoadingListings] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
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
      setUser(currentUser);
      setState(currentUser ? "checking" : "signed-out");
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
        } else if (!data) {
          setState("denied");
        } else {
          setState("ready");
        }
      });

    return () => {
      mounted = false;
    };
  }, [supabase, user, t.adminLoadError]);

  useEffect(() => {
    if (!supabase || state !== "ready") return;
    let mounted = true;
    void supabase
      .from("properties")
      .select(ADMIN_LISTING_COLUMNS)
      .eq("status", filter)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error: listingError }) => {
        if (!mounted) return;
        if (listingError) {
          console.error("Could not load listings for review:", listingError);
          setListings([]);
          setError(t.adminLoadError);
        } else {
          setListings((data ?? []) as MarketplaceListing[]);
          setError("");
        }
        setLoadingListings(false);
      });

    return () => {
      mounted = false;
    };
  }, [supabase, state, filter, t.adminLoadError]);

  async function updateStatus(listingId: string, status: ReviewFilter) {
    if (!supabase) return;
    setUpdatingId(listingId);
    setError("");
    setMessage("");

    const { data: updatedRows, error: updateError } = await supabase
      .from("properties")
      .update({ status })
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

    setListings((current) => current.filter((listing) => listing.id !== listingId));
    setMessage(t.adminStatusUpdated);
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

        <nav className="admin-filter-tabs" aria-label={t.adminDashboardTitle}>
          {tabs.map((tab) => (
            <button
              className={filter === tab.value ? "is-active" : ""}
              type="button"
              key={tab.value}
              aria-pressed={filter === tab.value}
              onClick={() => {
                setLoadingListings(true);
                setFilter(tab.value);
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {message && <p className="owner-feedback owner-feedback-success" role="status">{message}</p>}
        {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}

        {loadingListings ? (
          <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>
        ) : listings.length === 0 ? (
          <section className="admin-empty-state"><p>{t.adminNoListings}</p></section>
        ) : (
          <div className="admin-listing-grid">
            {listings.map((listing) => (
              <article className="admin-listing-card" key={listing.id}>
                <Image className="admin-listing-image" src={listing.image_url} alt={locale === "ar" ? listing.title_ar : listing.title_en} width={700} height={420} unoptimized />
                <div className="admin-listing-content">
                  <div className="admin-listing-heading">
                    <span className="listing-status">{tabs.find((tab) => tab.value === listing.status)?.label}</span>
                    <time dateTime={listing.created_at}>{t.adminSubmitted}: {new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-EG", { dateStyle: "medium" }).format(new Date(listing.created_at))}</time>
                  </div>
                  <h2>{locale === "ar" ? listing.title_ar : listing.title_en}</h2>
                  <p>{locale === "ar" ? listing.description_ar : listing.description_en}</p>
                  <dl className="admin-listing-details">
                    <div><dt>{t.area}</dt><dd>{listing.area}</dd></div>
                    <div><dt>{t.university}</dt><dd>{listing.university}</dd></div>
                    <div><dt>{t.price}</dt><dd>{new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG").format(listing.monthly_price)} EGP</dd></div>
                    <div><dt>{t.adminContact}</dt><dd><a href={`https://wa.me/${listing.whatsapp_number.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{listing.whatsapp_number}</a></dd></div>
                  </dl>
                  {filter === "pending" && (
                    <div className="admin-listing-actions">
                      <button className="button button-primary owner-submit" type="button" disabled={updatingId === listing.id} onClick={() => void updateStatus(listing.id, "approved")}>{updatingId === listing.id ? t.sending : t.adminApprove}</button>
                      <button className="button admin-reject-button" type="button" disabled={updatingId === listing.id} onClick={() => void updateStatus(listing.id, "rejected")}>{t.adminReject}</button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
