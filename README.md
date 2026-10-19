# Sakani

An Arabic- and English-language student-housing marketplace for Giza, built with Next.js 16, Tailwind CSS 4, and Supabase.

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
3. In the Supabase SQL Editor, run [`supabase/migrations/20261018000000_sakani_marketplace.sql`](./supabase/migrations/20261018000000_sakani_marketplace.sql), then [`supabase/migrations/20261018010000_sakani_admin_users.sql`](./supabase/migrations/20261018010000_sakani_admin_users.sql).
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

## Test on a phone

For local testing, run the app on a computer and open its LAN address (for example, `http://192.168.x.x:3000`) on a phone connected to the same Wi-Fi network. The computer firewall must allow inbound connections on port 3000. A LAN URL is temporary and is not a public deployment; deploy to a host with HTTPS and configure its URL in Supabase before sharing the site publicly.

## Monetization status

Paid featured placement is planned, but **checkout is intentionally disabled**. No money is collected, and the site does not collect tenant rent or deposits. Choose and configure a payment provider, pricing, and production credentials before enabling any paid product. Do not accept card details directly in this app.
