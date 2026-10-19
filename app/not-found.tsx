import Link from "next/link";
import { headers } from "next/headers";
import { SearchX } from "lucide-react";
import { SITE_COPY } from "@/messages/site";

export default async function NotFound() {
  const locale = (await headers()).get("x-sakani-locale") === "en" ? "en" : "ar";
  const t = SITE_COPY[locale];

  return (
    <main className="admin-page" dir={locale === "ar" ? "rtl" : "ltr"}>
      <section className="admin-auth-panel not-found-panel">
        <span className="signin-icon"><SearchX size={20} /></span>
        <h1>{t.notFoundTitle}</h1>
        <p>{t.notFoundText}</p>
        <Link className="button button-primary owner-submit" href={`/${locale}#homes`}>{t.notFoundAction}</Link>
      </section>
    </main>
  );
}
