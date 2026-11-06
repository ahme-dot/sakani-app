import { paymobConfig, verifyTransaction } from "@/lib/paymob";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

type Transaction = {
  id?: number | string;
  success?: boolean;
  pending?: boolean;
  is_voided?: boolean;
  is_refunded?: boolean;
  amount_cents?: number;
  order?: { merchant_order_id?: string | null };
};

/**
 * Paymob's server-to-server message after a card payment. Nothing is trusted until its HMAC signature checks
 * out; only then is the fee marked paid (and only for the exact amount, once).
 */
export async function POST(request: Request) {
  const config = paymobConfig();
  const service = getSupabaseServiceClient();
  if (!config || !service) return new Response("not configured", { status: 503 });

  const hmac = new URL(request.url).searchParams.get("hmac") ?? "";
  const body = (await request.json().catch(() => null)) as { type?: string; obj?: Transaction } | null;
  const obj = body?.obj;
  if (!obj || !hmac || !verifyTransaction(obj as Record<string, unknown>, hmac, config.hmacSecret)) {
    return new Response("bad signature", { status: 401 });
  }
  // Refund and void notices for an earlier payment are acknowledged, not booked again.
  if (body?.type !== "TRANSACTION" || obj.is_refunded || obj.is_voided) return new Response("ok");

  const reference = obj.order?.merchant_order_id ?? "";
  if (!reference || obj.id === undefined) return new Response("ok");
  const { data, error } = await service.rpc("gateway_mark_paid", {
    attempt_ref: reference,
    txn_id: String(obj.id),
    amount_cents: Number(obj.amount_cents ?? 0),
    succeeded: obj.success === true && obj.pending !== true,
  });
  if (error) {
    console.error("gateway_mark_paid failed:", error);
    // Paymob retries when it doesn't get a 200.
    return new Response("error", { status: 500 });
  }
  if (data !== "paid" && data !== "duplicate" && data !== "failed") console.warn("Card payment needs a look:", data, reference);
  return new Response("ok");
}
