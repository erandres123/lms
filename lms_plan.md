# K-12 LMS + WebRTC SaaS — Master Development Plan (v2)

**Project root:** `D:\Tutorials\Flutter\flutterapps\lms`
**Primary market:** Philippine **private** K-12 schools (buyer, decision-maker, budget)
**Secondary market:** Public schools / division offices funded by LGU, SEF, or grants
**First tenant:** **one pilot school** (multi-tenant schema from day 1, single tenant provisioned)
**Design concurrency:** 1,500 concurrent students at scale; **build and test for 150**
**Deployment:** Hetzner Singapore (self-hosted); Supabase Cloud during dev
**Compliance:** Data Privacy Act (RA 10173), NPC issuances, DepEd curriculum/reporting requirements
**Revision:** 2026-11-11 (supersedes v1, retained as `lms_plan.v1.md`)

---

## 0. What changed from v1, and why

| v1 decision | v2 decision | Reason |
|---|---|---|
| RxDB + `rxdb-supabase` for Flutter offline | **Drift (SQLite/SQLCipher) + custom delta sync against NestJS** | RxDB is JavaScript-only (browser/Node/React Native). There is no Dart implementation; the v1 Phase 3 was unbuildable. |
| Two authorization layers (RLS + NestJS guards) both enforcing tenancy | **NestJS is the only write authority; RLS is defense-in-depth; no client touches Postgres directly** | Dual enforcement drifts silently. One authority per data path. |
| Supabase Realtime as a core dependency | **Deferred** — SSE + FCM for v1 | Removes a scaling/self-hosting dependency for a feature the pilot does not need. |
| Self-hosted Penpot, Outline, Plane, GlitchTip in Week 2 | **Deferred** — Markdown ADRs in repo, GitHub Issues, Sentry free tier / Uptime Kuma | Not product. Ops surface must fit 0.5 DevOps. |
| 48-week full-LMS plan, compliance in Phase 8 | **10-week gated pilot (attendance + gradebook + SF9/SF10 + live class + offline attendance), compliance in pilot** | Ships something sellable, retires the hardest technical risk early, and puts legal review before real student data. |
| 1,500-user infrastructure in month 2 | **Pilot infra ≈ €75–110/mo**, scale path documented | Do not pre-pay for concurrency you do not have. |
| Content library as a differentiator | **Integrate, don't produce** (DepEd LR Portal, Common Cartridge import later) | Cannot out-content Quipper. Win on operations and experience. |

---

## 1. Strategic position

### 1.1 Market reality (research summary)

- Mature incumbents exist: **Quipper** (~600 schools, 344k+ students, DepEd-aligned content), **Genyo** (Diwa, since 2004), **DepEd's own Moodle LMS**, **DOST e-TURO** (AI-enabled, piloting).
- DepEd states **schools choose their own LMS**; high-stakes content may need BCD certification. Schools using blended/online delivery submit an Omnibus Certificate of Compliance.
- Connectivity is the dominant operational constraint in public schools; teacher workload is the dominant constraint everywhere.
- Education data (grades, section, scores, discipline, portfolio media) is **sensitive personal information** under the DPA. Enrollment-type processing can rest on the school–student educational relationship; sensitive processing needs a documented, evidenceable basis. This is the single highest legal-risk assumption in the plan and gets counsel review before pilot.

### 1.2 Who buys, and what they buy

| Segment | Buyer | Budget | What they actually pay for | v2 treatment |
|---|---|---|---|---|
| **Private K-12** (primary) | School director / principal / academic head | Discretionary, fast decisions | Reporting relief for registrars, parent satisfaction, live classes without Zoom duct tape, DPA defensibility | **Pilot segment** |
| Public school / division | Division office, LGU, SEF, grant | Slow, procurement-bound | Offline resilience, SMS-first parent contact, DepEd forms | Post-pilot track (Stage 4) |

**Positioning statement:** *The school-operations layer that Philippine schools can actually run on — attendance, grades, DepEd reports, and live classes in one place, working on the connections schools really have.*

Do not sell "an LMS." Sell "your registrar's week, fixed."

### 1.3 Differentiators, ranked for v2

Only the first four matter before Stage 2. The rest are roadmap.

1. **One-click live classes with automatic roster and attendance** — your technical strength, demoable in a single meeting.
2. **DepEd-native outputs** — SF9/SF10 drafts, competency-tagged grades. Registrars feel this immediately.
3. **Offline-tolerant teacher workflow** — attendance and grades recorded without a stable connection, through the same UI.
4. **Compliance as a selling feature** — audit log, role-based access, retention policy, parent consent records. A trust signal to private-school owners.
5. (Later) Teacher-centric AI: lesson plans, quiz generation, at-risk flagging.
6. (Later) Parent engagement: proactive push + SMS.
7. (Later) Predictive analytics, micro-credentials, LOR, wikis/blogs.

---

## 2. Scope: what v1 is, and what it explicitly is not

### 2.1 In scope for the pilot tenant

- Tenant, users, roles (admin, teacher, student, parent, guardian-link), audit log.
- Sections and enrollment; roster import from CSV/XLSX export.
- Attendance: daily, per-section, bulk mark, offline-capable on teacher clients.
- Gradebook: weighted categories, manual entry, overrides, per-term final grade, competency tags on assessment items.
- **SF9 (report card) and SF10 (permanent record) draft exports** in DepEd-compatible layout — draft means "ready for registrar review," not certified.
- Live class: schedule → BBB room → signed join URL → one click → webhook records attendance/duration.
- Flutter student app: schedule, grades, attendance, join class, FCM notifications (online).
- Teacher web portal (Next.js): attendance sheet, gradebook grid, class list, live-class controls.
- Compliance pack: privacy notice, consent capture for optional processing, DPA template, retention settings, audit viewer, breach runbook.

