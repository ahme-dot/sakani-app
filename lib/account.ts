"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { disconnectSavedFromAccount } from "@/lib/saved";

export type AccountRole = "host" | "guest";

/** A real account's details (anonymous owner sessions have no profile). */
export type Profile = {
  id: string;
  role: AccountRole;
  full_name: string;
  phone: string;
};

export type AccountState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: User; profile: Profile | null };

export const PHONE_PATTERN = /^[+0-9 ()-]{8,20}$/;
export const LISTING_DRAFT_KEY = "sakani-listing-draft";

export async function fetchProfile(client: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await client.from("profiles").select("id,role,full_name,phone").eq("id", userId).maybeSingle();
  // Before the hosts-and-guests migration the table does not exist; the site then treats everyone as a host.
  if (error && error.code !== "42P01" && error.code !== "PGRST205") console.error("Could not load profile:", error);
  return (data as Profile | null) ?? null;
}

/** The signed-in account (anonymous owner sessions count as signed out), kept up to date across tabs. */
export function useAccount(client: SupabaseClient | null): AccountState {
  const [state, setState] = useState<AccountState>(client ? { status: "loading" } : { status: "signedOut" });

  useEffect(() => {
    if (!client) return;
    let active = true;
    let loadedFor: string | null = null;

    async function load(user: User | null) {
      if (!user || user.is_anonymous) {
        loadedFor = null;
        if (active) setState({ status: "signedOut" });
        return;
      }
      if (loadedFor === user.id) return;
      loadedFor = user.id;
      const profile = await fetchProfile(client!, user.id);
      if (active) setState({ status: "signedIn", user, profile });
    }

    void client.auth.getSession().then(({ data }) => load(data.session?.user ?? null));
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (event === "USER_UPDATED") loadedFor = null;
      void load(session?.user ?? null);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [client]);

  return state;
}

/** Signs out on this device and clears what this browser kept for the account. */
export async function signOutAccount(client: SupabaseClient) {
  await client.auth.signOut({ scope: "local" });
  disconnectSavedFromAccount();
  try {
    window.localStorage.removeItem(LISTING_DRAFT_KEY);
  } catch {
    // Storage blocked: nothing to clear.
  }
}

/** Only same-site pages in the current language are allowed as a "come back here" address after logging in. */
export function safeNext(next: string | null | undefined, locale: string) {
  return next && next.startsWith(`/${locale}/`) && !next.startsWith("//") ? next : null;
}
