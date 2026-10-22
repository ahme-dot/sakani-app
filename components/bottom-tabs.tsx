import Link from "next/link";
import { CircleUserRound, Heart, Search, SquarePlus } from "lucide-react";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

export type BottomTab = "explore" | "saved" | "host" | "account";

/** Phone-only tab bar, like the Airbnb app. */
export default function BottomTabs({ locale, active }: { locale: SiteLocale; active?: BottomTab }) {
  const t = SITE_COPY[locale];
  const tabs: Array<{ key: BottomTab; href: string; label: string; icon: typeof Search }> = [
    { key: "explore", href: `/${locale}`, label: t.tabExplore, icon: Search },
    { key: "saved", href: `/${locale}?saved=1#homes`, label: t.tabSaved, icon: Heart },
    { key: "host", href: `/${locale}/host`, label: t.tabHost, icon: SquarePlus },
    { key: "account", href: `/${locale}/account`, label: t.tabAccount, icon: CircleUserRound },
  ];

  return (
    <nav className="bottom-tabs" aria-label={t.navLabel}>
      {tabs.map(({ key, href, label, icon: Icon }) => (
        <Link key={key} href={href} className={active === key ? "is-active" : ""} aria-current={active === key ? "page" : undefined}>
          <Icon size={22} strokeWidth={active === key ? 2.4 : 1.8} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
