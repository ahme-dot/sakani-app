"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile check, shown only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set.
 * The same provider and secret must be enabled under Supabase → Authentication → Attack Protection,
 * which then requires a token for anonymous sign-ins, password sign-ins and password resets.
 */
export const CAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

function loadScript() {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Could not load the security check."));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export default function Captcha({
  locale,
  onToken,
  resetKey = 0,
}: {
  locale: "ar" | "en";
  onToken: (token: string) => void;
  /** Change this value to get a fresh token after one has been used. */
  resetKey?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!CAPTCHA_SITE_KEY || !container.current) return;
    let cancelled = false;
    const element = container.current;

    loadScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widgetId.current = window.turnstile.render(element, {
          sitekey: CAPTCHA_SITE_KEY,
          language: locale,
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(""),
          "error-callback": () => onTokenRef.current(""),
        });
      })
      .catch((error) => console.error(error));

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [locale]);

  useEffect(() => {
    if (resetKey && widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
      onTokenRef.current("");
    }
  }, [resetKey]);

  if (!CAPTCHA_SITE_KEY) return null;
  return <div className="captcha" ref={container} />;
}
