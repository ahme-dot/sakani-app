import type { SupabaseClient } from "@supabase/supabase-js";

/** What anyone may see about a host or guest (from the database function public_profile: no phone, email or InstaPay). */
export type PublicProfile = {
  id: string;
  first_name: string;
  avatar_url: string | null;
  bio: string;
  governorate: string;
  occupation: string;
  languages: string[];
  role: "host" | "guest";
  member_since: string;
  id_verified: boolean;
  places: number;
  completed_stays: number;
};

export const LANGUAGE_OPTIONS = ["ar", "en", "fr", "de", "it", "es"] as const;

export async function fetchPublicProfile(client: SupabaseClient, userId: string): Promise<PublicProfile | null> {
  const { data, error } = await client.rpc("public_profile", { target_user: userId });
  if (error) {
    console.error("Could not load public profile:", error);
    return null;
  }
  return ((data as PublicProfile[] | null) ?? [])[0] ?? null;
}