### 2.2 Explicitly out of scope for v1

- SCORM / Common Cartridge import
- Test and quiz engine, question banks, auto-grading
- Digital portfolio (media evidence)
- Forums, wikis, blogs, group libraries
- Student-to-student or student-to-parent messaging
- Parent portal *(Stage 1 — see §7)*
- AI microservice *(Stage 2)*
- Predictive ML, micro-credentials, LOR
- SIS integration beyond CSV/XLSX import
- Self-serve multi-school onboarding
- White-label beyond design tokens
- Native offline video playback

If a request is not on the §2.1 list, it is a backlog item. This is the discipline that makes the pilot date real.

---

## 3. Architecture and technology stack

### 3.1 Shape

```
Flutter student app (offline, Drift)      Next.js teacher/admin web
        │                                          │
        └────────────── HTTPS / REST ──────────────┘
                             │
                     NestJS API (only write path)
        ┌──────────────┬─────┴──────────┬──────────────────┐
   Postgres 16    Valkey (BullMQ)   S3-compatible     Auth (JWT:
   (RLS on)                        object storage     tenant_id, role)
        │                                                  │
   BullMQ workers ── FCM push / Semaphore SMS        Supabase Auth (GoTrue)
        │
   BigBlueButton + coturn (live classes) ── webhooks ──> NestJS
```

**Rules:**

1. Every row carries `tenant_id`. Every query is tenant-scoped in NestJS; RLS policies are enabled as a second layer.
2. Clients (Flutter, Next.js) **never** write to Postgres or call Supabase table APIs directly. All mutations go through NestJS. This removes the dual-authority drift risk.
3. All timestamps are UTC in the database, rendered in Asia/Manila. School dates use the tenant's configured timezone.
4. Academic records are append-only where possible; corrections are new rows, not destructive updates.

### 3.2 Frontend

| Category | Technology | License | Notes |
|---|---|---|---|
| Student app | **Flutter (Dart)** | BSD-3 | Android-first; iOS after pilot |
| State | **Riverpod 3** + `riverpod_generator` | MIT | Compile-safe DI |
| Navigation | **GoRouter** | MIT | Deep links for FCM and class join |
| Local DB | **Drift** (SQLite ORM) | MIT | Typed local tables; sync outbox lives here |
| Local encryption | **sqlcipher_flutter_libs** | MIT | SQLCipher at rest on device |
| Connectivity | **connectivity_plus** | BSD-3 | Sync trigger, not a source of truth |
| Teacher/admin/parent web | **Next.js (TypeScript), App Router** | MIT | SSR not required; keep it a client-heavy app |
| Web server state | **TanStack Query** | MIT | Cache, retries, optimistic updates |
| Web client state | **Zustand** | MIT | Auth/tenant/session context |
| UI | **MUI (Material UI) + MUI X** | MIT (Community); Pro per-developer only if needed | Locked 2026-11-11. Gradebook needs inline edit, keyboard nav, column pinning, Excel paste, and export — MUI X DataGrid is the shortest path. Theme via CSS variables + tokens; avoid deep Material customization. |
| Flutter design system | **Material 3** + token overrides | Apache-2.0 | Per-tenant brand tokens |

### 3.3 Offline sync (replaces RxDB)

| Category | Decision | Notes |
|---|---|---|
| Primary | **Drift + custom delta sync against NestJS `/sync`** | No JS dependency; full control of conflict rules; data shapes are small |
| Transport | `GET /sync/pull?cursor=` and `POST /sync/push` (batched outbox) | Cursor is a monotonic `change_seq` per tenant; deletes are tombstones |
| Idempotency | `client_op_id` (UUIDv7) on every outbox row, unique server-side | Replay-safe after a dropped connection |
| Concurrency | Server row `version` integer; push carries `base_version`; mismatch → `409` + server state | Client resolves per entity rule below |
| Fallback engine | **PowerSync** (FSL-1.1) only if custom sync slips past a Stage 0 gate | FSL permits use inside a product; it restricts selling a competing sync service. Evaluate, do not default. |
| Explicitly rejected | **RxDB**, `rxdb-supabase` | JavaScript-only; incompatible with Flutter. Remove from all future discussion. |

**Conflict rules by entity:**

| Entity | Owner | Rule | Offline behavior |
|---|---|---|---|
| Attendance record (final) | Server (teacher command) | Server-authoritative; last accepted command wins; corrections are new rows with reason | Teacher queues marks; UI shows "pending" badge |
| Grade entry | Server | Server-authoritative; version check; teacher override recorded with actor + reason | Teacher queues entries; gradebook shows local draft state |
| Enrollment, sections, competencies | Server | Server-authoritative, read-only on device | Cached read only |
| Assignment submission draft | Client | Client-wins on draft fields; server validates on submit | Text and file references queue; **files upload only when online** |
| Notification read receipt | Client | Last-write-wins | Queue, low priority |
| Live-class state | Server | Not offline; joining requires connectivity | Blocked with clear message |

