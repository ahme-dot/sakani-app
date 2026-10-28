"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { CalendarCheck, Heart, House, LoaderCircle, LogOut, Pencil, Repeat, Wallet } from "lucide-react";
import PropertyCard from "@/components/property-card";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { PHONE_PATTERN, type AccountRole, type Profile } from "@/lib/account";
import { RENTAL_FEE_COLUMNS, type RentalFee } from "@/lib/payments";
import { useSavedListings } from "@/lib/saved";
import { fetchListingsByIds } from "@/lib/supabase/listings";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import type { Property } from "@/types";

type Props = {
  locale: SiteLocale;
  supabase: SupabaseClient;
  user: User;
  /** Null before the hosts-and-guests migration; the account then behaves as a host. */
  profile: Profile | null;
  notice?: string;
  onSignOut: () => Promise<void>;
};

type HostListing = { id: string; title_ar: string; title_en: string; status: string; monthly_price: number; image_url: string };
type Booking = { id: string; listing_id: string | null; listing_title: string; move_in: string | null; months: number | null; guests: number; status: string; created_at: string };

const OPEN_BOOKINGS = ["new", "contacted", "visit"];

/** The signed-in account: contact details for everyone, then places and fees for hosts, or bookings, fees and saved homes for guests. */
export default function ProfilePage({ locale, supabase, user, profile: initialProfile, notice, onSignOut }: Props) {
  const t = SITE_COPY[locale];
  const otherLocale: SiteLocale = locale === "ar" ? "en" : "ar";
  const intlLocale = locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG";
  const numberFormat = new Intl.NumberFormat(intlLocale);
  const dateFormat = new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium" });
  const [profile, setProfile] = useState<Profile>(
    initialProfile ?? { id: user.id, role: "host", full_name: (user.user_metadata?.full_name as string | undefined) ?? "", phone: "" },
  );
  const role: AccountRole = profile.role;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(notice ?? "");
  const [error, setError] = useState("");
  const [listings, setListings] = useState<HostListing[] | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [fees, setFees] = useState<RentalFee[] | null>(null);
  const [saved, setSaved] = useState<Property[] | null>(null);
  const [version, setVersion] = useState(0);
  const savedIds = useSavedListings();
  const savedKey = savedIds.join(",");

  // Each role loads its own sections.
  useEffect(() => {
    let active = true;
    if (role === "host") {
      void Promise.all([
        supabase.from("properties").select("id,title_ar,title_en,status,monthly_price,image_url").eq("owner_id", user.id).order("created_at", { ascending: false }),
        supabase.from("rental_fees").select(RENTAL_FEE_COLUMNS).eq("owner_id", user.id).eq("payer", "owner").order("created_at", { ascending: false }),
      ]).then(([homes, ownerFees]) => {
        if (!active) return;
        if (homes.error) console.error("Could not load the host's places:", homes.error);
        setListings((homes.data ?? []) as HostListing[]);
        setFees((ownerFees.data ?? []) as unknown as RentalFee[]);
      });
    } else {
      void Promise.all([
        supabase.from("listing_requests").select("id,listing_id,listing_title,move_in,months,guests,status,created_at").eq("guest_id", user.id).order("created_at", { ascending: false }),
        supabase.from("rental_fees").select(RENTAL_FEE_COLUMNS).eq("guest_id", user.id).eq("payer", "student").order("created_at", { ascending: false }),
      ]).then(([guestBookings, guestFees]) => {
        if (!active) return;
        if (guestBookings.error) console.error("Could not load bookings:", guestBookings.error);
        setBookings((guestBookings.data ?? []) as Booking[]);
        setFees((guestFees.data ?? []) as unknown as RentalFee[]);
      });
    }
    return () => {
      active = false;
    };
  }, [role, supabase, user.id, version]);

  useEffect(() => {
    if (role !== "guest") return;
    let active = true;
    void fetchListingsByIds(supabase, savedKey ? savedKey.split(",") : []).then(({ listings: homes }) => {
      if (active) setSaved(homes);
    });
    return () => {
      active = false;
    };
  }, [role, savedKey, supabase]);

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("full_name") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    if (fullName.length < 2 || (phone && !PHONE_PATTERN.test(phone)) || (role === "guest" && !phone)) {
      setError(t.profileInvalid);
      return;
    }
    setBusy(true);
    setError("");
    const { error: saveError } = await supabase.from("profiles").update({ full_name: fullName, phone }).eq("id", user.id);
    setBusy(false);
    if (saveError) {
      console.error("Could not save profile:", saveError);
      setError(t.formError);
      return;
    }
    setProfile({ ...profile, full_name: fullName, phone });
    setEditing(false);
    setMessage(t.profileSaved);
  }

  async function switchRole() {
    const next: AccountRole = role === "host" ? "guest" : "host";
    setBusy(true);
    const { error: switchError } = await supabase.from("profiles").update({ role: next }).eq("id", user.id);
    setBusy(false);
    if (switchError) {
      console.error("Could not switch role:", switchError);
      setError(t.formError);
      return;
    }
    setMessage("");
    setProfile({ ...profile, role: next });
  }

  async function cancelBooking(id: string) {
    setBusy(true);
    const { error: cancelError } = await supabase.rpc("guest_cancel_booking", { target_booking: id });
    setBusy(false);
    if (cancelError) {
      console.error("Could not cancel booking:", cancelError);
      setError(t.formError);
      return;
    }
    setVersion((value) => value + 1);
  }

  const name = profile.full_name || user.email || t.navAccount;
  const loading = <p className="profile-loading"><LoaderCircle className="spinner" size={18} /> {t.loading}</p>;

  const feeList = fees && fees.length > 0 && (
    <section className="profile-section" aria-labelledby="fees-title">
      <h2 id="fees-title"><Wallet size={20} /> {t.profileFees}</h2>
      <ul className="profile-list">
        {fees.map((fee) => (
          <li key={fee.id}>
            <div>
              <strong>{numberFormat.format(fee.amount)} {t.currency}</strong>
              <span>{fee.listing_title}</span>
              <small>{dateFormat.format(new Date(fee.created_at))}</small>
            </div>
            <span className={`status-chip is-${fee.status}`}>{t.feeTabs[fee.status]}</span>
            {fee.status === "due" && <Link className="button button-primary profile-pay" href={`/${locale}/pay/${fee.pay_token}`}>{t.profilePay}</Link>}
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader locale={locale} switchHref={`/${otherLocale}/account`} />
      <main className="profile-page section-wrap">
        <section className="profile-card" aria-labelledby="profile-title">
          <span className="profile-avatar" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>
          <div className="profile-who">
            <h1 id="profile-title">{name}</h1>
            <span className={`role-chip is-${role}`}>{role === "host" ? t.roleHost : t.roleGuest}</span>
          </div>
          {editing ? (
            <form className="profile-edit" onSubmit={(event) => void saveDetails(event)} noValidate>
              <label className="owner-field"><span>{t.fullName}</span><input name="full_name" defaultValue={profile.full_name} required minLength={2} maxLength={80} autoComplete="name" /></label>
              <label className="owner-field"><span>{t.phoneLabel}</span><input name="phone" type="tel" inputMode="tel" dir="ltr" defaultValue={profile.phone} pattern="[0-9+ \(\)\-]{8,20}" autoComplete="tel" /></label>
              <div className="profile-edit-actions">
                <button className="button button-primary" type="submit" disabled={busy}>{t.settingsSave}</button>
                <button className="text-button" type="button" onClick={() => setEditing(false)}>{t.cancel}</button>
              </div>
            </form>
          ) : (
            <dl className="profile-details">
              <div><dt>{t.email}</dt><dd dir="ltr">{user.email}</dd></div>
              <div><dt>{t.phoneLabel}</dt><dd dir="ltr">{profile.phone || "—"}</dd></div>
            </dl>
          )}
          {message && <p className="owner-feedback owner-feedback-success" role="status">{message}</p>}
          {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
          <div className="profile-actions">
            {!editing && initialProfile && <button className="button button-outline" type="button" onClick={() => { setEditing(true); setMessage(""); }}><Pencil size={15} /> {t.profileEdit}</button>}
            {initialProfile && <button className="button button-outline" type="button" disabled={busy} onClick={() => void switchRole()}><Repeat size={15} /> {role === "host" ? t.switchToGuest : t.switchToHost}</button>}
            <button className="button button-outline profile-logout" type="button" onClick={() => void onSignOut()}><LogOut size={15} /> {t.accountSignOut}</button>
          </div>
        </section>

        {role === "host" ? (
          <>
            <section className="profile-section" aria-labelledby="places-title">
              <div className="profile-section-head">
                <h2 id="places-title"><House size={20} /> {t.profilePlaces}</h2>
                <Link className="button button-primary" href={`/${locale}/host`}>{t.profileManagePlaces}</Link>
              </div>
              {listings === null ? loading : listings.length === 0 ? (
                <p className="profile-empty">{t.profileNoPlaces}</p>
              ) : (
                <ul className="profile-list">
                  {listings.map((listing) => (
                    <li key={listing.id}>
                      {listing.image_url && <Image className="profile-thumb" src={listing.image_url} alt="" width={72} height={54} />}
                      <div>
                        <strong>{locale === "ar" ? listing.title_ar : listing.title_en}</strong>
                        <small>{numberFormat.format(listing.monthly_price)} {t.perMonth}</small>
                      </div>
                      <span className={`status-chip is-${listing.status}`}>{t.listingStatus[listing.status as keyof typeof t.listingStatus] ?? listing.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {feeList}
          </>
        ) : (
          <>
            <section className="profile-section" id="bookings" aria-labelledby="bookings-title">
              <h2 id="bookings-title"><CalendarCheck size={20} /> {t.profileBookings}</h2>
              {bookings === null ? loading : bookings.length === 0 ? (
                <p className="profile-empty">{t.profileNoBookings} <Link href={`/${locale}#homes`}>{t.heroAction}</Link></p>
              ) : (
                <ul className="profile-list">
                  {bookings.map((booking) => (
                    <li key={booking.id}>
                      <div>
                        <strong>{booking.listing_id ? <Link href={`/${locale}/listings/${booking.listing_id}`}>{booking.listing_title}</Link> : booking.listing_title}</strong>
                        <span>
                          {booking.move_in ? t.bookingFrom(dateFormat.format(new Date(booking.move_in))) : dateFormat.format(new Date(booking.created_at))}
                          {booking.months ? ` · ${t.monthsCount(booking.months)}` : ""}
                        </span>
                      </div>
                      <span className={`status-chip is-${booking.status}`}>{t.bookingStatus[booking.status as keyof typeof t.bookingStatus] ?? booking.status}</span>
                      {OPEN_BOOKINGS.includes(booking.status) && (
                        <button className="text-button" type="button" disabled={busy} onClick={() => void cancelBooking(booking.id)}>{t.bookingCancel}</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {feeList}
            <section className="profile-section" aria-labelledby="saved-title">
              <h2 id="saved-title"><Heart size={20} /> {t.menuSaved}</h2>
              {saved === null ? loading : saved.length === 0 ? (
                <p className="profile-empty">{t.savedEmptyText}</p>
              ) : (
                <div className="property-grid">
                  {saved.map((property) => <PropertyCard key={property.id} property={property} locale={locale} />)}
                </div>
              )}
            </section>
          </>
        )}
      </main>
      <SiteFooter locale={locale} switchHref={`/${otherLocale}/account`} tab="account" />
    </div>
  );
}
