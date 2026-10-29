"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  BadgeCheck,
  CalendarCheck,
  Camera,
  Check,
  CreditCard,
  ExternalLink,
  Headset,
  Heart,
  House,
  LoaderCircle,
  LogOut,
  Mail,
  Pencil,
  Phone,
  Repeat,
  Wallet,
  X,
} from "lucide-react";
import PropertyCard from "@/components/property-card";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { PHONE_PATTERN, type AccountRole, type Profile } from "@/lib/account";
import { GOVERNORATES, governorateLabel } from "@/lib/egypt";
import { compressImage, storagePathFromPublicUrl } from "@/lib/images";
import { RENTAL_FEE_COLUMNS, type RentalFee } from "@/lib/payments";
import { LANGUAGE_OPTIONS } from "@/lib/profiles";
import { useSavedListings } from "@/lib/saved";
import { fetchListingsByIds } from "@/lib/supabase/listings";
import { SITE_COPY, type SiteLocale } from "@/messages/site";
import type { Property } from "@/types";

/** Everything the account page edits; the extra fields arrive with the 20261102 migration. */
type FullProfile = Profile & {
  avatar_url?: string | null;
  bio?: string;
  governorate?: string;
  gender?: "male" | "female" | null;
  occupation?: string;
  languages?: string[];
  instapay_address?: string;
  id_verified?: boolean;
  created_at?: string;
};

type Props = {
  locale: SiteLocale;
  supabase: SupabaseClient;
  user: User;
  /** Null before the hosts-and-guests migration; the account then behaves as a host. */
  profile: Profile | null;
  notice?: string;
  onSignOut: () => Promise<void>;
};

type BookingStatus = "pending_payment" | "payment_review" | "confirmed" | "moved_in" | "completed" | "refund_pending" | "refunded" | "cancelled";

type GuestBooking = {
  id: string;
  listing_id: string | null;
  listing_title: string;
  move_in: string | null;
  months: number | null;
  guests: number;
  status: BookingStatus;
  total_amount: number | null;
  fee_id: string | null;
  refund_due_at: string | null;
  refund_reference: string | null;
  created_at: string;
};

type HostBooking = {
  id: string;
  listing_id: string | null;
  listing_title: string;
  guest_first_name: string;
  move_in: string | null;
  months: number | null;
  guests: number;
  status: BookingStatus;
  host_decision: "pending" | "accepted" | "declined";
  rent_amount: number | null;
  host_fee: number | null;
  payout_amount: number | null;
  paid_out_at: string | null;
  created_at: string;
};

type HostListing = { id: string; title_ar: string; title_en: string; status: string; monthly_price: number; image_url: string };

const AVATAR_BUCKET = "sakani-avatars";
const PROFILE_COLUMNS = "id,role,full_name,phone,avatar_url,bio,governorate,gender,occupation,languages,instapay_address,id_verified,created_at";
const BOOKING_COLUMNS = "id,listing_id,listing_title,move_in,months,guests,status,total_amount,fee_id,refund_due_at,refund_reference,created_at";