**Sync UX requirements:** visible last-synced timestamp, manual sync button, per-record pending/failed state, and a conflict screen for the rare grade/attendance rejection. No silent failures.

**Pull strategy:** on app foreground, on connectivity regain, on pull-to-refresh, and on a 5-minute timer while foregrounded. Background sync is a Stage 1 item (workmanager) — do not promise it in the pilot.

### 3.4 Backend and data

| Category | Technology | License | Notes |
|---|---|---|---|
| API | **NestJS** (Node + TypeScript) | MIT | Modules, DI, guards, interceptors |
| Validation | **Zod** | MIT | Schemas shared with Next.js; OpenAPI generated from them |
| Jobs | **BullMQ** | MIT | FCM fan-out, BBB webhook processing, report generation, retention jobs |
| Cache/queue | **Valkey** | BSD-3 | Redis-compatible |
| Primary DB | **Postgres 16** (Supabase Cloud dev → self-hosted) | PostgreSQL | RLS enabled; tenant-scoped indices |
| Auth | **Supabase Auth (GoTrue)**, JWT with `tenant_id` + `app_role` | MIT | `role` is reserved by Supabase for `authenticated`/`anon`; custom claims hook injects `tenant_id` and `app_role`. Verification via `jose` (JWKS when `SUPABASE_URL` is set, HS256 secret for local/tests). Exit path to own JWT auth documented. |
| Object storage | **S3-compatible**: Supabase Storage (dev) → Hetzner Object Storage (prod) | — | Presigned PUT/GET issued by NestJS; avoids coupling storage to Supabase |
| Push | **Firebase Cloud Messaging** | Free | Unlimited production volume |
| SMS | **Semaphore** (primary), Movider (secondary) | Paid | Critical alerts only; per-tenant budget |
| API docs | **OpenAPI** → Dart client (`openapi-generator`), TS client (`orval`) | Apache-2.0 | Generated into `packages/shared` |

Realtime is **not** a v1 dependency. Use SSE for the two places it matters (live-class roster/status, grade posted) and FCM for everything else.

### 3.5 Live classes

| Category | Technology | License | Notes |
|---|---|---|---|
| Engine | **BigBlueButton**, self-hosted | LGPL-3.0 | Breakouts, whiteboard, polling, recordings |
| Pool | **Scalelite** | LGPL-3.0 | Added when >2 concurrent classes |
| TURN | **coturn** | BSD-3 | Restrictive school networks |
| Provisioning | NestJS `MeetingsModule` → BBB API | — | Room per section-session; signed join URLs (teacher = moderator, student = viewer) |
| Attendance | BBB webhooks → NestJS → attendance record | — | Store join/leave events; never trust client-side presence |

Bandwidth policy from day one: **student cameras off, teacher video max 720p, screen share 1080p cap.** This is the single largest cost lever.

### 3.6 DevOps and operations (right-sized)

| Category | Technology | Notes |
|---|---|---|
| Hosting | **Hetzner Singapore** | CX33 app, CCX23 BBB, CX23 TURN/ops |
| Deploy | **Docker Compose + Caddy** | Add **Coolify** only when >1 environment is genuinely painful |
| CI/CD | **GitHub Actions** | Lint, test, build, deploy on tag; 2,000 min/mo free |
| Monorepo | **pnpm workspaces** (+ Turborepo when build times justify it) | `apps/api`, `apps/web`, `apps/mobile`, `packages/shared`, `services/ai` (Stage 2) |
| Errors | **Sentry free tier** → GlitchTip if volume outgrows it | SDKs identical; swap DSN |
| Uptime | **Uptime Kuma** | Self-hosted alongside ops |
| Metrics | **Prometheus + Grafana OSS** | Install with the first BBB node, not before |
| Backups | Nightly `pg_dump` to object storage + weekly restore drill | Drill is scheduled, not aspirational |
| Docs | **ADRs as Markdown in `/docs/adr`**, GitHub Issues/Projects | Penpot, Outline, Plane deferred until a team exists |
| Design | Figma free tier (or Penpot later) | Tokens exported to Material 3 + Tailwind theme |

### 3.7 Testing

| Layer | Tool | Gate |
|---|---|---|
| Flutter unit/widget | `flutter test` | ≥70% on sync, auth, gradebook clients |
| Flutter E2E | **Patrol** | Offline → reconnect → server verified |
| Web unit | **Vitest** + React Testing Library | Critical forms + permission gating |
| Web E2E | **Playwright** | Teacher attendance/gradebook/SF9 happy paths |
| API | **Vitest** + Supertest | Cross-tenant denial tests on every resource. NestJS 12 ships ESM-only, so Jest's CJS transform is out; SWC preserves decorator metadata. |
| Load | **k6** | 150 concurrent students, 3 concurrent rooms, before pilot |
| Database (local) | **embedded-postgres** (PG 17) | No Docker required; UTF-8 cluster in `.dev/pgdata` |
| Database (shared dev) | **Supabase Cloud free tier** | Managed Postgres/Auth/Storage; paid Pro once the pilot holds real data |

**Mandatory automated tests (do not negotiate these away):**

1. Tenant A cannot read or write any tenant B row, through every endpoint.
2. Parent cannot access another family's child.
3. Replaying an outbox batch twice produces one write.
4. Grade/attendance conflicts with a stale `base_version` return `409` and do not overwrite.
5. SF9 export totals equal gradebook computed totals for sampled sections.

### 3.8 Hosting topology and free-tier limits (decided 2026-11-12)

