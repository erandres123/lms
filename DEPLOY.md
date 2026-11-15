# Deploy

Two projects: the Next.js teacher portal on Cloudflare Pages (static export),
the NestJS API on Render. Supabase stays the only database (no database is
deployed here).

## API (Render, Docker)

`render.yaml` is a Render Blueprint. Create a Blueprint from the repo, or make a
Docker web service manually with:

- Dockerfile: `apps/api/Dockerfile`, context: repo root
- Health check: `/v1/health`
- Plan: free (sleeps after 15 idle minutes; first request afterwards is slow)

Environment:

| Key                                                    | Value                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `NODE_ENV`                                             | `production`                                                            |
| `DATABASE_URL`                                         | Supabase session-pooler URI (same value as local `apps/api/.env`)       |
| `DATABASE_SSL_CA`                                      | `certs/supabase-root-2021-ca.crt` (committed, resolved from `apps/api`) |
| `SUPABASE_URL`                                         | `https://<project-ref>.supabase.co`                                     |
| `SUPABASE_JWT_AUDIENCE`                                | `authenticated`                                                         |
| `SUPABASE_SERVICE_ROLE_KEY`                            | Supabase service role key; required for guardian account provisioning    |
| `CORS_ORIGINS`                                         | the Pages production URL, comma-separated if there are more             |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | LiveKit project (omit all three to disable live classes)                |
| `FIREBASE_SERVICE_ACCOUNT_PATH`                        | `/etc/secrets/firebase-service-account.json`                            |
| `LOG_LEVEL`                                            | `log`                                                                   |

`FIREBASE_SERVICE_ACCOUNT_PATH` points at a Render secret file. Upload the
service-account JSON under Secret Files with that exact filename; leave the
variable unset to run without push delivery. The key never goes into a public
env var or the repo.

`SUPABASE_SERVICE_ROLE_KEY` bypasses row-level security, so it belongs only in
the API host's secret env. Leave it unset to run without guardian provisioning;
the guardian account routes then return 503.

Migrations are not run at boot. Apply them from a trusted machine before the
first deploy:

```bash
pnpm --filter @lms/api db:migrate
```

Render free is the pilot arrangement. The plan's production target is a small
Hetzner box; the same Dockerfile runs there, and it avoids the free-plan sleep
between class periods.

## Web (Cloudflare Pages)

Every portal screen is a client component, so the app builds to static files
(`output: 'export'`) and needs no Node runtime. Connect the repo as a Pages
project with:

- Root directory: repository root
- Build command: `pnpm --filter @lms/shared build && pnpm --filter @lms/web build`
- Build output directory: `apps/web/out`

Pages installs with the pnpm version from `packageManager`; if the build log
reports a mismatch, set `PNPM_VERSION` to that same version in the project
environment.

Environment (public browser config, mirror `apps/web/.env.local`):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_FIREBASE_API_KEY`,
`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`,
`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`,
`NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`,
`NEXT_PUBLIC_FIREBASE_VAPID_KEY`.

These are compiled into the bundle at build time, so changing one means a
rebuild. Nothing secret belongs in them; the API URL comes from the mobile app's
`env.json`, not the portal.

`next build` emits `live-join.html`, which Pages serves at `/live-join` without
extra rules. If the portal ever moves to Firebase Hosting, add
`"cleanUrls": true` to `firebase.json` and stay under the Spark transfer cap
(360 MB/day).

After Pages assigns the domain, put that origin in the API's `CORS_ORIGINS`
and redeploy the API. Then update `apps/mobile/env.json`
(`API_BASE_URL`, `WEB_BASE_URL`) for the student app build.

## Free-tier caveats

- Cloudflare Pages free allows commercial use, meters no static requests, and
  caps builds at 500/month. That fits a school portal with room to spare.
- Firebase Hosting's Spark plan stops at 360 MB/day of transfer (about 10 GB a
  month) and does not offer App Hosting without Blaze billing, so it is the
  fallback only.
- Render free web services sleep and have 512 MB RAM / 0.1 CPU. Fine for a
  pilot demo, not for a class-period rush.
- Supabase free tier is the real limit: 500 MB database, 50k monthly active
  users. Watch `change_log` growth; sync pulls read it on every foreground.
