"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { ArrowUpLeft, Building2, Menu, UserRound } from "lucide-react";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type ChromeProps = {
  locale: SiteLocale;
  /** Prefix for in-page section links: "" on the home page, "/ar" or "/en" elsewhere. */
  sectionBase?: string;
};

export function Brand({ locale, href = "#top" }: { locale: SiteLocale; href?: string }) {
  const t = SITE_COPY[locale];
  return (
    <a className="brand" href={href} aria-label={t.brandAria}>
      <span className="brand-mark"><Building2 size={21} strokeWidth={2.2} /></span>
      <span className={`brand-name${locale === "en" ? " brand-name-latin" : ""}`}>{t.brandLabel}<span className="brand-period">.</span></span>
    </a>
  );
}

export function SiteHeader({ locale, sectionBase = "", switchHref }: ChromeProps & { switchHref: string }) {
  const t = SITE_COPY[locale];
  const links = [
    { href: `${sectionBase}#homes`, label: t.navListings },
    { href: `${sectionBase}#why-sakani`, label: t.navWhy },
    { href: `${sectionBase}#owner`, label: t.navOwner },
    { href: `${sectionBase}#contact`, label: t.navContact },
  ];

  function closeMobileMenu(event: MouseEvent<HTMLAnchorElement>) {
    event.currentTarget.closest("details")?.removeAttribute("open");
  }

  return (
    <header className="site-header" id="top">
      <div className="header-inner">
        <Brand locale={locale} href={sectionBase ? sectionBase : "#top"} />
        <div className="mobile-menu">
          <details>
            <summary className="menu-toggle" aria-label={t.openMenu}>
              <Menu size={21} />
            </summary>
            <nav className="main-nav" aria-label={t.navLabel}>
              {links.map((link) => <a key={link.href} href={link.href} onClick={closeMobileMenu}>{link.label}</a>)}
            </nav>
          </details>
        </div>
        <nav className="main-nav desktop-nav" aria-label={t.navLabel}>
          {links.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
        </nav>
        <div className="header-actions">
          <Link className="language-toggle" href={switchHref} hrefLang={locale === "ar" ? "en" : "ar"} aria-label={`${t.languageName} language`}>
            {t.localeLabel}
          </Link>
          <Link className="account-link" href={`/${locale}/account`} aria-label={t.navAccount} title={t.navAccount}>
            <UserRound size={18} />
            <span>{t.navAccount}</span>
          </Link>
          <a className="header-cta" href={`${sectionBase}#search`} aria-label={t.headerSearch}>
            <span className="header-cta-label">{t.headerSearch}</span>
            <ArrowUpLeft size={17} />
          </a>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ locale, sectionBase = "", switchHref }: ChromeProps & { switchHref?: string }) {
  const t = SITE_COPY[locale];
  const otherLocale: SiteLocale = locale === "ar" ? "en" : "ar";
  return (
    <footer className="site-footer footer2">
      <div className="footer-inner footer2-grid">
        <div className="footer2-brand">
          <Brand locale={locale} href={sectionBase || "#top"} />
          <p>{t.footerText}</p>
        </div>
        <nav aria-label={t.footerExplore}>
          <h3>{t.footerExplore}</h3>
          <a href={`${sectionBase}#search`}>{t.headerSearch}</a>
          <a href={`${sectionBase}#homes`}>{t.navListings}</a>
          <a href={`${sectionBase}#why-sakani`}>{t.footerAbout}</a>
          <a href={`${sectionBase}#faq`}>{t.faqKicker}</a>
        </nav>
        <nav aria-label={t.footerForOwners}>
          <h3>{t.footerForOwners}</h3>
          <a href={`${sectionBase}#owner`}>{t.navOwner}</a>
          <Link href={`/${locale}/sign-in`} rel="nofollow">{t.adminNav}</Link>
        </nav>
        <div>
          <h3>{t.footerLanguage}</h3>
          <Link href={switchHref ?? `/${otherLocale}`} hrefLang={otherLocale}>{t.languageName}</Link>
        </div>
      </div>
      <div className="footer-inner footer2-bottom">
        <p>© {new Date().getFullYear()} {t.brandLabel}. {t.allRights}</p>
        <p>{t.city}</p>
      </div>
    </footer>
  );
}