| Layer | Host | Tier | Notes |
|---|---|---|---|
| Web (Next.js) | **Cloudflare Pages** | Free | Static export of a client-heavy portal; static requests are unmetered (Functions and Workers are not). SSR on Workers has a 10 ms CPU limit on the free plan — keep the portal client-rendered. |
| API (NestJS) | **Hetzner CX33** | ~€8.50/mo | Cloudflare Workers cannot host NestJS: no long-lived processes, no BullMQ workers, no sustained Postgres pool. This piece is not free. |
| Database / Auth / Storage | **Supabase Cloud** | Free → Pro | Free tier pauses after ~7 days of inactivity; move to Pro before real student data. |
| Live classes | **Hetzner CCX23 + coturn** | ~€27–35/mo | Stage 0; Scalelite later. |
| DNS / CDN / WAF | **Cloudflare** | Free | Proxy web and API. |
| Local development | **embedded Postgres 17** | Free | `pnpm db:local`; no Docker, no system install. |
| Shared dev database | **Supabase Cloud free tier** | Free | Single source of truth for schema drift checks. |

**Rule:** Cloudflare is the edge, not the compute. Nothing that needs a background worker, a TURN/WebRTC server, or a persistent database connection runs on Cloudflare's free plan. The only unavoidable monthly costs before revenue are the API box (~€9) and the BBB node (~€30).

---

## 4. Multi-tenancy and the first school

- Schema is multi-tenant from day 1; **only one tenant is provisioned** for the pilot.
- Tenant provisioning is a **CLI script** (`pnpm provision:tenant`) plus a seed for demo data — not a UI. Self-serve onboarding is Stage 3.
- Pilot configuration lives in tenant settings: school name, logo, timezone, grading periods, grade weights, retention policy, SMS budget.
- Governance-sensitive values (retention period, weight presets, alert thresholds, AI feature flags) are **admin-editable, versioned settings** with an effective date and an audit entry — not hard-coded logic.
- Every request validates the JWT's `tenant_id` against the resource's `tenant_id` before any query. Cross-tenant denial is a tested invariant, even with one tenant in the database.
- Data residency: Singapore is acceptable with contractual safeguards; disclose it in the DPA and privacy notice. Do not claim PH-only residency.

---

## 5. Compliance workstream (parallel, starts Week 1)

This is not a late phase. Nothing real-student goes into the system until items marked **P0** are done.

| # | Item | Priority | Owner | Evidence produced |
|---|---|---|---|---|
| C1 | Designate a **Data Protection Officer** (named, contactable) | P0 | Founder | DPO designation memo |
| C2 | **Privacy Impact Assessment** for the pilot data flows | P0 | Founder + counsel | Signed PIA |
| C3 | Confirm **NPC registration** obligations for the processing system and role (PIC vs PIP) | P0 | Counsel | Registration or documented exemption |
| C4 | **Data Processing Agreement** template: school = PIC, platform = PIP; includes sub-processors (Hetzner, FCM, SMS gateway, any LLM provider) | P0 | Counsel | Signed DPA with pilot school |
| C5 | **Privacy notice** in plain language, plus an age-appropriate student-facing version | P0 | Product | Published notice + in-app link |
| C6 | **Guardian consent** flow for optional processing (media/portfolio, AI features) — separate from core educational processing | P0 | Product | Consent records with timestamp + version |
| C7 | **Retention policy** engine: configurable per tenant, versioned, with scheduled jobs and a preview of what will be deleted | P1 | Engineering | Retention settings + job logs |
| C8 | **Breach runbook**: detection → containment → NPC 72-hour notice → affected-person notice | P0 | Founder | Runbook + tabletop test |
| C9 | **Data subject requests**: access/export, correction, erasure (soft → hard after grace) | P1 | Engineering | Working export + erasure on pilot data |
| C10 | **Security measures**: encryption in transit (TLS 1.2+/HSTS), at rest (Postgres volume + SQLCipher), role-based access, audit log, rate limits, secret rotation | P0 | Engineering | Config + pen-test report |
| C11 | **DepEd assets**: confirm SF9/SF10 layout against the current official form and school registrar review | P0 | Product + school | Registrar-approved sample |
| C12 | **Curriculum alignment**: MATATAG competency codes imported and versioned | P1 | Product | Competency table seeded for pilot subjects |

Notes:

- The educational-relationship basis covers enrollment-type processing. Grades, discipline, and portfolio media are sensitive personal information and need an explicit, documented basis (legal obligation, consent, or school policy) that you can produce on request. Resolve this with counsel before building consent UX around an assumption.
- Do not put legal text placeholders in shipped UI. If a value or clause is unknown, ship without that feature rather than with invented text.

---

## 6. Stage 0 — Pilot build (10 weeks, gated)

Team assumption: 2–3 full-stack engineers + 0.5 DevOps. **Gate G0 at Week 4** and **Gate G1 at Week 10**. If G0 slips more than one week, cut scope from §2.1 (drop FCM to email) rather than extend the date.

### Week 1 — Scope lock and foundation

