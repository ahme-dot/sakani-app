"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, UserRound } from "lucide-react";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

/** Airbnb-style account pill (☰ + avatar) with a dropdown of account and help links. */
export default function UserMenu({ locale, switchHref }: { locale: SiteLocale; switchHref: string }) {
  const t = SITE_COPY[locale];
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

  const close = () => setOpen(false);

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-menu-button" aria-haspopup="menu" aria-expanded={open} aria-label={t.openMenu} onClick={() => setOpen((value) => !value)}>
        <Menu size={17} />
        <span className="user-menu-avatar"><UserRound size={17} /></span>
      </button>
      {open && (
        <div className="user-menu-panel" role="menu">
          <Link role="menuitem" className="is-strong" href={`/${locale}/account`} onClick={close}>{t.menuLogin}</Link>
          <Link role="menuitem" href={`/${locale}/host`} onClick={close}>{t.menuMyListings}</Link>
          <Link role="menuitem" href={`/${locale}?saved=1#homes`} onClick={close}>{t.menuSaved}</Link>
          <hr />
          <Link role="menuitem" href={`/${locale}/host`} onClick={close}>{t.navOwner}</Link>
          <Link role="menuitem" href={`/${locale}/help`} onClick={close}>{t.menuHelp}</Link>
          <Link role="menuitem" href={switchHref} hrefLang={locale === "ar" ? "en" : "ar"} onClick={close}>{t.languageName}</Link>
        </div>
      )}
    </div>
  );
}
