"use client";

import { useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

// Saved homes live in this browser (no account needed). When someone is signed in they are also kept
// in their account (saved_listings), so they follow them to other devices. Ids are listing UUIDs.
const STORAGE_KEY = "sakani-saved-listings";
const CHANGE_EVENT = "sakani-saved-change";
const MAX_SAVED = 100;
const EMPTY: string[] = [];

let cachedRaw: string | null = null;
let cachedIds: string[] = EMPTY;

function read(): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw) return cachedIds;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cachedIds = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : EMPTY;
  } catch {
    cachedIds = EMPTY;
  }
  return cachedIds;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function write(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_SAVED)));
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return true;
}

/** The signed-in account's database client, set by SavedSync; null when signed out. */
let account: { client: SupabaseClient; userId: string } | null = null;

export function toggleSaved(id: string) {
  const current = read();
  const removing = current.includes(id);
  if (!write(removing ? current.filter((item) => item !== id) : [id, ...current])) return;
  if (!account) return;
  const { client, userId } = account;
  const request = removing
    ? client.from("saved_listings").delete().eq("user_id", userId).eq("listing_id", id)
    : client.from("saved_listings").upsert({ user_id: userId, listing_id: id }, { onConflict: "user_id,listing_id", ignoreDuplicates: true });
  void request.then(({ error }) => {
    if (error) console.error("Could not update saved homes in the account:", error);
  });
}

/** On sign-in: homes saved on this device are added to the account, and the account's homes appear here. */
export async function connectSavedToAccount(client: SupabaseClient, userId: string) {
  account = { client, userId };
  const local = read();
  if (local.length) {
    const { error } = await client
      .from("saved_listings")
      .upsert(local.map((listing_id) => ({ user_id: userId, listing_id })), { onConflict: "user_id,listing_id", ignoreDuplicates: true });
    // Saved homes that were deleted since no longer exist; they are simply left out.
    if (error && error.code !== "23503") console.error("Could not copy saved homes to the account:", error);
  }
  const { data, error } = await client.from("saved_listings").select("listing_id").eq("user_id", userId).order("created_at", { ascending: false }).limit(MAX_SAVED);
  if (error) return;
  const remote = (data ?? []).map((row) => (row as { listing_id: string }).listing_id);
  write([...new Set([...read(), ...remote])]);
}

/** On sign-out: stop syncing and forget this account's saved homes on this device. */
export function disconnectSavedFromAccount() {
  account = null;
  write([]);
}

/** Saved listing ids, newest first; empty during server rendering. */
export function useSavedListings() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