- [ ] Written scope per §2.1/§2.2, signed off by the pilot school.
- [ ] Audit the school's real data: roster format, grade sheets, SF9/SF10 samples, grading weights, section naming, term dates.
- [ ] Monorepo: `apps/api`, `apps/web`, `apps/mobile`, `packages/shared`; lint, format, CI on PR.
- [ ] Provision 1 Hetzner CX33; Docker Compose, Caddy, Postgres, Valkey.
- [ ] Postgres schema v1: `tenants`, `users`, `user_tenants`, `roles`, `sections`, `enrollments`, `students`, `guardians`, `guardian_links`, `attendance`, `grading_periods`, `grade_categories`, `grade_items`, `grades`, `competencies`, `sessions`, `audit_log`, `change_log` (sync cursor), `settings` (versioned).
- [ ] RLS policies drafted; trigger-based `change_log` writer.
- [ ] ADR-001 (architecture), ADR-002 (auth authority), ADR-003 (sync model).
- [ ] Sentry + Uptime Kuma wired.

### Week 2 — Auth, tenancy, roster

- [ ] Supabase Auth; custom claims (`tenant_id`, `app_role`, `school_ids`).
- [ ] NestJS `AuthModule`, `TenantModule`, `UsersModule`, `AuditInterceptor`, `RolesGuard`.
- [ ] Tenant provisioning CLI + pilot seed (real roster, demo grades).
- [ ] Roster import (CSV/XLSX) with validation report and idempotent re-import.
- [ ] Cross-tenant denial test suite green.
- [ ] Next.js login, tenant context, role-gated shell.

### Week 3–4 — The wedge: attendance + grades + SF9/SF10

- [ ] `AttendanceModule`: daily sheet, bulk mark, holiday/calendar awareness, correction-with-reason.
- [ ] `GradebookModule`: weighted categories, item CRUD, bulk entry, override with reason, term final computation (unit-tested).
- [ ] `CompetencyModule`: tag items to MATATAG codes; view mastery per student.
- [ ] SF9 and SF10 draft generators (server-side templates → XLSX/PDF) with registrar review built into the loop.
- [ ] Teacher portal: class list → attendance sheet → gradebook grid → report preview.
- [ ] **Gate G0 demo:** teacher records a real day of attendance and produces an SF9 draft the registrar accepts as a starting point.

### Week 5 — Live classes

- [ ] One BBB node (CCX23) + coturn; TLS via Caddy.
- [ ] `MeetingsModule`: create meeting on schedule, signed join URLs, tenant-scoped room names.
- [ ] BBB webhook → NestJS → attendance events + duration; retry-safe processing via BullMQ.
- [ ] Teacher "Start class"; student "Join class" (web + Flutter WebView).
- [ ] Policy enforcement: cameras off by default, 720p cap, force-start guard.
- [ ] k6 load test: 3 rooms × 50 viewers.

### Week 6–7 — Student app and notifications

- [x] Flutter scaffold: GoRouter, Riverpod, theme tokens, encrypted Drift database.
- [x] Screens: schedule, section detail, grades, attendance, join class, profile.
- [ ] Assignment/submission is **out of scope**; the pilot measures operations, not submissions.
- [ ] FCM: grade posted, absence marked, class starting in 15 minutes.
  - [x] Backend pipeline: `notifications`/`push_devices` + RLS, inbox/read endpoints, device registration, per-user dedupe, in-process dispatcher, grade/absence hooks, 15-minute class sweep to the section teacher and enrolled students. Delivery adapter stays a no-op until Firebase credentials exist.
  - [x] Flutter inbox: unread badge, pull-to-refresh, mark-read (verified in-browser against the demo tenant).
  - [x] Flutter FCM client: `firebase_core`/`firebase_messaging`, Android Gradle plugin + config, iOS plist/entitlements, token registration on sign-in and refresh, foreground inbox refresh. Server delivery still needs the service-account private key.
- [x] Deep link join flow; expired-token handling.
- [ ] Next.js: FCM web push for teachers/admins (web config and VAPID key are on file).
  - [x] Web inbox tab: list, unread filter/count, mark-one/mark-all read (verified in-browser). Push registration and service worker are not wired yet.

### Week 8 — Offline

- [x] Drift mirror tables + `change_log` pull with cursor; tombstone handling.
  - Flutter `LocalStore` (memory + SQLCipher Drift) mirror with user-scoped reset, cursor persistence, tombstone deletes; pull runner pages at 200 and dedupes in-flight runs. Unit tests cover upsert/tombstone/cursor/user switch. Server cursor paging and tombstone forwarding verified in the sync integration suite.
- [x] Outbox push with `client_op_id` idempotency and `base_version` checks.
  - `sync_operations` receipt + savepoint per operation; duplicate replay returns the stored outcome; stale `baseVersion` rolls back the whole sheet and stores the conflict. Verified against real Postgres (7/7 integration tests, 72 unit tests).
- [x] Offline attendance marking for teachers (web + mobile) with pending badges and manual sync.
  - [x] Web teacher sheet: IndexedDB outbox, localStorage roster cache, pending chips, manual/auto flush, stale-version reload. Verified in-browser as `teacher@demo.ph` with the API stopped: save queued ("1 pending", "Saved on this device…"), Sync now applied the sheet once after restart (footer "1 applied · 0 conflicts · 0 failed"); cloud held exactly 3 rows for the day.
  - [x] Mobile teacher marking (Flutter): the Attendance tab switches on the `app_role` claim in the access token (so it works offline), roster falls back to the Drift mirror, per-student status buttons + "Mark all present", a SQLCipher-Drift outbox (schema v3) that pushes the same `client_op_id`/`baseVersion` operations, queued chips, conflict list with reload, and manual Sync now. Covered by 8 outbox unit tests and 2 widget tests (offline queue, synced save pinning `baseVersion`); `flutter analyze` clean, 25/25 `flutter test`, web build compiles. Not yet exercised on a physical device or in-browser with a teacher account.
