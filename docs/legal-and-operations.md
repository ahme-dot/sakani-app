# What must happen before Sakani collects real money

The software is ready to run bookings end to end, but these are **not software tasks** and must be done first:

## Legal
- Register the business (commercial register) and get a tax card; agree how fees are invoiced.
- Have an Egyptian lawyer review and approve: the Terms, Privacy Policy, the guest and host platform agreements, the rental agreement template, and the six policy pages. Then mark each policy page **approved** (Admin → Legal pages) and raise `DOCUMENT_VERSION` in `lib/documents.ts` if the texts change.
- Confirm whether Sakani's activity needs real-estate brokerage registration.
- Holding guests' rent and deposits: confirm with the lawyer and the bank that this is allowed for the business and how it must be held.
- Agree the cancellation rules for the seven scenarios, enter them in Admin → Policies, and only then switch the policy on.
- In-site acceptance of a document is a recorded agreement, **not** a certified electronic signature. If signed contracts are needed, add an approved e-signature provider or sign on paper.

## Payments
- A commercial collection method (business account / approved gateway). A personal InstaPay account usually isn't suitable for commercial collection. See `docs/payments.md`.

## Operations
- Someone must check Admin → Bookings and Chat every day: transfers to check, refunds due (the 24-hour countdown), hosts to pay, deposits to send, cancellation requests.
- Phone numbers are not yet verified by SMS: that needs an SMS provider account (e.g. an Egyptian SMS gateway or Twilio) and its credentials.
- Remove the demo listings before launch.
