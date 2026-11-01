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
3. Push to `main`. Vercel builds and deploys.
4. Optionally run the live tests: `npm run test:live`.

## First-time setup

1. Create the Supabase project; run every migration in `supabase/migrations/` in order.
2. In Supabase Auth: enable email sign-in and anonymous sign-ins; set the Site URL and Redirect URLs to the public address.
3. Create the admin user, then add it to `public.admin_users` (see README).
4. In the admin panel: **Payments** (InstaPay address, account name, team WhatsApp, fee rates), **Policies** (keep the cancellation policy off until legally approved; payment mode InstaPay), **Legal pages**.
5. Import the project in Vercel, add the environment variables, deploy.
6. Before launch: Admin → Demo → **Remove all demo listings**.

## Tests

`npx playwright test` covers every page (Arabic/English, phone/desktop), booking and payment, finance calculations (the ten cases in the project brief), deposits, contracts, cancellations, chat and permissions.