- [ ] Conflict screen for rejected attendance/grade writes.
  - [x] Attendance conflicts dialog with Reload/Discard and server-current status; server returns the conflicting record. Verified in-browser: a queued offline edit was rejected after a simulated concurrent edit (cloud v2), the dialog showed "Server now: Excused", Reload showed v2, and the cloud row was not overwritten.
- [ ] Patrol E2E: airplane mode → mark attendance → reconnect → server verified, exactly once.
  - API-level patrol verified: same `clientOpId` pushed twice yields one write, `version` stays 1, second result `duplicate/applied`. Browser pass done by stopping the API process instead of OS airplane mode (2026-11-15): queue → reconnect → single applied sheet, no duplicate student-days in cloud.
- [x] Sync telemetry: failure rate, conflicts, queue depth.
  - `GET /v1/sync/stats` (admin) aggregates applied/conflict receipts; the web outbox records attempts, applied, conflicts, failures, last-sync time, and queue depth in local storage and shows the last sync in the sheet footer.

### Week 9 — Compliance pack and pilot readiness

- [ ] Privacy notice in-app; guardian consent capture; DPA signed with the school.
  - [x] Privacy notice authoring + consent ledger. `tenant_settings` key `privacy.notice` (title/body, optimistic version, 409 on stale, audited `privacy.notice_updated`); `consent_records` pins the notice version each capture was given, append-only, audited `privacy.consent_recorded`; `GET /v1/privacy/notice` for any signed-in role, admin-only PUT + `GET /v1/privacy/consents` + `POST /v1/privacy/students/:id/consents`. Web Privacy tab: draft editor (marked "draft only" until saved), granted/withdrawn toggle, history table. Migrations 0015/0016 applied locally and to Supabase; 6/6 new integration tests, 21/21 integration overall; verified in-browser with a real admin session (notice v1 saved, consent v1 recorded, audit rows present). The saved notice body is placeholder dummy text the school must replace.
  - [x] Student-facing notice in the Flutter app: Profile → Privacy notice reads `GET /v1/privacy/notice` and renders the title, version, updated date, and body, with an explicit empty state when nothing is published. Covered by model + widget tests; `flutter analyze` clean and the web build compiles. Shows whatever the admin saved, so it currently displays the dummy text.
  - [x] Guardian self-service consent (2026-11-15): admin-configurable account mode (default `admin_created`; also `email_invite`, `magic_link`) stored as versioned `tenant_settings` key `privacy.guardian_access`, admin GET/PUT with 409 and `privacy.guardian_access_updated` audit. `GET|POST /v1/privacy/guardians` provisions the Supabase Auth account through the service-role key (one-time password returned once for admin-created; invite email; passwordless magic link), writes `users` + `user_tenants` parent role, and links `guardian_students` (migration 0017 + RLS 0018). Parents get `GET /v1/guardian/overview` and `POST /v1/guardian/students/:id/consents`, which pins the published notice version and audits `privacy.consent_recorded` with `selfService: true`. Web Privacy tab has the mode selector, create/invite form, one-time password display, and link list; Flutter adds a parent Consent screen (grant/withdraw, version visible) and an "email me a sign-in link" option. Verified by 7 new integration tests (28/28 integration), 6 new unit tests (82/82 unit), 32/32 Flutter tests, lint, and both builds. Live 2026-11-15 against Supabase: mode saved twice (v1–v3), `parent@demo.ph` created and linked to Ana Cruz, parent JWT carried `app_role=parent` + tenant, overview listed the child, and consent was recorded against notice v1 and read back immediately.
  - [ ] Still open: real privacy notice text (dummy saved), guardian self-service consent wording approved by the school, the signed DPA, and teacher training delivery. These need the school's legal text and sign-off.
- [x] Audit log viewer (admin) with filters: actor, entity, action, date.
  - `GET /v1/audit` (admin) filters actor/action/entity/entityId/from/to with keyset pagination; web "Audit" tab. Integration-tested and browser-checked with a real admin session.
- [x] Retention settings UI + nightly job (dry-run mode for pilot).
  - Versioned `tenant_settings` row (`retention.policy`) holds admin-entered day windows for read notifications, stale push devices, processed meeting events, and sync receipts; blank means keep forever, and academic records are never in scope. `GET|PUT /v1/retention` (admin, optimistic version, 409 on stale) and `POST /v1/retention/dry-run`; a scheduler runs once per tenant-local day at the configured hour and writes a `retention_runs` ledger plus `retention.policy_updated` / `retention.dry_run` audit entries. Nothing is deleted yet; the retention integration suite proves counts, no-delete, tenant isolation, and once-per-day scheduling.
  - Pilot values saved in-browser 2026-11-15 as policy version 2: read notifications 90 days, stale push devices 60, processed meeting events 180, sync receipts 30, nightly run 02:00 tenant time. Dry run then showed all four categories enabled with cutoffs 2026-08-17 / 09-16 / 05-19 / 10-16 and 0 rows would be removed; both `retention.policy_updated` (version 2, previous values null) and `retention.dry_run` appear in the Audit tab.
- [x] DSAR export for one test student; erasure dry-run.
  - `GET /v1/privacy/students/:id/export` and `.../erasure-dry-run` (admin, audited); export omits push tokens, dry-run is read-only and flags academic-retention and Supabase-Auth out-of-scope. Web "Privacy" tab, integration-tested and browser-checked.
