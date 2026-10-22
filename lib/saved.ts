"use client";

import { useSyncExternalStore } from "react";

// Saved homes live in this browser only (no account needed). Ids are listing UUIDs.
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

export function toggleSaved(id: string) {
  const current = read();
  const next = current.includes(id) ? current.filter((item) => item !== id) : [id, ...current].slice(0, MAX_SAVED);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Saved listing ids, newest first; empty during server rendering. */
export function useSavedListings() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
