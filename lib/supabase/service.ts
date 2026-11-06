/**
 * Supabase with the service-role key, for server routes only (the Paymob webhook and refunds). This key
 * passes every database rule, so it must never reach the browser: it is read from SUPABASE_SERVICE_ROLE_KEY
 * (no NEXT_PUBLIC_ prefix, so Next.js never bundles it) and this file is only imported by route handlers.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getSupabaseServiceClient(): SupabaseClient | null {
  if (typeof window !== "undefined") throw new Error("service.ts is server only");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** A client acting as the signed-in user whose access token came with the request. */
export function getSupabaseUserClient(accessToken: string): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key || !accessToken) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