- [x] Backup + restore drill executed and timed.
  - No `pg_dump`/Docker/WSL on this machine, so the drill uses the project's own restore path: schema rebuilt from the 14 Drizzle migrations, data captured as a repeatable-read JSON snapshot of all 22 public tables. Measured 2026-11-15: snapshot 2.2 s / 52.9 KiB, schema migrate 1.4 s, data load 37 ms, total restore-ready 1.5 s. Verification: 0 row/hash mismatches across all 22 tables (UTC-normalized), 22/22 RLS tables and 77 policies present, and the API booted against the restored database returning 200 for `/v1/me`, `/v1/audit`, and `/v1/retention` with a real admin session. Repeatable with `pnpm --filter @lms/api backup:drill`. Not a substitute for platform backups: enable Supabase daily backups/PITR before real student data.
- [ ] Teacher training session (90 minutes) + one-page cheat sheet.
  - [x] Pack drafted 2026-11-15 at `docs/teacher-training-pack.md`: 90-minute agenda, admin pre-work, offline attendance and conflict exercise, grade/live/privacy talking points, printable cheat sheet, support table template, and a training sign-off grid. The support contacts, notice text, and session date still need the school.
- [ ] Support channel: dedicated group chat, named responder, P1 phone number.

### Week 10 — Pilot live and measurement

- [ ] Real classes, real attendance, real grades for 1–3 sections (~150 students).
- [ ] Daily check-in with the school's champion teacher.
- [ ] Metrics captured per §9.
- [ ] **Gate G1:** go/no-go on Stage 1.

### Gate G0 (Week 4) pass criteria

Teacher can, unaided: mark a full day of attendance, enter a week of grades, and produce an SF9 draft. Cross-tenant tests pass. Audit log records the actions.

### Gate G1 (Week 10) pass criteria

- One full month (or four consecutive weeks) of real operation with no P1 incident.
- Attendance recorded in **< 3 minutes** for a 40-student section.
- Offline→online sync failure rate **< 1%**; zero duplicate attendance rows.
- Live classes join success **≥ 95%**, p95 join **< 15s**.
- Teacher weekly active rate **≥ 80%** of pilot teachers.
- School agrees to a paid continuation term.

If G1 fails on adoption (not reliability), do not build more features. Fix the workflow or change the school. More features do not fix a product nobody opens.

---

## 7. Stage 1–4 — After the pilot gate

Durations assume the pilot team stays intact; with 2 engineers instead of 3, add ~40%.

### Stage 1 — Complete the academic core (Weeks 11–22)

- Parent portal: child switcher, grades, attendance, upcoming classes, announcements; RLS-enforced family scoping.
- Proactive notifications: grade posted, absence, class in 15 minutes; SMS fallback for critical alerts with per-tenant budget.
- Announcements and teacher→parent threaded messages (audited; no student-to-student messaging).
- Test/quiz engine: MCQ, true/false, short answer; question bank; randomization; auto-grade; manual essay queue.
- Rubric-based grading; bulk gradebook actions; CSV export.
- Portfolio evidence (photo, audio, short video) with consent gating.
- Background sync (workmanager) and richer conflict UI.
- Multi-section and co-teacher support; substitute teacher.

**Gate G2:** a second paying school onboards with ≤2 days of assisted setup.

### Stage 2 — Differentiate (Weeks 23–36)

- AI microservice (FastAPI, internal-only): lesson-plan generation from a MATATAG competency, quiz generation from a competency, both cached and rate-limited per tenant with a monthly token budget.
- At-risk rules v1 (attendance < 80%, ≥2 missing items, grade drop > 20 points) surfaced to teachers with suggested interventions. Rule-based first; ML only with enough data.
- Competency mastery reports; class and section analytics.
- Content import: Common Cartridge first, then SCORM 1.2/2004. DepEd LR Portal import is a manual/assisted process unless an official feed is confirmed — do not promise an API.
- Attendance analytics and parent engagement reporting.

### Stage 3 — Scale, self-host, multi-school (Weeks 37–52)

- Self-host Supabase/Postgres stack on Hetzner; validate RLS, storage, auth, backups.
- BBB pool: Scalelite + 3–5 CCX33 nodes; 12-node scale path; egress budget alerts.
- Penetration test and remediation.
- Automated DSAR/erasure, retention execution with legal hold, audit export for NPC requests.
- Self-serve tenant onboarding; billing; per-school usage dashboards.
- SIS integration: CSV first, then a real API for the SIS vendors your schools actually use.
- White-label branding per tenant.

### Stage 4 — Public-school track (Weeks 53+)

- Offline depth: low-end Android profiles, 2G-tolerant payloads, pre-downloaded lesson packs, storage-pressure handling.
- SMS-centric parent engagement (assume no smartphone).
- Division-level dashboards and reporting; grant/LGU procurement pack.
- Optional on-premise or division-hosted deployment for data-governance-sensitive divisions.
- DepEd Omnibus Certificate of Compliance support pack for adopter schools.

---

## 8. Cost model

### 8.1 Pilot (one school, ~150 students)

