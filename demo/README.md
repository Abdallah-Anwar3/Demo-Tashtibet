# Demo environment

A separate Supabase project + a separate Vercel project, with fake accounts and fake data. Nothing here touches production.

## 1. Supabase (the **Demo** project)
1. Copy its **Reference ID** (Project Settings → General).
2. `node scripts/bundle-migrations.mjs --ref <REF>` → creates `demo/01-all-migrations.sql`.
3. SQL Editor: run `demo/01-all-migrations.sql`, then `demo/02-demo-seed.sql`. The second one creates the fake accounts and data, and schedules a nightly reset (02:00 UTC).
4. Edge functions (only `admin-users` is needed so the Team page can add users):
   `npx supabase functions deploy admin-users --project-ref <REF>`
5. Auth → URL Configuration: set Site URL to the demo's Vercel address.
6. Do **not** set Resend or VAPID secrets: no real emails or push notifications go out.

## 2. Vercel
Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (from the Demo project) and `VITE_DEMO=1`. Then deploy.
`VITE_DEMO=1` shows the "demo" banner and the quick-login buttons on the sign-in page.

## 3. Accounts (password for all: `Demo@2026!`)
| Role | Email |
|---|---|
| System admin | admin@demo.test |
| Project manager | manager@demo.test |
| Site engineer | eng1@demo.test, eng2@demo.test |
| Client | client@demo.test |

## 4. Notes
- `demo_reset()` deletes all users and data, then re-seeds. It refuses to run unless the `demo_marker` table exists, which only the demo seed creates. Never run `02-demo-seed.sql` on a real project.
- Photos uploaded by visitors stay in Storage after a reset; clear the buckets from the dashboard now and then.
- Keep-alive: the workflow in `.github/workflows/demo-keepalive.yml` pings the API daily. Add the repository secrets `DEMO_SUPABASE_URL` and `DEMO_SUPABASE_ANON_KEY`.
