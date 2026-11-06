import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { verifyRedirect, verifyTransaction } from "../lib/paymob";
import { cardFee } from "../lib/payments";
import { SUPABASE_KEY, api, guestSession } from "./helpers";

// Card payments (migration 20261110000000, lib/paymob.ts, app/api/paymob/*).

const SECRET = "test-hmac-secret";
const ORDER = [
  "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction", "id", "integration_id",
  "is_3d_secure", "is_auth", "is_capture", "is_refunded", "is_standalone_payment", "is_voided", "order.id", "owner",
  "pending", "source_data.pan", "source_data.sub_type", "source_data.type", "success",
];

const transaction = {
  amount_cents: 1030300, created_at: "2026-11-05T12:00:00.000000", currency: "EGP", error_occured: false,
  has_parent_transaction: false, id: 123456, integration_id: 4567, is_3d_secure: true, is_auth: false, is_capture: false,
  is_refunded: false, is_standalone_payment: true, is_voided: false, order: { id: 987, merchant_order_id: "fee-1" }, owner: 42,
  pending: false, source_data: { pan: "2346", sub_type: "MasterCard", type: "card" }, success: true,
};

function expectedHmac(values: string[]) {
  return createHmac("sha512", SECRET).update(values.join("")).digest("hex");
}

test.describe("card payments", () => {
  test("the Paymob signature is checked, and any change breaks it", () => {
    const flat = (path: string) => String(path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], transaction));
    const hmac = expectedHmac(ORDER.map(flat));
    expect(verifyTransaction(transaction, hmac, SECRET)).toBe(true);
    expect(verifyTransaction(transaction, hmac.toUpperCase(), SECRET)).toBe(true);
    expect(verifyTransaction({ ...transaction, amount_cents: 100 }, hmac, SECRET)).toBe(false);
    expect(verifyTransaction({ ...transaction, success: false }, hmac, SECRET)).toBe(false);
    expect(verifyTransaction(transaction, hmac, "another-secret")).toBe(false);
    expect(verifyTransaction(transaction, "", SECRET)).toBe(false);

    // The guest's return trip: the same fields, flat ("order" is the order id).
    const params = new URLSearchParams();
    for (const field of ORDER) params.set(field === "order.id" ? "order" : field, flat(field));
    params.set("hmac", hmac);
    expect(verifyRedirect(params, SECRET)).toBe(true);
    params.set("amount_cents", "1");
    expect(verifyRedirect(params, SECRET)).toBe(false);
  });

  test("the card fee is a percent plus a fixed amount, rounded up", () => {
    expect(cardFee(10000, 2.75, 3)).toBe(278);
    expect(cardFee(1, 2.75, 3)).toBe(4);
    expect(cardFee(0, 2.75, 3)).toBe(0);
    expect(cardFee(5000, 0, 0)).toBe(0);
  });

  test("a forged webhook is refused", async ({ request }) => {
    const response = await request.post("/api/paymob/webhook?hmac=forged", { data: { type: "TRANSACTION", obj: transaction } });
    // 401 with the keys set; 503 where card payments aren't configured.
    expect([401, 503]).toContain(response.status());
  });

  test("nobody signed in (or not) can mark a payment paid or refunded", async () => {
    const guest = await guestSession();
    for (const token of [SUPABASE_KEY, guest.access_token]) {
      const paid = await api("/rest/v1/rpc/gateway_mark_paid", { token, method: "POST", body: { attempt_ref: "x", txn_id: "1", amount_cents: 100, succeeded: true } });
      expect(paid.status).toBeGreaterThanOrEqual(400);
      const refunded = await api("/rest/v1/rpc/gateway_mark_refunded", { token, method: "POST", body: { target_booking: "00000000-0000-0000-0000-000000000000", refund_txn: "1", admin_user: "00000000-0000-0000-0000-000000000000" } });
      expect(refunded.status).toBeGreaterThanOrEqual(400);
      const begun = await api("/rest/v1/rpc/gateway_begin", { token, method: "POST", body: { token: "00000000-0000-0000-0000-000000000000" } });
      expect(begun.status).toBeGreaterThanOrEqual(400);
    }
    const attempts = await api<unknown[]>("/rest/v1/payment_attempts?select=reference&limit=1", { token: guest.access_token });
    expect(attempts.status >= 400 || (Array.isArray(attempts.data) && attempts.data.length === 0)).toBe(true);
  });

  test("the database and the page work out the same card fee", async () => {
    const settings = await api<Array<{ card_fee_percent: number; card_fee_fixed: number }>>("/rest/v1/app_settings?select=card_fee_percent,card_fee_fixed&id=eq.1");
    test.skip(settings.status >= 400, "migration 20261110000000 not installed yet");
    const { card_fee_percent: percent, card_fee_fixed: fixed } = settings.data[0];
    for (const amount of [1, 999, 10300, 20800]) {
      const fee = await api<number>("/rest/v1/rpc/card_fee_for", { method: "POST", body: { base: amount } });
      expect(fee.data).toBe(cardFee(amount, Number(percent), Number(fixed)));
    }
  });

  test("checkout refuses a made-up pay link", async ({ request }) => {
    const response = await request.post("/api/pay/checkout", { data: { token: "not-a-token", locale: "en" } });
    expect(response.status()).toBeGreaterThanOrEqual(400);
    const ready = await (await request.get("/api/pay/checkout")).json();
    expect(typeof ready.ready).toBe("boolean");
  });
});