/** The signed-in account: about me, then bookings and saved places (guests) or booking requests, payouts and places (hosts). */
export default function ProfilePage({ locale, supabase, user, profile: initialProfile, notice, onSignOut }: Props) {
  const t = SITE_COPY[locale];
  const otherLocale: SiteLocale = locale === "ar" ? "en" : "ar";
  const intlLocale = locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG";
  const numberFormat = new Intl.NumberFormat(intlLocale);
  const dateFormat = new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium" });
  const timeFormat = new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeStyle: "short" });
  const monthYear = new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric" });
  const languageNames = new Intl.DisplayNames([locale], { type: "language" });
  const [profile, setProfile] = useState<FullProfile>(
    initialProfile ?? { id: user.id, role: "host", full_name: (user.user_metadata?.full_name as string | undefined) ?? "", phone: "" },
  );
  const role: AccountRole = profile.role;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(notice ?? "");
  const [error, setError] = useState("");
  const [listings, setListings] = useState<HostListing[] | null>(null);
  const [hostBookings, setHostBookings] = useState<HostBooking[] | null>(null);
  const [bookings, setBookings] = useState<GuestBooking[] | null>(null);
  const [payTokens, setPayTokens] = useState<Record<string, string>>({});
  const [fees, setFees] = useState<RentalFee[] | null>(null);
  const [saved, setSaved] = useState<Property[] | null>(null);
  const [problemFor, setProblemFor] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const savedIds = useSavedListings();
  const savedKey = savedIds.join(",");

  // The full profile (extra fields), once.
  useEffect(() => {
    if (!initialProfile) return;
    let active = true;
    void supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).maybeSingle().then(({ data }) => {
      if (active && data) setProfile(data as FullProfile);
    });
    return () => {
      active = false;
    };
  }, [initialProfile, supabase, user.id]);

  // Each role loads its own sections.
  useEffect(() => {
    let active = true;
    if (role === "host") {
      void Promise.all([
        supabase.from("properties").select("id,title_ar,title_en,status,monthly_price,image_url").eq("owner_id", user.id).order("created_at", { ascending: false }),
        supabase.rpc("host_bookings"),
        supabase.from("rental_fees").select(RENTAL_FEE_COLUMNS).eq("owner_id", user.id).eq("payer", "owner").order("created_at", { ascending: false }),
      ]).then(([homes, requests, ownerFees]) => {
        if (!active) return;
        if (homes.error) console.error("Could not load the host's places:", homes.error);
        setListings((homes.data ?? []) as HostListing[]);
        setHostBookings(requests.error ? [] : ((requests.data ?? []) as HostBooking[]));
        setFees((ownerFees.data ?? []) as unknown as RentalFee[]);
      });
    } else {
      void Promise.all([
        supabase.from("listing_requests").select(BOOKING_COLUMNS).eq("guest_id", user.id).order("created_at", { ascending: false }),
        supabase.from("rental_fees").select("id,pay_token").eq("guest_id", user.id).eq("payer", "student"),
      ]).then(([guestBookings, guestFees]) => {
        if (!active) return;
        if (guestBookings.error) console.error("Could not load bookings:", guestBookings.error);
        setBookings((guestBookings.data ?? []) as GuestBooking[]);
        setPayTokens(Object.fromEntries(((guestFees.data ?? []) as Array<{ id: string; pay_token: string }>).map((fee) => [fee.id, fee.pay_token])));
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
    const values = {
      full_name: String(form.get("full_name") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim(),
      bio: String(form.get("bio") ?? "").trim().slice(0, 500),
      governorate: String(form.get("governorate") ?? ""),
      gender: (String(form.get("gender") ?? "") || null) as FullProfile["gender"],
      occupation: String(form.get("occupation") ?? "").trim().slice(0, 80),
      languages: form.getAll("languages").map(String).slice(0, 6),
      ...(role === "host" ? { instapay_address: String(form.get("instapay_address") ?? "").trim().slice(0, 80) } : {}),
    };
    if (values.full_name.length < 2 || (values.phone && !PHONE_PATTERN.test(values.phone)) || (role === "guest" && !values.phone)) {
      setError(t.profileInvalid);
      return;
    }
    setBusy(true);
    setError("");
    const { error: saveError } = await supabase.from("profiles").update(values).eq("id", user.id);
    setBusy(false);
    if (saveError) {
      console.error("Could not save profile:", saveError);
      setError(t.formError);
      return;
    }
    setProfile({ ...profile, ...values });
    setEditing(false);
    setMessage(t.profileSaved);
  }

  async function uploadAvatar(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setError(t.imageError);
      return;
    }
    setBusy(true);
    setError("");
    const compressed = await compressImage(file);
    const path = `${user.id}/${crypto.randomUUID()}.${compressed.type === "image/png" ? "png" : compressed.type === "image/webp" ? "webp" : "jpg"}`;
    const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, compressed, { cacheControl: "31536000", contentType: compressed.type });
    if (uploadError) {
      console.error("Could not upload photo:", uploadError);
      setError(t.formError);
      setBusy(false);
      return;
    }
    const url = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
    const { error: saveError } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
    setBusy(false);
    if (saveError) {
      console.error("Could not save photo:", saveError);
      setError(t.formError);
      return;
    }
    const oldPath = profile.avatar_url ? storagePathFromPublicUrl(profile.avatar_url, AVATAR_BUCKET) : null;
    if (oldPath) void supabase.storage.from(AVATAR_BUCKET).remove([oldPath]);
    setProfile({ ...profile, avatar_url: url });
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

  /** Runs a booking action (database function) and reloads the lists. */
  async function bookingAction(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const { error: actionError } = await supabase.rpc(fn, args);
    setBusy(false);
    if (actionError) {
      console.error(`Could not run ${fn}:`, actionError);
      setError(t.formError);
      return false;
    }
    setVersion((value) => value + 1);
    return true;
  }

  const name = profile.full_name || user.email || t.navAccount;
  const loading = <p className="profile-loading"><LoaderCircle className="spinner" size={18} /> {t.loading}</p>;
  const egp = (amount: number | null | undefined) => `${numberFormat.format(amount ?? 0)} ${t.currency}`;
  const stay = (moveIn: string | null, months: number | null) =>
    `${moveIn ? t.bookingFrom(dateFormat.format(new Date(moveIn))) : ""}${months ? ` · ${t.monthsCount(months)}` : ""}`;
  const checks = [
    { done: Boolean(user.email_confirmed_at), icon: Mail, label: t.checkEmail },
    { done: Boolean(profile.phone), icon: Phone, label: t.checkPhone },
    { done: Boolean(profile.id_verified), icon: BadgeCheck, label: t.idVerified },
  ];

  return (
    <div className="site-shell" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader locale={locale} switchHref={`/${otherLocale}/account`} />
      <main className="profile-page section-wrap">
        <section className="profile-card" aria-labelledby="profile-title">
          <label className={`profile-avatar profile-avatar-edit${busy ? " is-busy" : ""}`} title={t.changePhoto}>
            {profile.avatar_url ? <Image src={profile.avatar_url} alt="" width={64} height={64} /> : name.trim().charAt(0).toUpperCase()}
            {initialProfile && (
              <>
                <span className="profile-avatar-camera"><Camera size={14} /></span>
                <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={t.changePhoto} onChange={(event) => void uploadAvatar(event.target.files?.[0])} />
              </>
            )}
          </label>
          <div className="profile-who">
            <h1 id="profile-title">{name}</h1>
            <span className={`role-chip is-${role}`}>{role === "host" ? t.roleHost : t.roleGuest}</span>
            {profile.created_at && <small className="profile-since">{t.memberSince(monthYear.format(new Date(profile.created_at)))}</small>}
          </div>

          <ul className="profile-checks" aria-label={t.checksTitle}>
            {checks.map(({ done, icon: Icon, label }) => (
              <li key={label} className={done ? "is-done" : ""}>
                <Icon size={15} /> {label} {done ? <Check size={14} /> : <X size={14} />}
              </li>
            ))}
          </ul>

          {editing ? (
            <form className="profile-edit" onSubmit={(event) => void saveDetails(event)} noValidate>
              <label className="owner-field"><span>{t.fullName}</span><input name="full_name" defaultValue={profile.full_name} required minLength={2} maxLength={80} autoComplete="name" /></label>
              <label className="owner-field"><span>{t.phoneLabel}</span><input name="phone" type="tel" inputMode="tel" dir="ltr" defaultValue={profile.phone} pattern="[0-9+ \(\)\-]{8,20}" autoComplete="tel" /></label>
              <label className="owner-field">
                <span>{t.governorate}</span>
                <select name="governorate" defaultValue={profile.governorate ?? ""}>
                  <option value="">—</option>
                  {GOVERNORATES.map((item) => <option key={item.id} value={item.name_en}>{locale === "ar" ? item.name : item.name_en}</option>)}
                </select>
              </label>
              <label className="owner-field">
                <span>{t.genderLabel}</span>
                <select name="gender" defaultValue={profile.gender ?? ""}>
                  <option value="">—</option>
                  <option value="male">{t.genderMale}</option>
                  <option value="female">{t.genderFemale}</option>
                </select>
              </label>
              <label className="owner-field"><span>{t.occupationLabel}</span><input name="occupation" defaultValue={profile.occupation ?? ""} maxLength={80} placeholder={t.occupationPlaceholder} /></label>
              {role === "host" && (
                <label className="owner-field">
                  <span>{t.instapayLabel}</span>
                  <input name="instapay_address" defaultValue={profile.instapay_address ?? ""} maxLength={80} dir="ltr" placeholder="name@instapay" />
                  <small className="field-hint">{t.instapayHint}</small>
                </label>
              )}
              <label className="owner-field profile-edit-wide"><span>{t.bioLabel}</span><textarea name="bio" defaultValue={profile.bio ?? ""} rows={3} maxLength={500} placeholder={t.bioPlaceholder} /></label>
              <fieldset className="owner-field profile-edit-wide profile-languages">
                <legend>{t.languagesLabel}</legend>
                <div className="choice-row">
                  {LANGUAGE_OPTIONS.map((code) => (
                    <label className="choice" key={code}>
                      <input type="checkbox" name="languages" value={code} defaultChecked={profile.languages?.includes(code)} />
                      <span>{languageNames.of(code) ?? code}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="profile-edit-actions">
                <button className="button button-primary" type="submit" disabled={busy}>{t.settingsSave}</button>
                <button className="text-button" type="button" onClick={() => setEditing(false)}>{t.cancel}</button>
              </div>
            </form>
          ) : (
            <>
              <dl className="profile-details">
                <div><dt>{t.email}</dt><dd dir="ltr">{user.email}</dd></div>
                <div><dt>{t.phoneLabel}</dt><dd dir="ltr">{profile.phone || "—"}</dd></div>
                <div><dt>{t.governorate}</dt><dd>{profile.governorate ? governorateLabel(locale, profile.governorate) : "—"}</dd></div>
                <div><dt>{t.occupationLabel}</dt><dd>{profile.occupation || "—"}</dd></div>
                <div><dt>{t.languagesLabel}</dt><dd>{profile.languages?.length ? profile.languages.map((code) => languageNames.of(code) ?? code).join("، ") : "—"}</dd></div>
                {role === "host" && <div><dt>{t.instapayLabel}</dt><dd dir="ltr">{profile.instapay_address || "—"}</dd></div>}
              </dl>
              {profile.bio && <p className="profile-bio">{profile.bio}</p>}
            </>
          )}
          {message && <p className="owner-feedback owner-feedback-success" role="status">{message}</p>}
          {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
          <div className="profile-actions">
            {!editing && initialProfile && <button className="button button-outline" type="button" onClick={() => { setEditing(true); setMessage(""); }}><Pencil size={15} /> {t.profileEdit}</button>}
            <Link className="button button-outline" href={`/${locale}/messages`}><Headset size={15} /> {t.chatTeamName}</Link>
            {initialProfile && <Link className="button button-outline" href={`/${locale}/users/${user.id}`}><ExternalLink size={15} /> {t.viewPublicProfile}</Link>}
            {initialProfile && <button className="button button-outline" type="button" disabled={busy} onClick={() => void switchRole()}><Repeat size={15} /> {role === "host" ? t.switchToGuest : t.switchToHost}</button>}
            <button className="button button-outline profile-logout" type="button" onClick={() => void onSignOut()}><LogOut size={15} /> {t.accountSignOut}</button>
          </div>
        </section>

        {role === "host" ? (
          <>
            <section className="profile-section" id="requests" aria-labelledby="host-requests-title">
              <h2 id="host-requests-title"><CalendarCheck size={20} /> {t.hostRequestsTitle}</h2>
              {hostBookings === null ? loading : hostBookings.length === 0 ? (
                <p className="profile-empty">{t.hostRequestsEmpty}</p>
              ) : (
                <ul className="profile-list">
                  {hostBookings.map((booking) => (
                    <li key={booking.id}>
                      <div>
                        <strong>{booking.listing_title}</strong>
                        <span>{booking.guest_first_name} · {stay(booking.move_in, booking.months)} · {t.guestsCount(booking.guests)}</span>
                        <small>{t.hostPayoutLine(egp(booking.rent_amount), egp(booking.host_fee), egp(booking.payout_amount))}</small>
                      </div>
                      <span className={`status-chip is-${booking.status}`}>{t.bookingStatus[booking.status]}</span>
                      {booking.host_decision === "pending" && (booking.status === "pending_payment" || booking.status === "payment_review") ? (
                        <span className="profile-row-actions">
                          <button className="button button-primary" type="button" disabled={busy} onClick={() => void bookingAction("host_decide_booking", { target_booking: booking.id, accept: true })}>{t.hostAccept}</button>
                          <button className="text-button" type="button" disabled={busy} onClick={() => void bookingAction("host_decide_booking", { target_booking: booking.id, accept: false })}>{t.hostDecline}</button>
                        </span>
                      ) : (
                        <small className="profile-decision">{t.hostDecision[booking.host_decision]}</small>
                      )}
                      <Link className="text-button" href={`/${locale}/messages?booking=${booking.id}`}><Headset size={14} /> {t.chatAboutBooking}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {hostBookings && hostBookings.some((booking) => booking.status === "moved_in" || booking.status === "completed") && (
              <section className="profile-section" aria-labelledby="payouts-title">
                <h2 id="payouts-title"><Wallet size={20} /> {t.payoutsTitle}</h2>
                <ul className="profile-list">
                  {hostBookings.filter((booking) => booking.status === "moved_in" || booking.status === "completed").map((booking) => (
                    <li key={booking.id}>
                      <div>
                        <strong>{egp(booking.payout_amount)}</strong>
                        <span>{booking.listing_title}</span>
                      </div>
                      <span className={`status-chip is-${booking.status === "completed" ? "paid" : "due"}`}>{booking.status === "completed" ? t.payoutSent : t.payoutDue}</span>
                      {booking.paid_out_at && <small>{dateFormat.format(new Date(booking.paid_out_at))}</small>}
                    </li>
                  ))}
                </ul>
                {!profile.instapay_address && <p className="profile-empty">{t.instapayMissing}</p>}
              </section>
            )}

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

            {fees && fees.length > 0 && (
              <section className="profile-section" aria-labelledby="fees-title">
                <h2 id="fees-title"><Wallet size={20} /> {t.profileFees}</h2>
                <ul className="profile-list">
                  {fees.map((fee) => (
                    <li key={fee.id}>
                      <div>
                        <strong>{egp(fee.amount)}</strong>
                        <span>{fee.listing_title}</span>
                      </div>
                      <span className={`status-chip is-${fee.status}`}>{t.feeTabs[fee.status]}</span>
                      {fee.status === "due" && <Link className="button button-primary profile-pay" href={`/${locale}/pay/${fee.pay_token}`}>{t.profilePay}</Link>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <>
            <section className="profile-section" id="bookings" aria-labelledby="bookings-title">
              <h2 id="bookings-title"><CalendarCheck size={20} /> {t.profileBookings}</h2>
              {bookings === null ? loading : bookings.length === 0 ? (
                <p className="profile-empty">{t.profileNoBookings} <Link href={`/${locale}#homes`}>{t.heroAction}</Link></p>
              ) : (
                <ul className="profile-list profile-bookings">
                  {bookings.map((booking) => {
                    const token = booking.fee_id ? payTokens[booking.fee_id] : undefined;
                    const canReport = booking.status === "payment_review" || booking.status === "confirmed" || booking.status === "moved_in";
                    return (
                      <li key={booking.id}>
                        <div>
                          <strong>{booking.listing_id ? <Link href={`/${locale}/listings/${booking.listing_id}`}>{booking.listing_title}</Link> : booking.listing_title}</strong>
                          <span>{stay(booking.move_in, booking.months)} · {t.guestsCount(booking.guests)}</span>
                          {booking.total_amount !== null && <small>{t.bookingPaidAmount(egp(booking.total_amount))}</small>}
                          {booking.status === "refund_pending" && booking.refund_due_at && <small className="profile-refund">{t.refundBy(timeFormat.format(new Date(booking.refund_due_at)))}</small>}
                          {booking.status === "refunded" && booking.refund_reference && <small>{t.refundDone(booking.refund_reference)}</small>}
                        </div>
                        <span className={`status-chip is-${booking.status}`}>{t.bookingStatus[booking.status]}</span>
                        <span className="profile-row-actions">
                          {booking.status === "pending_payment" && token && (
                            <Link className="button button-primary profile-pay" href={`/${locale}/pay/${token}`}><CreditCard size={15} /> {t.profilePay}</Link>
                          )}
                          {booking.status === "pending_payment" && (
                            <button className="text-button" type="button" disabled={busy} onClick={() => void bookingAction("guest_cancel_booking", { target_booking: booking.id })}>{t.bookingCancel}</button>
                          )}
                          {booking.status === "confirmed" && (
                            <button className="button button-primary" type="button" disabled={busy} onClick={() => void bookingAction("guest_confirm_move_in", { target_booking: booking.id })}>{t.movedInButton}</button>
                          )}
                          {canReport && problemFor !== booking.id && (
                            <button className="text-button" type="button" onClick={() => setProblemFor(booking.id)}>{t.reportProblem}</button>
                          )}
                          <Link className="text-button" href={`/${locale}/messages?booking=${booking.id}`}><Headset size={14} /> {t.chatAboutBooking}</Link>
                        </span>
                        {problemFor === booking.id && (
                          <form
                            className="profile-problem"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const note = String(new FormData(event.currentTarget).get("note") ?? "");
                              void bookingAction("guest_report_problem", { target_booking: booking.id, note }).then((ok) => ok && setProblemFor(null));
                            }}
                          >
                            <label className="owner-field"><span>{t.problemLabel}</span><textarea name="note" rows={2} minLength={5} maxLength={1000} required /></label>
                            <p className="field-hint">{t.refundPromise}</p>
                            <span className="profile-row-actions">
                              <button className="button button-primary" type="submit" disabled={busy}>{t.problemSubmit}</button>
                              <button className="text-button" type="button" onClick={() => setProblemFor(null)}>{t.cancel}</button>
                            </span>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
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
