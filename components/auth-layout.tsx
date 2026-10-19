import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, BadgeCheck, Building2, ClipboardCheck, Users } from "lucide-react";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

/** Two-panel layout shared by the admin sign-in and password pages. */
export default function AuthLayout({ locale, children }: { locale: SiteLocale; children: ReactNode }) {
  const t = SITE_COPY[locale];
  const points = [
    { icon: ClipboardCheck, label: t.authPointReview },
    { icon: BadgeCheck, label: t.authPointVerify },
    { icon: Users, label: t.authPointTeam },
  ];

  return (
    <main className="auth-page" dir={locale === "ar" ? "rtl" : "ltr"}>
      <section className="auth-card">
        <aside className="auth-brand">
          <Link className="auth-logo" href={`/${locale}`}>
            <span className="brand-mark"><Building2 size={20} strokeWidth={2.2} /></span>
            <span>{t.brandLabel}</span>
          </Link>
          <div className="auth-brand-copy">
            <h2>{t.authBrandTitle}</h2>
            <p>{t.authBrandText}</p>
            <ul>
              {points.map(({ icon: Icon, label }) => <li key={label}><span><Icon size={16} /></span>{label}</li>)}
            </ul>
          </div>
          <small>© {new Date().getFullYear()} {t.brandLabel}</small>
        </aside>

        <div className="auth-form-side">
          <Link className="auth-back" href={`/${locale}`}><ArrowRight size={15} /> {t.adminBackHome}</Link>
          {children}
        </div>
      </section>
    </main>
  );
}
