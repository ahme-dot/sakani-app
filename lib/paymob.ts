/**
 * Paymob (Accept) for card payments: Visa, Mastercard and Meeza. Server only: the keys below are read from
 * the environment on the server and must never be imported into a client component.
 *
 * Flow: the server creates a payment intention for a fee and sends the guest to Paymob's checkout page; the
 * card is typed there, never on Sakani. Paymob then calls /api/paymob/webhook (and sends the guest back to
 * /api/paymob/return); both carry an HMAC signature that is checked before anything is marked paid.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://accept.paymob.com";

export type PaymobConfig = {
  secretKey: string;
  publicKey: string;
  hmacSecret: string;
  integrationId: number;
};

export function paymobConfig(): PaymobConfig | null {
  if (typeof window !== "undefined") throw new Error("paymob.ts is server only");
  const secretKey = process.env.PAYMOB_SECRET_KEY?.trim() ?? "";
  const publicKey = process.env.PAYMOB_PUBLIC_KEY?.trim() ?? "";
  const hmacSecret = process.env.PAYMOB_HMAC_SECRET?.trim() ?? "";
  const integrationId = Number(process.env.PAYMOB_CARD_INTEGRATION_ID?.trim());
  if (!secretKey || !publicKey || !hmacSecret || !Number.isInteger(integrationId) || integrationId <= 0) return null;
  return { secretKey, publicKey, hmacSecret, integrationId };
}

/** The fields Paymob signs, in the order it signs them. */
const SIGNED_FIELDS = [
  "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction", "id", "integration_id",
  "is_3d_secure", "is_auth", "is_capture", "is_refunded", "is_standalone_payment", "is_voided", "order.id", "owner",
  "pending", "source_data.pan", "source_data.sub_type", "source_data.type", "success",
] as const;

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function sameSignature(expected: string, given: string) {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(values: string[], secret: string) {
  return createHmac("sha512", secret).update(values.join("")).digest("hex");
}

function pick(obj: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined), obj);
}

/** The transaction object of Paymob's server-to-server message ({ type: "TRANSACTION", obj }). */
export function verifyTransaction(obj: Record<string, unknown>, hmac: string, secret: string) {
  return sameSignature(sign(SIGNED_FIELDS.map((field) => text(pick(obj, field))), secret), hmac);
}

/** The query string Paymob adds when it sends the guest back (flat names; "order" is the order id). */
export function verifyRedirect(params: URLSearchParams, secret: string) {
  const values = SIGNED_FIELDS.map((field) => text(params.get(field === "order.id" ? "order" : field)));
  return sameSignature(sign(values, secret), params.get("hmac") ?? "");
}

export type CheckoutInput = {
  amountCents: number;
  reference: string;
  title: string;
  name: string;
  contact: string;
  notificationUrl: string;
  redirectionUrl: string;
};

/** Creates a payment intention and returns the address of Paymob's checkout page for it. */
export async function createCheckout(config: PaymobConfig, input: CheckoutInput): Promise<string> {
  const [first, ...rest] = (input.name || "Sakani guest").trim().split(/\s+/);
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contact) ? input.contact : process.env.PAYMOB_FALLBACK_EMAIL?.trim() || "payments@example.com";
  const phone = /^[+0-9 ()-]{8,20}$/.test(input.contact) ? input.contact.replace(/[^\d+]/g, "") : "NA";
  const response = await fetch(`${API}/v1/intention/`, {
    method: "POST",
    headers: { Authorization: `Token ${config.secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: input.amountCents,
      currency: "EGP",
      payment_methods: [config.integrationId],
      items: [{ name: input.title.slice(0, 50) || "Sakani booking", amount: input.amountCents, quantity: 1 }],
      billing_data: {
        first_name: first || "Sakani", last_name: rest.join(" ") || "Guest", email, phone_number: phone,
        apartment: "NA", floor: "NA", street: "NA", building: "NA", city: "NA", state: "NA", country: "EG", postal_code: "NA",
      },
      special_reference: input.reference,
      notification_url: input.notificationUrl,
      redirection_url: input.redirectionUrl,
    }),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as { client_secret?: string };
  if (!response.ok || !data.client_secret) {
    throw new Error(`Paymob intention failed (${response.status})`);
  }
  return `${API}/unifiedcheckout/?publicKey=${encodeURIComponent(config.publicKey)}&clientSecret=${encodeURIComponent(data.client_secret)}`;
}

/** Refunds part or all of a card transaction. Returns Paymob's id for the refund. */
export async function refundTransaction(config: PaymobConfig, transactionId: string, amountCents: number): Promise<string> {
  const response = await fetch(`${API}/api/acceptance/void_refund/refund`, {
    method: "POST",
    headers: { Authorization: `Token ${config.secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ transaction_id: transactionId, amount_cents: amountCents }),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as { id?: number | string; success?: boolean };
  if (!response.ok || data.success === false || !data.id) {
    throw new Error(`Paymob refund failed (${response.status})`);
  }
  return String(data.id);
}
