# Deploying Sakani

## What runs where

- **Website:** Next.js 16 on Vercel (region `fra1`). Every push to `main` on GitHub deploys automatically.
- **Database, sign-in, files:** Supabase (Postgres with row-level security, Auth, Storage buckets `sakani-listings`, `sakani-avatars`, and the private `sakani-identity`).

## Environment variables (Vercel and `.env.local`)

| Name | What |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable (anon) key — safe in the browser with the RLS policies |
| `NEXT_PUBLIC_SITE_URL` | The public address, e.g. `https://sakani.example` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Optional: Cloudflare Turnstile spam protection |

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

## First-time setup

1. Create the Supabase project; run every migration in `supabase/migrations/` in order.
2. In Supabase Auth: enable email sign-in and anonymous sign-ins; set the Site URL and Redirect URLs to the public address.
3. Create the admin user, then add it to `public.admin_users` (see README).
4. In the admin panel: **Payments** (InstaPay address, account name, team WhatsApp, fee rates), **Policies** (keep the cancellation policy off until legally approved; payment mode InstaPay), **Legal pages**.
5. Import the project in Vercel, add the environment variables, deploy.
6. Before launch: Admin → Demo → **Remove all demo listings**.

## Tests

`npx playwright test` covers every page (Arabic/English, phone/desktop), booking and payment, finance calculations (the ten cases in the project brief), deposits, contracts, cancellations, chat and permissions.

## Security settings (Supabase dashboard)

Set these once; the site's code can't change them.

1. **Authentication → Sign In / Providers → Email:** turn on **Confirm email**, so nobody can sign up with someone else's address. Supabase's built-in email sends only a few messages an hour, so connect your own sender first (Authentication → Emails → SMTP settings, e.g. Resend).
2. **Authentication → Sign In / Providers → Passwords** (or Attack Protection): minimum length **8**, and turn on **leaked password protection**.
3. **Authentication → Multi-Factor:** keep **TOTP (authenticator app)** enabled. Then each admin opens Admin → Team → **Turn on two-step sign-in**. After that, every admin action needs the 6-digit code; the database enforces it (migration `20261107000000_sakani_security.sql`). Copy the key shown during setup into `.env.local` and the GitHub secrets as `SAKANI_ADMIN_TOTP_SECRET`, so the automated tests can sign in. Lost phone: Authentication → Users → the admin → remove the MFA factor, then set it up again.
4. **Bot protection:** create a free Cloudflare Turnstile site, put its site key in Vercel as `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, and its secret in Supabase → Authentication → Attack Protection → CAPTCHA (Turnstile).

The site already sends a Content-Security-Policy and the other security headers (see `next.config.ts`).
