# Payments in Sakani

## How money moves today

| Step | What happens | Where |
|---|---|---|
| Booking | The guest pays upfront: first month's rent + guest fee (8% of one month) + security deposit. | `guest_create_booking` → `rental_fees` (kind `upfront`) |
| Transfer | The guest sends an InstaPay transfer and enters the transaction number and the phone it came from. | `/pay/<token>` → `submit_payment_by_token` (status `submitted`) |
| Check | The team compares it with the InstaPay history and marks it received, or not received. **Nothing is marked paid from a screenshot.** | Admin → Bookings → `admin_confirm_booking_payment` / `admin_decide_fee` |
| Contract | Guest and host accept the rental agreement. | `accept_document` → `contract_signed_at` |
| Deposit | After payment and the signed contract, the team sends the deposit to the host (once) and the host acknowledges it. | `admin_transfer_deposit`, `host_acknowledge_deposit` |
| Rent | After the guest confirms moving in, the team sends the host rent − host fee (10% of one month). | `guest_confirm_move_in`, `admin_mark_payout` |
| Refund | Cancellation requests are approved by the team **only** when the cancellation policy is active and the scenario's rule is set. The refund is recorded with its transaction number. | `request_cancellation`, `admin_decide_cancellation`, `admin_mark_refunded` |

All amounts come from one formula: `lib/finance.ts` (code) and `public.commission_for` (database), with whole pounds and half-up rounding. Every change to bookings, payments, deposits, fee rates, cancellation rules and legal pages is written to the append-only `audit_logs`.

## Payment statuses

| Prompt status | Sakani |
|---|---|
| Pending | `rental_fees.status = due` |
| Awaiting verification | `submitted` |
| Paid | `paid` |
| Failed | the team chooses **Not received** → back to `due` (the guest is notified) |
| Refund pending | booking `refund_pending` |
| Refunded | `refunded` (fee and booking) |

## Sandbox mode

Admin → Policies → Payment mode → **Sandbox**. The payment page then shows "Simulate a successful / failed payment" (`sandbox_settle_payment`), so the whole flow can be tested without money. The database refuses it unless sandbox mode is on. Switch back to **InstaPay** before real users arrive.

## Card payments (Paymob)

Admin → Policies → Payment mode → **Card (Paymob)**. It can't be switched on until the server has the keys (see `env.example`).

1. The pay page shows the amount, the card fee (`card_fee_percent` % + `card_fee_fixed` EGP, set in Policies, paid by the guest) and the total.
2. **Pay by card** → `POST /api/pay/checkout` → `gateway_begin` (database: fixes the fee, records an attempt in `payment_attempts`) → a Paymob payment intention → the guest goes to Paymob's checkout. The card is typed on Paymob's page, never on Sakani.
3. Paymob calls `POST /api/paymob/webhook` (server to server) and sends the guest back through `GET /api/paymob/return`. Both are HMAC-signed; nothing is trusted before the signature checks out. Then `gateway_mark_paid` marks the fee paid **only for the exact amount**, once per transaction. The booking follows on its own (`booking_refresh`): waiting for the host, then confirmed.
4. Refunds: Admin → Bookings → **Refund to the card** → `POST /api/admin/refund` (full admins with the two-step code only) → Paymob refund → `gateway_mark_refunded`. A full refund (host declined or didn't answer) includes the card fee; an approved cancellation refunds what the policy allows. Card payments can't be marked refunded by hand.
5. Host payouts and deposit returns stay manual (bank or wallet transfer), as before.

The `gateway_*` functions can only be called with the service-role key (`SUPABASE_SERVICE_ROLE_KEY`), which only the server routes use.

Edge cases the database handles: a second paid checkout for the same fee is flagged in the fee's note for a manual refund in the Paymob dashboard; a payment that arrives after the booking expired moves the booking to "refund pending"; a wrong amount is noted and not marked paid.

**Before going live:** ask Paymob (1) whether a card fee may be shown and charged to the customer, (2) whether refunds return Paymob's fee, and (3) how long refunds are allowed after a payment (deposits are returned by hand, so this matters only for booking refunds).

## Adding another payment gateway

`lib/payment-providers.ts` is the place to add one (e.g. Paymob, Fawry, or a bank). A gateway provider must:

1. Create the checkout **on the server** (a Next.js route handler) with the gateway's secret key, never in the browser.
2. Confirm payments **only** from the gateway's signed webhook (verify the HMAC/signature), then call a database function that marks the `rental_fees` row paid — the same effect as `admin_confirm_booking_payment`.
3. Store the gateway's transaction id in `rental_fees.reference`.

Credentials needed (store them as Vercel environment variables, never in the code):

- **Paymob:** API key, integration id(s), iframe id, HMAC secret.
- **Fawry:** merchant code, security key.

Until then, keep collecting by InstaPay with manual checks. Before collecting money at scale, confirm with the bank and a lawyer that the receiving account is suitable for commercial collection (a personal InstaPay account usually isn't).
