# Tashtibet PWA

Arabic (RTL) site-management app for an interior finishing company.
React + Vite + TypeScript, Tailwind, TanStack Query, Dexie (offline), Supabase (Postgres, Auth, Storage, Realtime).

Two experiences share one codebase:

- `/admin/*` Management dashboard (admin and project manager).
- `/app/*` Mobile-first field app for site engineers.

## 1. Supabase

1. Create a project at supabase.com.
2. SQL Editor: run these files **in order**
   `supabase/migrations/001_schema.sql` → `002_admin_security.sql` → `003_server_side_rules.sql` → `004_features_and_hardening.sql` → `005_client_portal.sql` → `006_client_extras.sql` → `007_weekly_report_cron.sql` (edit the project ref inside 007 first).
3. Deploy the account-management function (needs the Supabase CLI):
   ```
   supabase login
   supabase link --project-ref <your-ref>
   supabase functions deploy admin-users
   supabase functions deploy send-client-update
   supabase functions deploy send-weekly-report --no-verify-jwt
   ```
4. Create the **first admin** (one time only). Authentication → Users → Add user (tick "Auto confirm"), copy its UUID, then in the SQL Editor:
   ```sql
   insert into public.profiles (id, full_name, role) values ('<UUID>', 'اسم المدير', 'admin');
   ```
   After that, the admin creates every other account from the **الفريق والحسابات** page.
5. Project Settings → API: copy the URL and the anon/publishable key.
6. **Authentication → URL Configuration**: set _Site URL_ to your deployed address and add `https://<your-domain>/reset-password` to _Redirect URLs_ (needed for "forgot password" e-mails).
7. **Authentication → Providers → Email → Password security**: enable _Leaked password protection_ (dashboard setting; the advisor flags it until you do).

## 2. Run locally

```
cp .env.example .env.local     # fill in the two values
npm install
npm run dev
```

PWA icons are in `public/icons`. The service worker is active in `npm run build && npm run preview`.

## 3. Deploy (free tier is enough to start)

Vercel: import the repo, framework preset **Vite**, add the same two `VITE_*` variables, deploy.
Add a `vercel.json` rewrite if you see 404 on page refresh:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

## Client portal (role `client`)

