import { createHash, createHmac } from "node:crypto";
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

type ApiOptions = { token?: string; method?: string; body?: unknown; prefer?: string };

export async function api<T = unknown>(path: string, { token, method = "GET", body, prefer = "return=representation" }: ApiOptions = {}) {
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
      Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, data: (text ? JSON.parse(text) : null) as T };
}

/**
 * One admin sign-in per run, renewed before the token's hour is up. Each pass of the two-step code ends the account's
 * sessions that haven't passed it yet, so signing in again for every test could end a browser that's about to.
 */
let adminSession: { token: string; at: number } | null = null;
export async function adminToken() {
  if (adminSession && Date.now() - adminSession.at < 50 * 60_000) return adminSession.token;
  const token = await freshAdminToken();
  adminSession = { token, at: Date.now() };
  return token;
}

async function freshAdminToken() {
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
  const { status, data } = await api<{ access_token: string; user: { id: string } }>("/auth/v1/signup", { method: "POST", body: {} });
  // Said plainly, so a sign-up limit isn't mistaken for a bug in the code under test.
  if (!data?.user) throw new Error(`Could not create a test account (HTTP ${status}): Supabase's sign-up limit or captcha.`);
  return data;
}

type TestHost = { access_token: string; user: { id: string } };
let testHostSession: Promise<TestHost> | null = null;

/**
 * One fixed host account for the whole suite: only a real account with a phone and an InstaPay address can take
 * bookings. The email is the admin's address with a plus tag and the password is a hash of the admin's, so there is
 * no new secret. It signs up once, the first time. If the project asks for email confirmation, confirm that one
 * message in the admin's inbox.
 */
export function testHost() {
  testHostSession ??= (async () => {
    const [local, domain] = ADMIN_EMAIL.split("@");
    const credentials = {
      email: `${local}+sakani-test-host@${domain}`,
      password: createHash("sha256").update(`sakani-test-host:${ADMIN_PASSWORD}`).digest("hex"),
    };
    const signIn = () => api<TestHost>("/auth/v1/token?grant_type=password", { method: "POST", body: credentials });
    let session = await signIn();
    if (!session.data?.access_token) {
      await api("/auth/v1/signup", { method: "POST", body: credentials });
      session = await signIn();
    }
    if (!session.data?.access_token) throw new Error(`Could not sign in the test host (HTTP ${session.status}): sign-up limit, or its email isn't confirmed yet.`);
    await api(`/rest/v1/profiles?id=eq.${session.data.user.id}`, {
      token: session.data.access_token, method: "PATCH",
      body: { role: "host", full_name: "E2E Host", phone: "01000000077", instapay_address: "sakani-e2e@instapay" },
    });
    return session.data;
  })();
  return testHostSession;
}

/**
 * A published listing that can be booked. An anonymous session creates it (each has its own limit of 5 listings a
 * day, which the fixed host would soon reach), and the admin moves it to the test host.
 */
export async function testHostListing(admin: string, title: string, extra: Record<string, unknown> = {}) {
  const host = await testHost();
  const owner = await guestSession();
  const created = await api<Array<{ id: string }>>("/rest/v1/properties?select=id", {
    token: owner.access_token, method: "POST", body: sampleListing(owner.user.id, title, extra),
  });
  const listingId = created.data[0].id;
  await api(`/rest/v1/properties?id=eq.${listingId}`, { token: admin, method: "PATCH", body: { status: "approved", owner_id: host.user.id } });
  return { host, listingId };
}

/** Guests can confirm moving in only from the move-in date, so a test stay starts today. */
export async function startsToday(admin: string, bookingId: string) {
  const today = new Date().toISOString().slice(0, 10);
  await api(`/rest/v1/listing_requests?id=eq.${bookingId}`, { token: admin, method: "PATCH", body: { move_in: today } });
  return today;
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
      // On a computer the browser's date box (e.g. 11/26/2026) must be replaced by the Sakani calendar.
      if (el.getAttribute("type") === "date" && !el.classList.contains("sakani-date-native") && matchMedia("(hover: hover) and (pointer: fine)").matches) problems.push(`${name}: browser date box`);
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
  await passAdminCode(page);
}

/** On the admin page: types the current two-step code if the panel asks for it, then waits for the menu. */
export async function passAdminCode(page: Page) {
  const challenge = page.locator(".admin-mfa input[name=code]");
  await Promise.race([challenge.waitFor(), page.locator(".admin-nav").waitFor()]);
  if (ADMIN_TOTP_SECRET && await challenge.isVisible()) {
    await challenge.fill(totpCode(ADMIN_TOTP_SECRET));
    await page.locator(".admin-mfa button[type=submit]").click();
  }
  await page.locator(".admin-nav").waitFor();
}
