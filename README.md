# Sakani

An Arabic- and English-language host–guest marketplace for places to rent across Egypt, built with Next.js 16, Tailwind CSS 4, and Supabase.

## Run locally

```powershell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The first visit in development compiles the page; later visits are faster.

For a faster, optimized site preview:

```powershell
npm run build
npm run start
```

The site includes Arabic and English marketplace pages, responsive navigation and filters, an email-free listing submission portal, and a password-protected admin review dashboard.

## Connect Supabase

The site uses Supabase for email-free owner submissions, image uploads, private owner dashboards, and public listings that only appear after admin approval. Configure it as follows:

1. Create or open your Supabase project.
2. In Supabase Authentication settings, enable **Anonymous Sign-Ins**. Owners use an anonymous session to submit and check their listings; they do not provide an email or receive an email. Because anonymous sessions are tied to the user's browser/device, clearing browser data or switching devices means they may not be able to return to that session. Configure Supabase CAPTCHA and sensible auth limits before public launch to reduce anonymous sign-up abuse.
3. In the Supabase SQL Editor, run these files in order:
   1. [`supabase/migrations/20261018000000_sakani_marketplace.sql`](./supabase/migrations/20261018000000_sakani_marketplace.sql)
   2. [`supabase/migrations/20261018010000_sakani_admin_users.sql`](./supabase/migrations/20261018010000_sakani_admin_users.sql)
   3. [`supabase/migrations/20261020000000_sakani_publishing.sql`](./supabase/migrations/20261020000000_sakani_publishing.sql) — multiple photos, the "verified" flag, review notes, owner edits, and a limit of 5 new listings per owner per day.
   4. [`supabase/migrations/20261021000000_sakani_admin_team.sql`](./supabase/migrations/20261021000000_sakani_admin_team.sql) — add and remove admins from the admin panel.
   5. [`supabase/migrations/20261022000000_sakani_owner_accounts.sql`](./supabase/migrations/20261022000000_sakani_owner_accounts.sql) — owner accounts and moving guest listings to an account.
   6. [`supabase/migrations/20261023000000_sakani_admin_user_directory.sql`](./supabase/migrations/20261023000000_sakani_admin_user_directory.sql) — the admin Users list.
   7. [`supabase/migrations/20261024000000_sakani_listing_reports.sql`](./supabase/migrations/20261024000000_sakani_listing_reports.sql) — "Report this listing".
   8. [`supabase/migrations/20261025000000_sakani_contact_and_photos.sql`](./supabase/migrations/20261025000000_sakani_contact_and_photos.sql) — contact form inbox and photo rules.
   9. [`supabase/migrations/20261026000000_sakani_launch.sql`](./supabase/migrations/20261026000000_sakani_launch.sql) — in-person visit verification, views and WhatsApp-click counts.
   10. [`supabase/migrations/20261027000000_sakani_availability.sql`](./supabase/migrations/20261027000000_sakani_availability.sql) — owners mark homes "Rented / full" and confirm "Still available".
   11. [`supabase/migrations/20261028000000_sakani_payments.sql`](./supabase/migrations/20261028000000_sakani_payments.sql) — owner success fee paid by InstaPay / Vodafone Cash, and payment settings.
   12. [`supabase/migrations/20261029000000_sakani_egypt.sql`](./supabase/migrations/20261029000000_sakani_egypt.sql) — adds governorates for Egypt-wide listings, backfills existing homes as Giza, and adds location constraints and an index.
   13. [`supabase/migrations/20261030000000_sakani_middleman.sql`](./supabase/migrations/20261030000000_sakani_middleman.sql) — visit requests, the team WhatsApp number, the student service fee, and fees from both sides.
   14. [`supabase/migrations/20261030010000_sakani_private_numbers.sql`](./supabase/migrations/20261030010000_sakani_private_numbers.sql) — hides owners' numbers from visitors (owners and admins read them through `listing_private_contacts`).
   15. [`supabase/migrations/20261031000000_sakani_pay_links.sql`](./supabase/migrations/20261031000000_sakani_pay_links.sql) — a private payment link for every fee.
   16. [`supabase/migrations/20261101000000_sakani_hosts_guests.sql`](./supabase/migrations/20261101000000_sakani_hosts_guests.sql) — host and guest accounts (profiles), saved places in the account, bookings from signed-in guests, men or women only (mixed listings go back to their hosts), and universities no longer required.
4. Create an administrator in Supabase Authentication with an email and password. This email is only for the administrator; listing submitters do not need one.
5. In the Supabase SQL Editor, add that Auth user's ID to the admin allowlist by running this query after replacing the placeholder with the exact administrator email:

   ```sql
   insert into public.admin_users (user_id)
   select id
   from auth.users
   where email = 'admin@example.com'
   on conflict (user_id) do nothing;
   ```

   Confirm that exactly one row was inserted. Only accounts in `public.admin_users` can review listings. The table has no public insert policy, so add or remove administrators through the Supabase SQL Editor.
6. Copy `env.example` to `.env.local` and fill in the project URL and the **publishable/anon** key from the Supabase API settings. These public credentials are safe to expose with the included row-level security policies. Never put a Supabase service-role key in a `NEXT_PUBLIC_` variable or the browser.
7. In Supabase Authentication URL Configuration, set the Site URL to your development URL (for example, `http://localhost:3000`) and add the exact production URL when deploying. Email redirects are not needed for email-free owner submissions.
8. Allow password-reset redirects in Supabase Authentication URL Configuration. For local development, add `http://localhost:3000/**`; for local-network phone testing, add the computer's current LAN URL ending in `:3000/**`. Add the permanent HTTPS domain when deploying. The reset page must be reachable on the same device that opens the email.
9. Restart the app after changing `.env.local`. For a production build, configure these variables in the hosting provider before building.
10. Visit `/en/sign-in` or `/ar/sign-in` to sign in as the administrator, then review pending listings at `/en/admin` or `/ar/admin`. Use the Auth user's email/password, not necessarily the password you use to sign in to the Supabase dashboard. If the Auth user has no password or you forgot it, use **Forgot your password?** and follow the emailed link to set one. Approving publishes a listing; rejecting keeps it off the public feed. Owners can only read their own submission statuses.

