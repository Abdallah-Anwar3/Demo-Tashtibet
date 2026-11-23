# Tashtibet (تشطيبات)

A progressive web app for running **interior-finishing projects**, in Arabic with full RTL support. It connects the office, the people on site, and the client in one system.

**Live demo:** https://demo-tashtibet.vercel.app (fake accounts and fake data, reset nightly)

![React](https://img.shields.io/badge/React_18-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=flat-square&logo=pwa&logoColor=white)

## Three experiences, one codebase

| Role | Route | What they get |
| --- | --- | --- |
| **Admin / Project manager** | `/admin/*` | Dashboard, projects, expenses, payroll, suppliers, finance reports, audit log, team and accounts |
| **Site engineer** | `/app/*` | Mobile-first app for daily reports with photos, expenses, and attendance check-in/out |
| **Client** | `/client` | Progress, budget vs. spend, payments, daily updates, requests and stage approval |

## Features

**Project management**
- Project page with stages, progress %, budget bar, stage history, photo gallery, reports, expenses and attendance
- Timeline (Gantt-style, late items in red), inventory (in / issue / waste with low-stock alerts), and documents with before/after photos
- Quotes, bill of quantities, change orders, and subcontracts
- Budget alerts at 80% and 100%

**Field work**
- Offline-first daily reports and expenses: saved locally first, then synced when the connection returns
- Attendance with server-side time and geofence checks, so a phone clock cannot be faked

**Finance**
- Custody (petty cash) balances managed by database triggers
- Payroll calculated on the server from verified field days
- Suppliers, invoices, supplier payments, and per-project budget vs. spent vs. collected
- CSV export, printable reports, and a full JSON backup

**Client portal**
- Sees only the projects linked to their account
- Payment schedule, requests and chat with the company, 1-5 star rating of finished stages, and stage approval or change requests
- Daily update e-mails and a weekly summary report

**Platform**
- Installable PWA with Web Push notifications and a live notification bell
- Audit log for sensitive actions
- White-label ready: brand and feature plans are configured in `src/config/brand.ts` (see [WHITE_LABEL.md](WHITE_LABEL.md))

## Design decisions

- **Security lives in Postgres, not the UI.** Route guards only hide screens. Row Level Security, column grants and RPC functions decide what is allowed, and the client portal is default-deny.
- **Server-side business rules.** Attendance, payroll and custody balances are computed by the database, never trusted from the browser.
- **Offline queue with safe retries.** Dexie stores pending writes, and an `offline_id` makes uploads idempotent.
- **Private storage.** The database keeps storage paths, and the UI turns them into short-lived signed URLs.
- **Clean sign-out.** The service-worker API cache is cleared so data does not leak between users of one phone.

## Tech stack

| Layer | Tools |
| --- | --- |
| UI | React 18, TypeScript, Vite, Tailwind CSS, React Router, lucide-react |
| Data fetching | TanStack Query, Zod |
| Offline / PWA | Dexie (IndexedDB), vite-plugin-pwa, Workbox |
| Backend | Supabase: Postgres (17 SQL migrations), Auth, Storage, Realtime, Edge Functions, pg_cron |
| E-mail and push | Resend, Web Push (VAPID) |
| Hosting | Vercel |

## Project structure

```text
src/
├── pages/          # admin/, engineer/, client/ screens
├── components/     # shared UI
├── hooks/          # data and offline hooks
├── lib/            # supabase client, Dexie db, feature flags, helpers
└── config/         # brand and plan settings
supabase/
├── migrations/     # schema, RLS, triggers, RPCs, cron
└── functions/      # admin-users, send-client-update, send-push, send-weekly-report
demo/               # SQL and notes for the demo environment
docs/SETUP.md       # full setup and deployment guide
```

## Getting started

```bash
cp .env.example .env.local     # add your Supabase URL and anon key
npm install
npm run dev
```

You also need a Supabase project with the migrations applied and the Edge Functions deployed. The full step-by-step guide, including the first admin account, e-mail, push notifications and deployment, is in [docs/SETUP.md](docs/SETUP.md). To run your own demo environment, see [demo/README.md](demo/README.md).

## Author

**Abdallah Anwar**: [GitHub](https://github.com/Abdallah-Anwar3) · [LinkedIn](https://www.linkedin.com/in/abdallah-anwar0/)
