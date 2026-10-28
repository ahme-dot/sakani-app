"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Menu, UserRound } from "lucide-react";
import { signOutAccount, useAccount } from "@/lib/account";
import { connectSavedToAccount } from "@/lib/saved";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

/** Airbnb-style account pill (☰ + avatar). Signed out: log in or sign up; signed in: profile, bookings or places, and log out. */
export default function UserMenu({ locale, switchHref }: { locale: SiteLocale; switchHref: string }) {
  const t = SITE_COPY[locale];
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const account = useAccount(supabase);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Saved homes follow the account once someone is signed in.
  const signedInId = account.status === "signedIn" ? account.user.id : null;
  useEffect(() => {
    if (supabase && signedInId) void connectSavedToAccount(supabase, signedInId);
  }, [supabase, signedInId]);

  const close = () => setOpen(false);
  const signedIn = account.status === "signedIn" ? account : null;
  const name = signedIn ? signedIn.profile?.full_name || signedIn.user.email || t.navAccount : "";
  const isGuest = signedIn?.profile?.role === "guest";

  async function logOut() {
    if (!supabase) return;
    close();
    await signOutAccount(supabase);
    router.replace(`/${locale}`);
    router.refresh();
  }

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-menu-button" aria-haspopup="menu" aria-expanded={open} aria-label={t.openMenu} onClick={() => setOpen((value) => !value)}>
        <Menu size={17} />
        <span className={`user-menu-avatar${signedIn ? " is-signed-in" : ""}`}>
          {signedIn ? name.trim().charAt(0).toUpperCase() : <UserRound size={17} />}
        </span>
      </button>
      {open && (
        <div className="user-menu-panel" role="menu">
          {signedIn ? (
            <>
              <p className="user-menu-name">{name}<small>{isGuest ? t.roleGuest : t.roleHost}</small></p>
              <Link role="menuitem" className="is-strong" href={`/${locale}/account`} onClick={close}>{t.menuProfile}</Link>
              {isGuest
                ? <Link role="menuitem" href={`/${locale}/account#bookings`} onClick={close}>{t.profileBookings}</Link>
                : <Link role="menuitem" href={`/${locale}/host`} onClick={close}>{t.menuMyListings}</Link>}
              <Link role="menuitem" href={`/${locale}?saved=1#homes`} onClick={close}>{t.menuSaved}</Link>
            </>
          ) : (
            <>
              <Link role="menuitem" className="is-strong" href={`/${locale}/account`} onClick={close}>{t.menuLogin}</Link>
              <Link role="menuitem" href={`/${locale}/account?mode=signup`} onClick={close}>{t.menuSignup}</Link>
              <Link role="menuitem" href={`/${locale}?saved=1#homes`} onClick={close}>{t.menuSaved}</Link>
            </>
          )}
          <hr />
          <Link role="menuitem" href={`/${locale}/host`} onClick={close}>{t.navOwner}</Link>
          <Link role="menuitem" href={`/${locale}/help`} onClick={close}>{t.menuHelp}</Link>
          <Link role="menuitem" href={switchHref} hrefLang={locale === "ar" ? "en" : "ar"} onClick={close}>{t.languageName}</Link>
          {signedIn && (
            <>
              <hr />
              <button type="button" role="menuitem" className="user-menu-logout" onClick={() => void logOut()}><LogOut size={15} /> {t.accountSignOut}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
