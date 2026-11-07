# Deploying Sakani

## What runs where

- **Website:** Next.js 16 on Vercel (region `fra1`). Every push to `main` on GitHub deploys automatically.
- **Database, sign-in, files:** Supabase (Postgres with row-level security, Auth, Storage buckets `sakani-listings`, `sakani-avatars`, and the private `sakani-identity`).

## Environment variables (Vercel and `.env.local`)

| Name | What |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable (anon) key — safe in the browser with the RLS policies |
| `NEXT_PUBLIC_SITE_URL` | The public address, e.g. `https://sakani.example`. Without it the build prints a warning, and canonical links, the sitemap and share previews point at localhost. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Optional: Cloudflare Turnstile spam protection |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Used by the payment routes. Supabase → Project Settings → API. |
| `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_HMAC_SECRET`, `PAYMOB_CARD_INTEGRATION_ID` | Server only. Needed for card payments; card mode can't be switched on in Admin → Policies without them. |
| `PAYMOB_FALLBACK_EMAIL` | Optional, server only. The address sent to Paymob when the guest's contact is a phone number. Use one you own; otherwise Paymob gets the placeholder `payments@example.com`. |

Never put a Supabase service-role key or any payment secret in a `NEXT_PUBLIC_` variable. See `env.example`.

## Order of a release (important)

1. Run any new file in `supabase/migrations/` in the Supabase SQL Editor, **in order**, before pushing code that needs it. Every migration is safe to run twice.
2. Run the tests locally: `npm run dev -- --port 3100` in one terminal, then `$env:SAKANI_TEST_URL="http://localhost:3100"; npx playwright test --project=local`.
3. Push to `main`. Vercel builds and deploys, and GitHub Actions checks lint, types and the build (and runs the tests when the repository secrets are set; see the README).
4. Optionally run the live tests: `npm run test:live`.

## Day to day

- **Admin → Today** lists everything waiting for the team, most urgent first (refunds due, transfers to check, unread chats, hosts to pay, deposits to send, listings to review).
- **Admin → Errors** shows errors that happened in visitors' browsers. The same error coming back means something needs fixing.
- **Admin → Team**: give helpers **Review only** access. They can review listings, chat and handle reports, but the database refuses any change they try to make to money, policies, legal pages or the team.

## Team alerts on Telegram

The database tells the team's Telegram chat about new bookings, transfers to check, cancellation requests, reported problems, listings to review, new support tickets and small edits to published places. Each message has the listing's title and a link to the admin panel, with no names, phones or amounts. Until the steps below are done, nothing is sent and nothing else changes. A failed alert never stops a booking or a payment.

1. In Telegram, open **@BotFather**, send `/newbot` and follow the steps. It gives you a token.
2. Create a group for the team, add the bot, and send any message in the group.
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` in your browser and copy the `chat` → `id` number (a group's starts with a minus).
4. In Supabase → SQL Editor, run this once with your values:

```sql
update public.team_alert_settings
set bot_token = '<TOKEN>', chat_id = '<CHAT ID>', site_url = 'https://your-address'
where id = 1;
```

The token controls the bot: type it only into Telegram's address above and the SQL Editor. Never paste it in a chat, an email or a file in this repository. If it leaks, send `/revoke` to @BotFather and run the `update` again.

Check that it works by creating a test booking. Nothing arrives? Database → Extensions: `pg_net` must be on (the migration tries to turn it on, and only prints a notice if it can't).

## First-time setup

1. Create the Supabase project; run every migration in `supabase/migrations/` in order.
2. In Supabase Auth: enable email sign-in and anonymous sign-ins; set the Site URL and Redirect URLs to the public address.
3. Create the admin user, then add it to `public.admin_users` (see README).
4. In the admin panel: **Payments** (InstaPay address, account name, team WhatsApp, fee rates), **Policies** (keep the cancellation policy off until legally approved; payment mode InstaPay), **Legal pages**.
5. Import the project in Vercel, add the environment variables, deploy.
6. Before launch: Admin → Demo → **Remove all demo listings**.

## Changing the domain

Moving the site to a new address has side effects. Plan it before real people depend on the old one.

**What visitors lose:** sign-ins and browser storage belong to one address, so everyone is logged out once. Saved places on the device are lost unless they're in an account. Hosts who listed **without an account** lose access to those listings, because their session lives in the old address's browser storage. Ask them to create an account on the old address first.

1. Vercel → Settings → Domains: add the new domain, and keep the old one redirecting to it.
2. Change `NEXT_PUBLIC_SITE_URL` in Vercel and redeploy. The value is built in, so a redeploy is required.
3. Supabase → Authentication → URL Configuration: set the Site URL and add `https://new-domain/**` to the Redirect URLs. Keep the old entry until the move is finished, so password-reset links already sent keep working.
4. Paymob dashboard: change the webhook to `https://new-domain/api/paymob/webhook`, and the return address if it's set there.
5. Cloudflare Turnstile: add the new domain to the widget, or the spam check fails on sign-up.
6. Google Search Console: add the new address and submit `https://new-domain/sitemap.xml`.
7. Reprint or replace any flyers and QR codes that carry the old address.
8. Update `site_url` in `public.team_alert_settings` (see Team alerts on Telegram), so alerts link to the new address.

## Backups

Check what your Supabase plan includes in Project Settings → Database → Backups, and don't assume a backup exists. Before launch, and before each migration that changes money or bookings, take your own copy of the database and test restoring it once. Database backups don't include Storage files (listing photos, avatars, identity documents), so those need their own copy.

Check too that the daily job is on: migration `20261108000000_sakani_rented_amenities.sql` needs `pg_cron`, and only prints a notice if it isn't available. Enable it in Database → Extensions if needed.

## Tests

`npx playwright test` covers every page (Arabic/English, phone/desktop), booking and payment, finance calculations (the ten cases in the project brief), deposits, contracts, cancellations, chat and permissions.

## Security settings (Supabase dashboard)

Set these once; the site's code can't change them.

1. **Authentication → Sign In / Providers → Email:** turn on **Confirm email**, so nobody can sign up with someone else's address. Supabase's built-in email sends only a few messages an hour, so connect your own sender first (Authentication → Emails → SMTP settings, e.g. Resend).
2. **Authentication → Sign In / Providers → Passwords** (or Attack Protection): minimum length **8**, and turn on **leaked password protection**.
3. **Authentication → Multi-Factor:** keep **TOTP (authenticator app)** enabled. Then each admin opens Admin → Team → **Turn on two-step sign-in**. After that, every admin action needs the 6-digit code; the database enforces it (migration `20261107000000_sakani_security.sql`). Copy the key shown during setup into `.env.local` and the GitHub secrets as `SAKANI_ADMIN_TOTP_SECRET`, so the automated tests can sign in. Lost phone: Authentication → Users → the admin → remove the MFA factor, then set it up again.
4. **Bot protection:** create a free Cloudflare Turnstile site, put its site key in Vercel as `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, and its secret in Supabase → Authentication → Attack Protection → CAPTCHA (Turnstile).

The site already sends a Content-Security-Policy and the other security headers (see `next.config.ts`).
