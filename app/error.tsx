"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { SITE_COPY } from "@/messages/site";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  const locale = usePathname()?.startsWith("/en") ? "en" : "ar";
  const t = SITE_COPY[locale];

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="admin-page" dir={locale === "ar" ? "rtl" : "ltr"}>
      <section className="admin-auth-panel not-found-panel" role="alert">
        <span className="signin-icon"><TriangleAlert size={20} /></span>
        <h1>{t.errorTitle}</h1>
        <p>{t.errorText}</p>
        <div className="error-actions">
          <button className="button button-primary owner-submit" type="button" onClick={() => retry()}><RefreshCw size={16} /> {t.errorRetry}</button>
          <Link className="signout-button" href={`/${locale}`}>{t.errorHome}</Link>
        </div>
      </section>
    </main>
  );
}