Until Supabase is configured, the home page explicitly labels its built-in property cards as sample listings; owner submissions show setup instructions instead.

## Reviewing listings

- **Approve and publish** makes a listing public. **Reject** asks for a reason, which the owner sees in their portal; they can then edit and resubmit.
- **Visited: mark verified** adds the "Verified" badge. Only use it after someone from your team has actually seen the property. Approved but unvisited listings are shown without the badge.
- **Unpublish** takes a live listing down; **Delete permanently** removes it and its photos.
- Owners can hide a published home themselves with **Rented / full** (it moves to the **Paused** tab) and confirm **Still available** each month. On the **Published** tab, **Not updated in 30+ days** lists homes to follow up on.

## Automated tests

The Playwright suite in `tests/` checks every page in Arabic and English on desktop and phone (errors, layout, right-to-left, fonts, form controls), saved places, the host form, booking with an account, log in and log out, the admin panel and the database security rules. Booking tests use the admin account as a guest for a moment and switch it back to host afterwards. It uses the Microsoft Edge already installed on Windows.

```powershell
$env:SAKANI_ADMIN_EMAIL = "admin email"; $env:SAKANI_ADMIN_PASSWORD = "admin password"
npm test            # starts a local dev server on port 3100 and tests it
npm run test:live   # tests the live site
```

Without the two admin variables, tests that need listings or the admin panel are skipped. The suite creates its own `[E2E TEST]` listings and deletes them (with their photos) when it finishes. To test a dev server that is already running, set `$env:SAKANI_TEST_URL = "http://localhost:3000"`.

## Publish to the internet (Vercel)

1. Push this repository to GitHub.
2. At [vercel.com](https://vercel.com), sign in with GitHub, choose **Add New → Project**, and import the repository. Vercel detects Next.js automatically.
3. Under **Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SITE_URL` (your final address, for example `https://sakani.vercel.app` or your own domain). Optionally add `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
4. Click **Deploy**. Later pushes to `main` redeploy automatically.
5. In Supabase **Authentication → URL Configuration**, set the **Site URL** to the live address and add `https://your-domain/**` to **Redirect URLs**.
6. In [Google Search Console](https://search.google.com/search-console), add the site and submit `https://your-domain/sitemap.xml`.

### Spam protection (recommended)

1. In the [Cloudflare dashboard](https://dash.cloudflare.com/?to=/:account/turnstile), create a free **Turnstile** widget for your domain (add `localhost` too for testing). Copy the **site key** and **secret key**.
2. In Supabase **Authentication → Attack Protection**, enable CAPTCHA, choose **Turnstile**, and paste the **secret key**.
3. Add the **site key** as `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in Vercel (and `.env.local`), then redeploy.

Do steps 2 and 3 together: once Supabase requires CAPTCHA, every sign-in needs the widget.

## Test on a phone

For local testing, run the app on a computer and open its LAN address (for example, `http://192.168.x.x:3000`) on a phone connected to the same Wi-Fi network. The computer firewall must allow inbound connections on port 3000. A LAN URL is temporary and is not a public deployment; deploy to a host with HTTPS and configure its URL in Supabase before sharing the site publicly.

## Accounts, bookings and payments (Sakani as middleman)

People sign up as a **guest** (looking for a place) or a **host** (has a place), and can switch on their profile page (`/account`). Guests see their bookings, fees and saved places there; hosts see their places and fees.

Guests never see hosts' numbers. They contact the Sakani team with the WhatsApp button, or press **Book now** (a guest account is required) and choose a move-in date and stay. The team checks with the host and arranges the visit. When a booking is confirmed, a one-time fee is due from **both sides**: the host's success fee and the guest's service fee (each a percentage of one month's rent, with a minimum). Every payment happens on the site.

1. In the admin panel, open **Payments** and fill in:
   - your InstaPay address, Vodafone Cash number and account name;
   - the team WhatsApp number;
   - the owner fee % and minimum, and the student fee % and minimum.
2. Under **Bookings**, contact the guest and the host, book the visit, then choose **Confirm booking: create fees**. That creates both fees, and the guest also sees theirs, with a **Pay** button, on their profile.
3. Under **Payments**, choose **Send pay link** on each fee. WhatsApp opens to the student or owner with a private payment link. On that page they see the amount and your payment details, pay by InstaPay or Vodafone Cash, and enter the transaction number and the phone number they paid from. Owners can also pay from their dashboard.
4. Under **Payments → To check**, compare it with your InstaPay / Vodafone Cash history and choose **Payment received**, **Not received** (they can resend) or **Waive**. The same link then shows "Paid" as their receipt.
5. If you learn of a rental that wasn't recorded, use **Rented via Sakani: add fee** on the listing card.

Owners with a fee more than 14 days overdue cannot add new listings until it is paid. Money goes straight to your account; the site never handles card details.
