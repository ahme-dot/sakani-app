import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * How a booking payment is collected. Admins pick the mode in Admin → Policies (app_settings.payment_mode).
 *
 * - "manual": the guest sends an InstaPay transfer and enters its transaction number; the Sakani team checks it against
 *   the InstaPay history and confirms it (admin_confirm_booking_payment). Nothing is marked paid from a screenshot.
 * - "paymob": the guest pays by card (Visa, Mastercard, Meeza) on Paymob's page; the payment is confirmed only by
 *   Paymob's signed message to /api/paymob/webhook (see lib/paymob.ts). A card fee is added to the total.
 * - "sandbox": for testing only — the payment page offers "simulate success / failure" (sandbox_settle_payment);
 *   no money moves, and the database refuses it unless sandbox mode is on.
 *
 * An approved gateway (e.g. Paymob, Fawry, a bank) is added as another provider: it creates a checkout server-side and
 * confirms payments from the gateway's signed webhook, never from the browser. See docs/payments.md.
 */
export type PaymentMode = "manual" | "sandbox" | "paymob";

export type PaymentProvider = {
  id: PaymentMode;
  /** Whether the guest enters a transaction number after paying. */
  asksForReference: boolean;
  /** Sends the guest to a card checkout page (Paymob). */
  card?: boolean;
  /** Confirms or fails a payment link without real money (sandbox only). */
  settle?: (client: SupabaseClient, token: string, succeed: boolean) => Promise<{ error: unknown }>;
};

const manualInstapay: PaymentProvider = { id: "manual", asksForReference: true };

const sandbox: PaymentProvider = {
  id: "sandbox",
  asksForReference: false,
  settle: async (client, token, succeed) => {
    const { error } = await client.rpc("sandbox_settle_payment", { token, succeed });
    return { error };
  },
};

const card: PaymentProvider = { id: "paymob", asksForReference: false, card: true };

/** Starts a card payment for a pay link; returns the checkout address or an error code. */
export async function startCardCheckout(token: string, locale: string): Promise<{ url?: string; error?: string }> {
  try {
    const response = await fetch("/api/pay/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, locale }),
    });
    const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
    return response.ok && data.url ? { url: data.url } : { error: data.error ?? "checkout_failed" };
  } catch {
    return { error: "checkout_failed" };
  }
}

export function paymentProvider(mode: PaymentMode | undefined): PaymentProvider {
  return mode === "sandbox" ? sandbox : mode === "paymob" ? card : manualInstapay;
}
