import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * How a booking payment is collected. Admins pick the mode in Admin → Policies (app_settings.payment_mode).
 *
 * - "manual": the guest sends an InstaPay transfer and enters its transaction number; the Sakani team checks it against
 *   the InstaPay history and confirms it (admin_confirm_booking_payment). Nothing is marked paid from a screenshot.
 * - "sandbox": for testing only — the payment page offers "simulate success / failure" (sandbox_settle_payment);
 *   no money moves, and the database refuses it unless sandbox mode is on.
 *
 * An approved gateway (e.g. Paymob, Fawry, a bank) is added as another provider: it creates a checkout server-side and
 * confirms payments from the gateway's signed webhook, never from the browser. See docs/payments.md.
 */
export type PaymentMode = "manual" | "sandbox";

export type PaymentProvider = {
  id: PaymentMode;
  /** Whether the guest enters a transaction number after paying. */
  asksForReference: boolean;
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

export function paymentProvider(mode: PaymentMode | undefined): PaymentProvider {
  return mode === "sandbox" ? sandbox : manualInstapay;
}
