import type { ReactNode } from "react";
import Link from "next/link";
import { Building2, Globe } from "lucide-react";
import BottomTabs, { type BottomTab } from "@/components/bottom-tabs";
import SearchPill from "@/components/search-pill";
import UserMenu from "@/components/user-menu";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

export function Brand({ locale, href }: { locale: SiteLocale; href?: string }) {
  const t = SITE_COPY[locale];
  return (
    <Link className="brand" href={href ?? `/${locale}`} aria-label={t.brandAria}>
      <span className="brand-mark"><Building2 size={21} strokeWidth={2.2} /></span>
      <span className={`brand-name${locale === "en" ? " brand-name-latin" : ""}`}>{t.brandLabel}<span className="brand-period">.</span></span>
    </Link>
  );
}

type HeaderProps = {
  locale: SiteLocale;
  /** The same page in the other language. */
  switchHref: string;
  /** The home page passes its own controlled search; other pages get one that opens the home page. */
  search?: ReactNode;
  /** Shown under the header row, inside the sticky header (the home page's category bar). */
  children?: ReactNode;
};

export function SiteHeader({ locale, switchHref, search, children }: HeaderProps) {
  const t = SITE_COPY[locale];
  return (
    <header className="site-header" id="top">
      <div className="header-inner">
        <Brand locale={locale} />
        <div className="header-search">{search ?? <SearchPill locale={locale} />}</div>
        <div className="header-actions">
          <Link className="header-host" href={`/${locale}/host`}>{t.navOwner}</Link>
          <Link className="header-lang" href={switchHref} hrefLang={locale === "ar" ? "en" : "ar"} aria-label={t.languageName} title={t.languageName}>
            <Globe size={18} />
          </Link>
          <UserMenu locale={locale} switchHref={switchHref} />
        </div>
      </div>
      {children}
    </header>
  );
}

export function SiteFooter({ locale, switchHref, tab }: { locale: SiteLocale; switchHref?: string; tab?: BottomTab | false }) {
  const t = SITE_COPY[locale];
  const otherLocale: SiteLocale = locale === "ar" ? "en" : "ar";
  return (
    <>
      <footer className="site-footer">
        <div className="footer-inner footer-columns">
          <nav aria-label={t.footerSupport}>
            <h3>{t.footerSupport}</h3>
            <Link href={`/${locale}/help`}>{t.footerHelp}</Link>
            <Link href={`/${locale}/help#contact`}>{t.navContact}</Link>
            <Link href={`/${locale}/help#faq`}>{t.faqKicker}</Link>
          </nav>
          <nav aria-label={t.footerForOwners}>
            <h3>{t.footerForOwners}</h3>
            <Link href={`/${locale}/host`}>{t.navOwner}</Link>
            <Link href={`/${locale}/account`}>{t.footerOwnerAccount}</Link>
            <Link href={`/${locale}/sign-in`} rel="nofollow">{t.adminNav}</Link>
          </nav>
          <nav aria-label={t.footerSakani}>
            <h3>{t.footerSakani}</h3>
            <Link href={`/${locale}`}>{t.headerSearch}</Link>
            <Link href={`/${locale}?saved=1#homes`}>{t.menuSaved}</Link>
            <p className="footer-about">{t.footerText}</p>
          </nav>
        </div>
        <div className="footer-inner footer-bottom">
          <p>
            © {new Date().getFullYear()} {t.brandLabel}
            <span aria-hidden="true"> · </span><Link href={`/${locale}/privacy`}>{t.privacyLink}</Link>
            <span aria-hidden="true"> · </span><Link href={`/${locale}/terms`}>{t.termsLink}</Link>
          </p>
          <Link className="footer-lang" href={switchHref ?? `/${otherLocale}`} hrefLang={otherLocale}>
            <Globe size={16} /> {t.languageName}
          </Link>
        </div>
      </footer>
      {tab !== false && <BottomTabs locale={locale} active={tab} />}
    </>
  );
}
