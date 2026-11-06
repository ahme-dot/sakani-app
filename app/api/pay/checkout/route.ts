import { createCheckout, paymobConfig } from "@/lib/paymob";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Begun = { fee_id: string; reference: string; amount: number; card_fee: number; total: number; payer_name: string | null; payer_contact: string | null; listing_title: string };

/** Whether card payments can run (keys set on the server). The admin's policy page asks before switching. */
export async function GET() {
  return Response.json({ ready: Boolean(paymobConfig() && getSupabaseServiceClient()) });
}

/**
 * Starts a card payment for one fee (by its private pay link token) and returns Paymob's checkout address.
 * The amount comes from the database, never from the browser.
 */
export async function POST(request: Request) {
  const config = paymobConfig();
  const service = getSupabaseServiceClient();
  if (!config || !service) return Response.json({ error: "card_not_ready" }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { token?: string; locale?: string };
  const token = String(body.token ?? "");
  const locale = body.locale === "en" ? "en" : "ar";
  if (!TOKEN_PATTERN.test(token)) return Response.json({ error: "fee_not_found" }, { status: 404 });

  const { data, error } = await service.rpc("gateway_begin", { token });
  const fee = (data as Begun[] | null)?.[0];
  if (error || !fee) {
    const code = error?.message.match(/card_disabled|fee_not_found|fee_not_due|too_many_attempts/)?.[0] ?? "checkout_failed";
    if (code === "checkout_failed") console.error("gateway_begin failed:", error);
    return Response.json({ error: code }, { status: code === "fee_not_found" ? 404 : 409 });
  }

  const origin = new URL(request.url).origin;
  try {
    const url = await createCheckout(config, {
      amountCents: fee.total * 100,
      reference: fee.reference,
      title: fee.listing_title,
      name: fee.payer_name ?? "",
      contact: fee.payer_contact ?? "",
      notificationUrl: `${origin}/api/paymob/webhook`,
      redirectionUrl: `${origin}/api/paymob/return?t=${token}&l=${locale}`,
    });
    return Response.json({ url });
  } catch (checkoutError) {
    console.error("Could not start the card payment:", checkoutError);
    return Response.json({ error: "checkout_failed" }, { status: 502 });
  }
}
