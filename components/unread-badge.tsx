"use client";

import { useMemo } from "react";
import { useAccount, useTeamUnread } from "@/lib/account";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** A small count of unread messages from the Sakani team (nothing when there are none). */
export default function UnreadBadge({ className = "unread-badge" }: { className?: string }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const account = useAccount(supabase);
  const unread = useTeamUnread(supabase, account.status === "signedIn" ? account.user.id : null);
  return unread > 0 ? <span className={className} aria-label={String(unread)}>{unread > 9 ? "9+" : unread}</span> : null;
}
