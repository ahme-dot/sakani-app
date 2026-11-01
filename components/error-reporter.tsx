"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

// Noise from browser extensions and dropped connections, not from the site.
const IGNORED = /ResizeObserver loop|Script error\.?$|extension:\/\/|Load failed|NetworkError|Failed to fetch|AbortError/i;

/** Sends errors that happen in visitors' browsers to the team (Admin → Errors), each one once per visit. */
export default function ErrorReporter() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const sent = new Set<string>();
    const report = (message: string, detail: string) => {
      if (!message || IGNORED.test(message) || IGNORED.test(detail) || sent.has(message) || sent.size >= 5) return;
      sent.add(message);
      void supabase.rpc("report_client_error", {
        error_page: window.location.pathname,
        error_message: message.slice(0, 500),
        error_detail: detail.slice(0, 2000),
        agent: navigator.userAgent.slice(0, 300),
      });
    };
    const onError = (event: ErrorEvent) => report(event.message, event.error instanceof Error ? event.error.stack ?? "" : `${event.filename}:${event.lineno}`);
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      report(reason instanceof Error ? reason.message : String(reason), reason instanceof Error ? reason.stack ?? "" : "");
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
