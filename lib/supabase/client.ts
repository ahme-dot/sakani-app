"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

const refusedListeners = new Set<() => void>();

/**
 * Tells a screen that the database refused a request with 401. With a dead session the Supabase client quietly sends
 * the public key, so every request runs as a visitor: the database answers 401, not an error from the sign-in side.
 */
export function onDatabaseRefused(listener: () => void) {
  refusedListeners.add(listener);
  return () => {
    refusedListeners.delete(listener);
  };
}

const watchedFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (response.status === 401) {
    const address = input instanceof Request ? input.url : String(input);
    if (address.includes("/rest/v1/")) refusedListeners.forEach((listener) => listener());
  }
  return response;
};

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  client ??= createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
    global: { fetch: watchedFetch },
  });

  return client;
}
