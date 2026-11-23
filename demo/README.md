# Demo environment

A separate Supabase project + a separate Vercel project, with fake accounts and fake data. Nothing here touches production.

## 1. Supabase (the **Demo** project)

1. Copy its **Reference ID** (Project Settings → General).
2. `node scripts/bundle-migrations.mjs --ref <REF>` → creates `demo/01-all-migrations.sql`.
3. SQL Editor: run `demo/01-all-migrations.sql`, then `demo/02-demo-seed.sql`. The second one creates the fake accounts and data, and schedules a reset at the start of every hour (`0 * * * *`).
   Already ran the older nightly version? Run `demo/03-hourly-reset.sql` once instead of re-running the seed.
4. Edge functions: **none are needed.** The demo does not allow creating, editing or deleting accounts, so `admin-users` is not deployed. (If it is deployed anyway, it refuses to act while the `demo_marker` table exists.)
5. Auth → URL Configuration: set Site URL to the demo's Vercel address.
6. Do **not** set Resend or VAPID secrets: no real emails or push notifications go out.

## 2. Vercel

Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (from the Demo project) and `VITE_DEMO=1`. Then deploy.
`VITE_DEMO=1` shows the "demo" banner and the quick-login buttons on the sign-in page, and switches these off:

- changing a password (key button, "forgot password" link and the `/reset-password` page);
- the Team page's add / edit / suspend / delete buttons (viewing the team and disbursing custody still work).
  Never set `VITE_DEMO=1` on a real client's deployment.

These locks live in the browser. Someone who calls the Supabase API directly with the public anon key could still change a demo password; the hourly reset undoes it within the hour.

## 3. Accounts (password for all: `Demo@2026!`)

| Role            | Email                          |
| --------------- | ------------------------------ |
| System admin    | admin@demo.test                |
| Project manager | manager@demo.test              |
| Site engineer   | eng1@demo.test, eng2@demo.test |
| Client          | client@demo.test               |

## 4. Notes

- Every hour (on the hour) all demo users are deleted and re-created, so anyone signed in at that moment is signed out and sees the seed data again. Tell prospects to expect this.
- `demo_reset()` deletes all users and data, then re-seeds. It refuses to run unless the `demo_marker` table exists, which only the demo seed creates. Never run `02-demo-seed.sql` on a real project.
- Photos uploaded by visitors stay in Storage after a reset; clear the buckets from the dashboard now and then.
- Keep-alive: the workflow in `.github/workflows/demo-keepalive.yml` pings the API daily. Add the repository secrets `DEMO_SUPABASE_URL` and `DEMO_SUPABASE_ANON_KEY`.
