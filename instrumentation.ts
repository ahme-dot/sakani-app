import type { Instrumentation } from "next";

/**
 * Server errors go to the same list as browser errors (Admin → Errors), so a page that breaks on the
 * server is noticed. report_client_error drops repeats and keeps the amount small.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NODE_ENV !== "production") return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return;
  const message = error instanceof Error ? error.message : String(error);
  try {
    await fetch(`${url}/rest/v1/rpc/report_client_error`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        error_page: request.path.split("?")[0],
        error_message: `[server] ${message}`,
        error_detail: `${context.routerKind} ${context.routePath} ${context.routeType}`,
        agent: "server",
      }),
    });
  } catch {
    // Reporting must never make a failing page worse.
  }
};
