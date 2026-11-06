import { paymobConfig, verifyRedirect } from "@/lib/paymob";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where Paymob sends the guest after paying. Its query string is signed like the webhook, so a valid one also
 * records the payment (in case the webhook is late); then the guest lands back on their payment page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const token = params.get("t") ?? "";
  const locale = params.get("l") === "en" ? "en" : "ar";
  const back = (state: string) =>
    Response.redirect(new URL(TOKEN_PATTERN.test(token) ? `/${locale}/pay/${token}?card=${state}` : `/${locale}`, url.origin), 303);

  const config = paymobConfig();
  const service = getSupabaseServiceClient();
  if (!config || !service || !verifyRedirect(params, config.hmacSecret)) return back("check");

  const succeeded = params.get("success") === "true" && params.get("pending") !== "true";
  const reference = params.get("merchant_order_id") ?? "";
  const txn = params.get("id") ?? "";
  if (reference && txn) {
    const { error } = await service.rpc("gateway_mark_paid", {
      attempt_ref: reference,
      txn_id: txn,
      amount_cents: Number(params.get("amount_cents") ?? 0),
      succeeded,
    });
    if (error) console.error("gateway_mark_paid (return) failed:", error);
  }
  return back(succeeded ? "ok" : "fail");
}