- Login tab «عميل» → `/client`. A client sees only the projects linked to the account (admin links them in **الفريق والحسابات**).
- Client sees: progress %, stage, approved spend vs budget by category, and the daily updates a manager **publishes** (project page → tab «تقرير العميل»). Raw engineer reports, issues, salaries, wallets and other projects are never exposed (RLS default-deny + the `client_dashboard()` function).
- Daily e-mail: Edge Function `send-client-update` via [Resend](https://resend.com). Set secrets in Supabase (Edge Functions → Secrets): `RESEND_API_KEY`, `MAIL_FROM` (e.g. `Company <updates@yourdomain.com>`, a verified domain), `APP_URL` (your site URL). Without them publishing still works, only the e-mail step reports "not configured".

### Client extras

- **Payments**: admin defines the payment schedule per project and marks payments paid; the client sees total / paid / remaining / next due.
- **Requests**: the client sends notes, complaints or change requests and chats with the company; managers get a notification and reply from the project page (tab «طلبات وتقييم العميل»).
- **Stage rating**: the client rates each _finished_ stage 1-5 (enforced in the database); a rating of 1-2 notifies managers.
- **Weekly report**: every Thursday (pg_cron, migration 007) each client gets one summary e-mail; it is idempotent per client per week. In the portal, «تقرير PDF» opens a printable report (browser Print → Save as PDF).

## Features added in the second pass

- Forgot / change password (`/reset-password`, key button in the header or sidebar).
- Project page `/admin/projects/:id`: stages, manual progress %, budget bar, stage history, photo gallery with download, reports, expenses, attendance.
- Progress % can also be set by the engineer in the daily report (updates the project).
- Budget alerts at 80% and 100% (notification to admins and project managers).
- Notification bell (live via Realtime) + browser notifications while the app is open.
- Audit log (admin only): expense decisions, payroll, projects, custody, accounts.
- Server-side pagination and search on expenses; filters and "load more" on reports.

## Third pass: phone notifications, stage approval, budget alerts (migration 008)

- **Web Push** (free): the bell menu has «تفعيل الإشعارات على هذا الجهاز». Every row inserted into `notifications` is pushed by the `send-push` Edge Function.
  1. Generate keys once: `node scripts/gen-vapid.mjs` (or `npx web-push generate-vapid-keys`).
  2. Vercel → Environment Variables: `VITE_VAPID_PUBLIC_KEY` = public key, then redeploy.
  3. Supabase → Edge Functions → Secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (e.g. `mailto:you@example.com`).
  4. `supabase functions deploy send-push --no-verify-jwt` (already deployed if you used the assistant).
  - iPhone: works only after «إضافة إلى الشاشة الرئيسية» and opening the installed app.
- **Client stage approval**: finished stages show «اعتماد / طلب تعديل» in the client portal. Records are append-only; a change request opens a request thread for the managers.
- **Budget alerts** (80% / 100%) existed since migration 004; they now also arrive as phone notifications.
- Clients are notified when a daily update is published, and when a manager replies to a request.

## Design decisions worth knowing

- **Security lives in Postgres, not the UI.** Route guards only hide screens. Row Level Security, column grants and RPCs decide what is allowed.
- **Attendance uses server RPCs** (`check_in`, `check_out`): time and geofence are computed on the server, so a phone clock or fake flag cannot inflate payroll. For that reason attendance needs a connection; reports and expenses work offline.
- **Offline queue** (Dexie): reports and expenses are always saved locally first, then uploaded. `offline_id` makes retries safe.
- **Custody balance** is changed only by database triggers. A rejected expense returns the money.
- **Payroll** allowance = verified field days × the engineer's daily rate, calculated by `calculate_payroll()`. Re-running only touches drafts.
- **Private buckets**: the DB stores storage paths; the UI turns them into short-lived signed URLs.
- Sign-out clears the service-worker API cache so data does not leak between users of one phone.

## Fourth pass: schedule, inventory, suppliers, finance, documents (migrations 009 + 010)

All free (no extra service). Every module can be switched off in `src/lib/features.ts` (set the flag to `false`: menus, tabs and routes disappear, nothing else changes).

| Flag        | What it adds                                                                                                                                          | Where                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `schedule`  | Project timeline (Gantt bars, late = red); managers get a daily notification for milestones past their end date; the client sees a read-only timeline | project page → «الجدول الزمني», client home |
| `inventory` | Materials per project: in / issue / waste, balance, low-stock alert, blocks issuing more than the balance                                             | project page → «المخزون»                    |
| `suppliers` | Suppliers, rating, invoices and what is still owed                                                                                                    | sidebar → «الموردون»                        |
| `finance`   | Per-project budget vs spent vs collected vs owed, CSV export, print, and a full JSON backup of all tables                                             | sidebar → «التقارير المالية»                |
| `contact`   | «تواصل عبر واتساب» button for the client (first assigned engineer who has a phone number in his profile)                                              | client home                                 |
| `documents` | Documents (contracts, drawings) and before/after photos, hide/show per file; private bucket `project-docs` (10 MB per file)                           | project page → «المستندات», client home     |

Not built: English interface (every screen would change; do it as a separate task), engineer performance dashboard.

### What would need a paid plan (none of it is required)

- **E-mail to real clients**: a verified domain in Resend (about 10 USD per year). Without it the e-mails only reach the Resend account owner.
- **Automatic daily database backups / point-in-time recovery**: Supabase Pro (25 USD per month). The free alternative is the JSON backup button in «التقارير المالية» (run it weekly).
- **Vercel Hobby** is for non-commercial use; a company site officially needs Vercel Pro (20 USD per month per member).
- **Supabase Free** pauses a project after 7 days without any request; opening the site once a week avoids it, Pro removes the limit.
