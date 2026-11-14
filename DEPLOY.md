# Deploy

Two projects: the Next.js teacher portal on Vercel, the NestJS API on Render.
Supabase stays the only database (no database is deployed here).

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
| `CORS_ORIGINS`                                         | the Vercel production URL, comma-separated if there are more            |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | LiveKit project (omit all three to disable live classes)                |
| `FIREBASE_SERVICE_ACCOUNT_PATH`                        | `/etc/secrets/firebase-service-account.json`                            |
| `LOG_LEVEL`                                            | `log`                                                                   |

`FIREBASE_SERVICE_ACCOUNT_PATH` points at a Render secret file. Upload the
service-account JSON under Secret Files with that exact filename; leave the
variable unset to run without push delivery. The key never goes into a public
env var or the repo.

Migrations are not run at boot. Apply them from a trusted machine before the
first deploy:

```bash
pnpm --filter @lms/api db:migrate
```

## Web (Vercel)

Import the repo as a Vercel project with:

- Root Directory: `apps/web`
- Framework: Next.js (`apps/web/vercel.json` supplies the shared-package build
  step so `@lms/shared` is compiled before `next build`)

Environment (public browser config, mirror `apps/web/.env.local`):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_FIREBASE_API_KEY`,
`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`,
`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`,
`NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`,
`NEXT_PUBLIC_FIREBASE_VAPID_KEY`.

After Vercel assigns the domain, put that origin in the API's `CORS_ORIGINS`
and redeploy the API. Then update `apps/mobile/env.json`
(`API_BASE_URL`, `WEB_BASE_URL`) for the student app build.

## Free-tier caveats

- Vercel Hobby is for non-commercial use. Running the pilot for a paying school
  needs Vercel Pro (or another host) before invoicing.
- Render free web services sleep and have 512 MB RAM / 0.1 CPU. Fine for a
  pilot demo, not for a class-period rush.
- Supabase free tier is the real limit: 500 MB database, 50k monthly active
  users. Watch `change_log` growth; sync pulls read it on every foreground.