| Item | Spec | Monthly (approx.) |
|---|---|---|
| App + API + web + Postgres + Valkey | 1× CX33 | ~€8.50 |
| Live classes | 1× CCX23 (4 dedicated vCPU / 16 GB) | ~€27–35 |
| TURN + ops | 1× CX23 | ~€6 |
| Object storage | ~200 GB | ~€5 |
| Egress (cameras off, teacher 720p) | ~1–2 TB | €10–30 |
| SMS | ~1,000 critical alerts | ~₱1,000 (~€16) |
| Error/uptime monitoring | self-hosted / free tier | €0 |
| **Total** | | **≈ €75–110 / month** + SMS |

### 8.2 Scale path

| Level | Shape | Monthly (approx.) |
|---|---|---|
| 2–3 schools (~600 students) | CX43 app, 2× CCX33 BBB, CX23 TURN | ~€150–250 |
| 1,500 concurrent design target | 5–12× CCX33 + Scalelite + egress | ~€1,600–2,800 |

The 1,500-concurrent figure is a design target, not a forecast. Re-forecast after the pilot with real concurrency and egress data.

### 8.3 Pricing to validate in the pilot

- Private school base subscription: **₱18,000–₱35,000/month** depending on student count (≤300 / ≤1,000), live classes included.
- One-time onboarding and data migration: **₱20,000–₱30,000**.
- Public school: annual per-student license funded by LGU/SEF/grant, with an offline-first tier.
- Target gross margin ≥ 70% at one school. If the pilot cannot cover ~€110/month plus support, the pricing model is wrong, not the platform.

These are hypotheses. Replace them with what the pilot school actually agrees to pay.

---

## 9. Success metrics (pilot)

| Area | Metric | Target |
|---|---|---|
| Teacher adoption | Weekly active teachers | ≥ 80% |
| Teacher time | Attendance for 40 students | < 3 min |
| Teacher time | SF9 draft generation | < 1 min per student |
| Reliability | API p95 (reads / writes) | < 400 ms / < 800 ms |
| Offline | Sync failure rate | < 1% |
| Offline | Duplicate writes on replay | 0 |
| Live class | Join success / p95 join | ≥ 95% / < 15 s |
| Live class | Mid-class drop rate | < 5% |
| Notifications | Delivered / opened (push) | ≥ 95% / measured baseline |
| Support | P1 incidents | 0 |
| Commercial | Paid continuation signed | Yes |

Instrument all of these from Week 3. A metric you cannot see at G1 is a metric you cannot claim.

---

## 10. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Legal basis for sensitive processing is wrong or undocumented | Pilot shutdown, regulator exposure | C1–C4 before real data; counsel review; PIA is a gate |
| School's real data is messier than expected (roster, grade weights, form versions) | Rework, date slip | Week-1 data audit with actual files; registrar reviews SF9 output weekly |
| Custom sync is harder than estimated | Offline differentiator slips | Sync spike in Week 1 on two entity types; PowerSync fallback with a decision date at G0 |
| Teacher adoption stalls | No renewal | One named champion teacher; training; measure weekly active; cut features before adding |
| BBB capacity/egress blowout | Cost, class disruption | Cameras off, 720p cap, one node until 2+ concurrent classes, Grafana egress alert |
| Single-VPS failure takes down the pilot | Reputation | Nightly dumps to object storage, restore drill, documented 8h RTO |
| Scope creep from the school ("can it also do X?") | Date slip | §2.2 as a written contract; backlog everything else; monthly scope review |
| Supabase self-host migration breaks RLS/auth | Stage 3 delay | Keep DB access behind NestJS; storage on S3 API; migration rehearsed on staging |
| DepEd form/layout changes | Wrong reports | Versioned report templates; registrar sign-off per term |
| Team bandwidth | Everything | Stage gates; add 40% duration for a 2-person team; no parallel Stage 1+2 work |

---

## 11. Open decisions (resolve before Week 3)

1. **Pricing confirmation** — pilot school's agreed amount and contract length.
2. **Counsel engagement** — who reviews C2/C3/C4, and by when.
3. ~~**UI framework lock** — MUI vs shadcn/ui~~ **Decided 2026-11-11: MUI v8 + MUI X Community.** Rationale: the product's core screen is a dense, spreadsheet-like gradebook; MUI X DataGrid provides inline editing, keyboard navigation, and export out of the box, which shadcn/ui would require assembling from TanStack Table. "Modern look" was the only shadcn advantage and it is addressed with a custom theme. Budget MUI X Pro (~per developer) only if the gradebook needs Excel paste, column pinning, or aggregation the Community grid lacks; otherwise build that one grid on TanStack Table.
4. **Sync fallback trigger** — the exact slip condition that switches to PowerSync.
5. **SF9/SF10 source of truth** — which official form revision the registrar uses.
6. **SMS provider contract** — Semaphore vs Movider, sender ID registration lead time.
7. **Pilot success owner** — the named person inside the school accountable for adoption.

---

## 12. Non-negotiables

- No real student data before C1–C6 are complete.
- No client writes directly to Postgres; NestJS is the only write path.
- No feature ships without a cross-tenant denial test.
- No offline feature ships without a replay-idempotency test.
- No governance rule is hard-coded; retention, weights, and thresholds are versioned tenant settings.
- No invented legal text, placeholder clauses, or fabricated compliance claims in shipped UI.
- No scope outside §2.1 until G1 passes.

---

*v2 — revised 2026-11-11. Supersedes the v1 48-week plan, which is archived as `lms_plan.v1.md`. v1 research on market, competitors, and DPA requirements is retained in summary form in §1 and §5.*
