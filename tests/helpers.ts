import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

// Public Supabase settings from .env.local (the anon key is public). Admin login comes from
// SAKANI_ADMIN_EMAIL / SAKANI_ADMIN_PASSWORD; tests that need it are skipped when they are not set.
function loadEnv(): Record<string, string> {
  try {
    return Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
      .map((line) => line.match(/^\s*([^#=\s]+)\s*=\s*"?(.*?)"?\s*$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[1], match[2]]));
  } catch {
    return {};
  }
}

const env = loadEnv();
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
// From the environment, or from .env.local (never committed or deployed).
export const ADMIN_EMAIL = process.env.SAKANI_ADMIN_EMAIL ?? env.SAKANI_ADMIN_EMAIL ?? "";
export const ADMIN_PASSWORD = process.env.SAKANI_ADMIN_PASSWORD ?? env.SAKANI_ADMIN_PASSWORD ?? "";
export const hasAdmin = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD && SUPABASE_URL);
// The admin's authenticator key, once two-step sign-in is on (shown once when it is set up).
export const ADMIN_TOTP_SECRET = process.env.SAKANI_ADMIN_TOTP_SECRET ?? env.SAKANI_ADMIN_TOTP_SECRET ?? "";

/** The current 6-digit code for a base32 authenticator key (RFC 6238, 30-second steps). */
export function totpCode(secret: string, time = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.replace(/=+$/, "").replace(/\s/g, "").toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30_000)));
  const hash = createHmac("sha1", key).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
export const TEST_TAG = "[E2E TEST]";
export const LOCALES = ["ar", "en"] as const;

type ApiOptions = { token?: string; method?: string; body?: unknown };

export async function api<T = unknown>(path: string, { token, method = "GET", body }: ApiOptions = {}) {
  // Updates and deletes return only the id unless asked otherwise: some columns (the owner's number)
  // are private, and asking for the whole row back would be refused.
  if ((method === "PATCH" || method === "DELETE") && path.startsWith("/rest/v1/") && !path.includes("select=")) {
    path += `${path.includes("?") ? "&" : "?"}select=id`;
  }
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token ?? SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, data: (text ? JSON.parse(text) : null) as T };
}

export async function adminToken() {
  const { data } = await api<{ access_token: string }>("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (!ADMIN_TOTP_SECRET) return data.access_token;
  // Two-step sign-in is on: pass the code so the token counts as admin.
  const user = await api<{ factors?: Array<{ id: string; status: string; factor_type: string }> }>("/auth/v1/user", { token: data.access_token });
  const factor = user.data.factors?.find((item) => item.status === "verified" && item.factor_type === "totp");
  if (!factor) return data.access_token;
  const challenge = await api<{ id: string }>(`/auth/v1/factors/${factor.id}/challenge`, { token: data.access_token, method: "POST", body: {} });
  const verified = await api<{ access_token: string }>(`/auth/v1/factors/${factor.id}/verify`, {
    token: data.access_token, method: "POST", body: { challenge_id: challenge.data.id, code: totpCode(ADMIN_TOTP_SECRET) },
  });
  return verified.data.access_token;
}

/** A fresh anonymous (guest) session, like an owner who continues without an account. */
export async function guestSession() {
  const { data } = await api<{ access_token: string; user: { id: string } }>("/auth/v1/signup", { method: "POST", body: {} });
  return data;
}

export function sampleListing(ownerId: string, title: string, extra: Record<string, unknown> = {}) {
  const photo = "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=900";
  return {
    owner_id: ownerId,
    title_ar: `${TEST_TAG} ${title}`,
    title_en: `${TEST_TAG} ${title}`,
    description_ar: "Automated test listing. It is removed when the tests finish.",
    description_en: "Automated test listing. It is removed when the tests finish.",
    governorate: "Giza", area: "Dokki", gender: "female", property_type: "room",
    monthly_price: 3500, deposit: 1000, available_beds: 1, total_beds: 2,
    wifi: true, air_conditioning: true, security: false,
    whatsapp_number: "01000000000", image_url: photo, image_urls: [photo], status: "pending",
    ...extra,
  };
}

/** Collects page errors, console errors and server errors (ignores expected 404s and analytics). */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message.split("\n")[0]}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/status of 404|_vercel|insights/.test(message.text())) errors.push(`console: ${message.text().slice(0, 200)}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`HTTP ${response.status()}: ${response.url().slice(0, 140)}`);
  });
  return errors;
}

/** Design audit: sideways scrolling, controls with browser-default styling, phone zoom, broken images. */
export async function designProblems(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw + 1) problems.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`);
    const visible = (el: Element) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const controls = document.querySelectorAll<HTMLInputElement>("select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), textarea, button");
    for (const el of controls) {
      if (!visible(el)) continue;
      const style = getComputedStyle(el);
      const name = `${el.tagName.toLowerCase()}${el.name ? `[name=${el.name}]` : ""}${el.className ? `.${String(el.className).split(" ")[0]}` : ""}`;
      if (!/Cairo|Inter/.test(style.fontFamily)) problems.push(`${name}: not using the site font`);
      if (el.tagName === "SELECT" && style.appearance === "auto") problems.push(`${name}: browser-default dropdown`);
      if (el.tagName !== "BUTTON" && innerWidth < 500 && parseFloat(style.fontSize) < 16) problems.push(`${name}: text under 16px on phone (zooms on tap)`);
    }
    for (const img of document.images) {
      if (img.complete && img.naturalWidth === 0 && visible(img)) problems.push(`broken image ${img.src.slice(0, 80)}`);
    }
    return [...new Set(problems)];
  });
}

export async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    window.scrollTo(0, 0);
  });
}

export async function signInAsAdmin(page: Page, locale: "ar" | "en" = "en") {
  await page.goto(`/${locale}/sign-in`);
  await page.fill('input[name="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin$/);
  // Two-step sign-in: type the current code when the panel asks for it.
  const challenge = page.locator(".admin-mfa input[name=code]");
  await Promise.race([challenge.waitFor(), page.locator(".admin-nav").waitFor()]);
  if (ADMIN_TOTP_SECRET && await challenge.isVisible()) {
    await challenge.fill(totpCode(ADMIN_TOTP_SECRET));
    await page.locator(".admin-mfa button[type=submit]").click();
  }
  await page.locator(".admin-nav").waitFor();
}
