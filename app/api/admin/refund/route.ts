import { paymobConfig, refundTransaction } from "@/lib/paymob";
import { getSupabaseServiceClient, getSupabaseUserClient } from "@/lib/supabase/service";

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A full admin refunds a booking to the guest's card. The admin is checked with their own session (which
 * must have passed the two-step code); the amount comes from the database.
 */
export async function POST(request: Request) {
  const config = paymobConfig();
  const service = getSupabaseServiceClient();
  if (!config || !service) return Response.json({ error: "card_not_ready" }, { status: 503 });

  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const user = getSupabaseUserClient(accessToken);
  if (!user) return Response.json({ error: "not_allowed" }, { status: 401 });
  const [{ data: isFull }, { data: who }] = await Promise.all([user.rpc("is_full_admin"), user.auth.getUser(accessToken)]);
  if (isFull !== true || !who.user) return Response.json({ error: "not_allowed" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { booking_id?: string };
  const bookingId = String(body.booking_id ?? "");
  if (!ID_PATTERN.test(bookingId)) return Response.json({ error: "booking_not_found" }, { status: 404 });

  const { data, error } = await service.rpc("gateway_refund_info", { target_booking: bookingId });
  const info = (data as Array<{ txn_id: string; amount_cents: number }> | null)?.[0];
  if (error || !info) {
    const code = error?.message.match(/booking_not_found|not_card|nothing_to_refund/)?.[0] ?? "refund_failed";
    return Response.json({ error: code }, { status: 409 });
  }

  let refundId: string;
  try {
    refundId = await refundTransaction(config, info.txn_id, Number(info.amount_cents));
  } catch (refundError) {
    console.error("Paymob refund failed:", refundError);
    return Response.json({ error: "refund_failed" }, { status: 502 });
  }
  const { error: markError } = await service.rpc("gateway_mark_refunded", { target_booking: bookingId, refund_txn: refundId, admin_user: who.user.id });
  if (markError) {
    // The money went back but the booking wasn't updated: say so, with the refund id, so nobody refunds twice.
    console.error("gateway_mark_refunded failed after a refund:", markError, refundId);
    return Response.json({ error: "refunded_not_recorded", refund_id: refundId }, { status: 500 });
  }
  return Response.json({ refunded: Number(info.amount_cents) / 100, refund_id: refundId });
}
