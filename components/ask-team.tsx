"use client";

import Link from "next/link";
import { useMemo } from "react";
import { MessageCircle } from "lucide-react";
import { WhatsAppLink } from "@/components/listing-tracking";
import { useAccount } from "@/lib/account";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

/** "Ask the Sakani team": the site chat for people with an account, WhatsApp for everyone else. */
export default function AskTeam({ locale, listingId, whatsappHref, className, compact = false }: {
  locale: SiteLocale;
  listingId: string;
  whatsappHref: string | null;
  className: string;
  compact?: boolean;
}) {
  const t = SITE_COPY[locale];
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const account = useAccount(supabase);
  const label = compact ? undefined : <>{" "}{t.askSakani}</>;

  if (account.status === "signedIn") {
    return (
      <Link className={className} href={`/${locale}/messages?listing=${listingId}`} aria-label={compact ? t.askSakani : undefined}>
        <MessageCircle size={18} />{label}
      </Link>
    );
  }
  if (!whatsappHref) return null;
  return (
    <WhatsAppLink listingId={listingId} className={className} href={whatsappHref} ariaLabel={compact ? t.askSakani : undefined}>
      <MessageCircle size={18} />{label}
    </WhatsAppLink>
  );
}
