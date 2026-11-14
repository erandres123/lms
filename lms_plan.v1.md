# K-12 LMS + WebRTC SaaS — Master Development Plan

**Project root:** `D:\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\Tutorials\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\Flutter\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\flutterapps\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\lms`
**Target market:** Philippine K-12 schools (DepEd / MATATAG aligned)
**Peak concurrency target:** 1,500 concurrent students (design), scalable to multi-school SaaS
**Deployment:** Hetzner Singapore (self-hosted), Supabase (managed during dev → self-hosted later)
**Compliance:** Data Privacy Act (RA 10173) + NPC education-sector guidance



Core Academic Workflow

This is the instructional engine of the platform. It handles the day-to-day mechanics of running a class.



Course \& Content Delivery: Teachers must be able to author, organize, and deliver learning materials. This includes uploading files (PDFs, slides, documents), embedding multimedia (videos, interactive content), and structuring content into logical units or learning paths. The system should support importing standardized content packages like SCORM or Common Cartridge, which is essential for using third-party eLearning content.



Assignment Management: This module allows teachers to create, distribute, and collect assignments digitally. It includes electronic submission (file upload, text entry), deadline management, and the ability for students to see their pending work.



Gradebook: A K-12 gradebook is more than a simple list of scores. It must support weighted grading schemes, rubric-based assessment, and the ability to calculate and override final grades. It should provide a clear, real-time view of a student's academic standing for both the teacher and the student.



Attendance Tracking: Teachers need to record daily attendance (present, absent, late) directly within the LMS. This data should be visible to administrators and, ideally, synced to a separate Student Information System (SIS) if one is used.



💬 Classroom Collaboration \& Communication

A K-12 LMS must facilitate structured, safe interaction that extends beyond the physical classroom.



Synchronous (Live) Learning: As you are already planning, this is the WebRTC layer. An LMS should either integrate with a dedicated video platform (like Jitsi or BigBlueButton) or provide built-in live class tools including video conferencing, breakout rooms, screen sharing, and an interactive whiteboard.



Asynchronous Discussion \& Messaging: Secure, moderated communication is critical. This includes class forums for Q\&A (where teachers or peers can answer questions) and a messaging system with role-based restrictions—for example, limiting student-to-student private messaging or allowing teacher-to-parent direct messages.



Group Collaboration: Tools for structured group work, such as wikis for collaborative knowledge building, blogs for reflection, and group file libraries.



📝 Assessment \& Evaluation

Assessment in K-12 is continuous and varied, requiring tools that go beyond simple multiple-choice quizzes.



Test \& Quiz Engine: A robust system for creating online assessments with a wide variety of question types (multiple choice, true/false, short answer, essay). Features should include question banks, randomization, auto-grading for objective questions, and the ability to provide detailed feedback.



Formative \& Portfolio Assessment: Particularly for elementary levels, assessment is often evidence-based. The LMS should allow students to submit audio recordings, drawings, photos, and videos as evidence of learning, creating a digital portfolio that tracks progress over time.



Standards \& Competency Alignment: This is a non-negotiable feature for K-12. The LMS must allow teachers and administrators to tag assessments and learning activities to specific curriculum standards or competencies (such as DepEd's MATATAG curriculum). This enables reporting on mastery of specific skills, not just overall grades.



👥 Stakeholder Portals (Role-Based Access)

A defining feature of a K-12 LMS is that it serves multiple distinct user groups, each with a dedicated, permission-controlled view of the system.



Student Portal: A personalized dashboard where students see their courses, upcoming assignments, grades, attendance, and a calendar of events. They submit work and participate in discussions through this portal.



Teacher Portal: The command center for instructors. It provides tools for course creation, grading, attendance taking, communicating with students and parents, and accessing analytics on class and individual student performance.



Parent Portal: This is a critical, K-12-specific module. Parents need a dedicated login to view their child's grades, attendance records, upcoming assignments, and school announcements. It should also facilitate direct, documented communication with teachers. Some systems allow a single parent account to view multiple children.



Administrator Portal: Provides school or district leaders with system-wide visibility. Key functions include managing user accounts and roles, viewing analytics on course engagement and student performance across the institution, and generating compliance reports.



📚 Curriculum \& Content Management

This layer ensures that what is being taught is aligned with official standards and that high-quality resources are readily available.



Curriculum Alignment: The ability to map courses, units, and assessments to an official curriculum framework. In the Philippine context, this means alignment with the DepEd K-12 curriculum and the MATATAG agenda.



Content Library \& Repository: A built-in or integrated library of curriculum-aligned lessons, activities, video tutorials, and assessment items. This saves teachers time by providing ready-to-use, quality-assured materials that are mapped to specific learning competencies.



Learning Object Repository (LOR): A more advanced feature for sharing and reusing learning objects (individual pieces of content) across courses, teachers, or even schools within a district, with metadata tagging for easy discovery.



🔗 Integration, Compliance \& Reporting

A K-12 LMS does not exist in isolation. It must connect securely with other systems and meet strict regulatory standards.



Student Information System (SIS) Integration: The LMS must be able to sync rosters, grades, and attendance data with a separate SIS. This prevents teachers from having to manually enter the same data in two places and ensures that administrative records are always up to date.



Data Privacy \& Safeguarding: Because the platform serves minors, it must be configured for strict data privacy compliance (such as FERPA/COPPA equivalents or local data protection laws). This includes age-appropriate UX, verified parental consent mechanisms where required, and robust role-based access controls to protect student data.



Reporting \& Analytics: The system must generate custom reports on attendance, behavior, homework completion, and academic progress. These reports are needed for teachers to inform instruction, for parents to stay engaged, and for administrators to meet regulatory reporting requirements.



💎 Summary for Your SaaS Build

For your custom-built platform, this breakdown clarifies the scope. You are already building the SIS/scheduling layer (class schedules, notifications) and integrating the synchronous learning layer (WebRTC). The remaining core modules you must ensure are present—either built natively or integrated—are the Gradebook, Assignment Management, Attendance, Parent Portal, and Standards/Competency Alignment. The strength of a K-12 LMS lies not in any single feature, but in how seamlessly these modules work together to give teachers, students, and parents a single, coherent view of the learning journey.



Is there already an existing, decent, and complete k-12 platform in the Philippines? can we develop this from scratch under strict compliance to DPA and other legalities under Philippine K-12 Educational System?

The user is asking two questions: (1) Are there existing, decent, and complete K-12 platforms in the Philippines? (2) Can they develop one from scratch under strict compliance with the Data Privacy Act (DPA) and other legalities of the Philippine K-12 educational system? I need to search for existing platforms and legal compliance requirements. I will use the search tool with multiple queries.



Found 50 web pages

The search results provide some information. I need to open some of these results to get more details.



Read 5 pages

Quipper Philippines | LMS \& Digital Learning for Schools

DOST-CAR Turns Over e-TURO Digital Learning System to Two Tabuk City Schools

DepEd LMS - Region V

Data Privacy Council Education Sector

\*\*PRIVACY POLICY OFFICE\*\*

The search results provide information on existing platforms and legal compliance. I need to synthesize this information to answer the user's two questions.



Yes, there are existing, complete K-12 platforms in the Philippines, and it is entirely possible to develop your own from scratch under strict compliance with the Data Privacy Act (DPA) and DepEd regulations. The choice comes down to a fundamental trade-off between speed-to-market with existing commercial solutions versus full control and customization with a custom build.



🏫 The Existing Landscape: Established Platforms in the Philippines

Several mature platforms already serve the Philippine K-12 market, meaning you would not be entering an empty field. These range from comprehensive commercial suites to government-backed initiatives.



Quipper: A major commercial player, describing itself as a complete e-learning solution from Kinder to Tertiary. It is trusted by over 600 schools and 344,000+ students, offering DepEd-aligned content, AI-powered learning tools, and a dedicated implementation team. It is a strong benchmark for a full-featured, curriculum-aligned platform.



Genyo e-Learning: Developed by Diwa Learning Systems, this platform has been active since 2004 and provides digital resources for Grades 1-10 across five core subjects, supporting blended and online learning.



DepEd's Own LMS: The Department of Education itself operates a Moodle-based LMS for its regions and professional development, indicating a clear institutional preference for open-source, configurable systems.



e-TURO: A DOST-supported, AI-enabled LMS with a comprehensive content library, currently being piloted in specific schools (e.g., in Tabuk City) for a 12-month period. This shows active government investment in new, locally-developed solutions.



Open-Source Foundations: Platforms like Canvas are used by individual schools (e.g., De La Salle Santiago Zobel) and Moodle is the engine for DepEd's official LMS, proving that global open-source tools can be successfully deployed in the Philippine context.



The existence of these platforms validates the market need. Your opportunity lies in differentiating your offering—perhaps through superior WebRTC integration, a more modern UI/UX, or a more flexible multi-tenant architecture for schools.



⚖️ Developing from Scratch: A Path of Control and Compliance

Developing a platform from scratch is a significant undertaking, but it is the path you are already on. The primary challenge is not just building features, but architecting the system for legal compliance from day one.



The Core Legal Framework: The Data Privacy Act (DPA)

The DPA (Republic Act No. 10173) is the primary law governing data privacy in the Philippines. For an educational platform, compliance is non-negotiable. The National Privacy Commission (NPC) has issued specific guidance for the education sector.



Education Data is "Sensitive": Information about a student's education (e.g., grades, test scores, section) is classified as sensitive personal information. Processing this data is generally prohibited unless a specific lawful basis exists.



The "Educational Framework" as a Lawful Basis: The NPC recognizes the contract between the school and the student (the "educational framework") as a valid lawful basis for processing data necessary to deliver education. This is a critical legal foundation for your platform's data processing activities.



Key Compliance Requirements:



Transparency: You must provide clear, concise privacy notices explaining what data is collected and why.



Legitimate Purpose \& Proportionality: Data collection must be necessary for educational purposes and not excessive.



Consent: Where the educational framework does not provide a basis, explicit consent may be required, especially for sensitive data. Consent must be specific and evidenced.



Security Measures: You must implement "adequate data protection features," which includes technical safeguards like encryption, access controls, and audit logs.



Breach Reporting: You are required to notify the NPC and affected individuals in the event of a data breach.



DepEd's Regulatory Landscape

Beyond the DPA, DepEd has its own requirements. While it may not "approve" a specific platform, it sets standards for what schools can adopt.



Curriculum Alignment: For content to be truly useful, it should be aligned with the DepEd K-12 curriculum. For high-stakes materials, certification from the DepEd-Bureau of Curriculum Development (BCD) may be required.



School-Level Autonomy: DepEd guidelines state that "Schools shall determine the appropriateness of learning management system," giving individual schools the autonomy to choose platforms that meet their needs, provided they meet minimum requirements.



Compliance Certificate: Schools using blended or online learning may be required to submit an Omnibus Certificate of Compliance to DepEd, confirming they meet minimum standards, which includes having an appropriate LMS.



💎 Strategic Recommendation: Build, But Build Smart

Given your existing work on a custom LMS with Supabase and Flutter, and your plan to integrate a powerful WebRTC layer, developing from scratch is a viable and strategic path, provided you approach it with a "compliance-first" mindset.



Treat Compliance as a Core Feature: Do not bolt it on later. Design your Supabase database schema and backend APIs with data minimization, role-based access control, and audit logging from the start. Your architecture is your first line of defense for DPA compliance.



Leverage the "Educational Framework": Your platform's legal terms and privacy policy should clearly establish the school-student educational contract as the basis for processing necessary data. This provides a solid legal footing for core LMS functions.



Differentiate on Integration and Experience: The existing platforms are strong, but your deep integration of WebRTC (BigBlueButton/Jitsi) with a modern Flutter front-end and a flexible Supabase backend is your key differentiator. You can offer schools a more seamless, unified experience than cobbling together separate tools.



Plan for a Pilot: Follow the model of e-TURO. Partner with a willing school or a specific division for a pilot deployment. This allows you to test your platform in a real-world regulatory and operational environment, gather feedback, and refine your compliance posture before a full-scale launch.



Developing a K-12 platform from scratch in the Philippines is a complex but achievable goal. The existing market proves the demand, and the legal framework, while strict, provides clear pathways for a well-architected system to operate lawfully. Your focus on a custom-built, integrated solution positions you to offer a level of control and user experience that off-the-shelf platforms may struggle to match.



how do we come up at par or even more to the top tier platforms that differentiate us even better?

To not just compete with, but leapfrog top-tier platforms like Quipper, you don't need to rebuild their entire feature set. The research reveals clear, documented pain points that existing solutions have not solved—and these gaps are your greatest strategic advantage. Your opportunity lies in building a platform that is resilient where they are fragile, intelligent where they are manual, and deeply integrated where they are fragmented.



🎯 Your Strategic Blueprint: 7 Differentiators That Matter

Here is how you can position your Flutter + Supabase + WebRTC platform to surpass the competition, based on the specific weaknesses identified in the current market.



Differentiator	The Market Gap (Evidence from Research)	Your Strategic Advantage

1\. True Offline-First Resilience	Connectivity is a "major barrier" and "prevailing condition" in the Philippines. Even national pilots like DOST's E-TURO are only testing offline capabilities now.	Build for the barangay, not the boardroom. Use a PWA with IndexedDB and service workers to allow students to access lessons, take quizzes, and submit assignments without internet. Sync automatically when reconnected. This is your killer feature for public schools and geographically isolated areas.

2\. Deep AI That Saves Teacher Time	Teachers are "exhausted" and spend hours on manual lesson planning and grading. Platforms like Quipper offer AI Tutors, but teachers need AI that handles administrative drudgery.	Build "Guro Bot" for teachers first. Use AI to auto-generate DepEd/MATATAG-aligned lesson plans, create quizzes from curriculum standards, and automate the drafting of SF9/SF10 reports. Reducing teacher workload is the fastest path to adoption and loyalty.

3\. A Parent Portal That Actually Engages	Parents fear "excessive screen time" and "distraction". They need meaningful visibility, not just grades. Current portals are often passive.	Go beyond grades. Send proactive SMS and push notifications for attendance, missing assignments, and upcoming exams—channels that work even on basic phones. Give parents a simple, mobile-first view of their child's learning journey to build trust, not anxiety.

4\. Natively Integrated WebRTC (Your Core Strength)	Platforms either lack deep video integration or require complex third-party tools. BigBlueButton is education-optimized, but Jitsi integration is described as "limited".	Seamless, single-click live classes. Your Flutter app should embed the BBB session directly. A teacher schedules a class in your LMS, and the live room is automatically created with the correct roster, breakout groups, and recording settings—no separate links, no friction.

5\. Compliance-as-a-Feature for DPA	Many institutions meet only "minimum legal requirements" for the Data Privacy Act. The NPC advises that self-developed LMS must have "adequate data protection features".	Make DPA compliance your sales pitch. Build in role-based access, automated data retention policies, and detailed audit logs from day one. Offer schools a "Compliance Dashboard" that demonstrates you are protecting student data proactively, turning a legal burden into a trust signal.

6\. Predictive Analytics for Student Success	Schools react to dropouts and poor performance after they happen. Research shows predictive models can identify at-risk students with high accuracy.	Build an Early Warning System. Use your Supabase data (attendance, quiz scores, engagement) to build a simple predictive model that flags students at risk of falling behind or dropping out. Give teachers and administrators actionable recommendations for intervention, not just raw data.

7\. A Micro-Credential \& Teacher Growth Engine	DepEd and CHED are moving toward micro-credentials for professional development. Teachers need a way to upskill and be recognized.	Integrate teacher professional development. Offer stackable micro-courses on MATATAG pedagogy, digital literacy, and AI tools directly within your LMS. Issue verifiable digital badges. This makes your platform indispensable for teacher growth and school improvement, not just classroom management.

🛠️ Your Execution Roadmap: From Gap to Greatness

You don't need to build all of this at once. A phased approach de-risks development and allows you to gather real-world feedback.



Phase 1 (The Differentiator): Offline-First + Teacher AI.



Focus: Solve the two most acute pain points—connectivity and teacher burnout.



Build: A PWA with robust offline sync for core content and assessments. A teacher-facing AI assistant (integrated via an API) that auto-generates lesson plans and quizzes aligned to the MATATAG curriculum.



Why: This combination provides immediate, tangible value that teachers and schools can feel, setting you apart from day one.



Phase 2 (The Moat): Seamless WebRTC + Parent Engagement.



Focus: Deepen the platform's stickiness by integrating your core video strength and activating the parent network.



Build: Fully integrate your chosen WebRTC engine (BBB recommended) for one-click live classes with attendance tracking. Launch a mobile-first parent portal with SMS/push notifications for key events.



Why: This creates a powerful network effect. Teachers rely on you for live classes, and parents rely on you for visibility, making the platform much harder to replace.



Phase 3 (The Intelligence Layer): Predictive Analytics + Micro-Credentials.



Focus: Evolve from a management tool to a strategic partner for school improvement.



Build: An analytics dashboard that identifies at-risk learners using a simple, explainable model. A library of micro-credential courses for teacher professional development, with digital badges.



Why: This positions your platform as a driver of educational outcomes and teacher quality, justifying a premium positioning and creating long-term strategic value for school leaders.



By focusing on these specific, evidence-based gaps, you can build a K-12 platform that is not just "at par" with the top tier, but is uniquely and powerfully differentiated for the realities of the Philippine educational system. Your technical architecture (Flutter + Supabase + WebRTC) is well-suited to execute this vision. The next step is to prioritize the first phase and begin validating these features with a pilot school.



\---

## 1\. Technology Stack — Free \& Open-Source Optimized

All paid/freemium tools from the original stack have been replaced with the strongest free/open-source equivalents. Paid infrastructure (Hetzner, Supabase) is retained because it is unavoidable at scale.

### 1.1 Frontend

|Category|Technology|License|Notes|
|-|-|-|-|
|Student mobile app|**Flutter (Dart)**|BSD-3|Offline-first client for Android/iOS|
|Flutter state|**Riverpod 3** + `riverpod\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_generator`|MIT|Compile-safe DI; BLoC only for live-class orchestration|
|Flutter navigation|**GoRouter**|MIT|Deep-linking for FCM + join URLs|
|Flutter local DB|**Drift** (SQLite ORM)|MIT|Typed local tables for offline learner state|
|Teacher/Admin web|**React + Next.js (TypeScript)**|MIT|Fast, SEO-friendly, App Router|
|Web state (server)|**TanStack Query**|MIT|Caching, background refetch, optimistic updates|
|Web state (client)|**Zustand**|MIT|Lightweight auth/tenant context|

### 1.2 Offline Sync

|Category|Technology|License|Notes|
|-|-|-|-|
|Sync engine (primary)|**RxDB**|Apache-2.0|Local-first JS DB; permissive license; custom conflict resolution|
|Supabase offline plugin|**rxdb-supabase** (community)|Apache-2.0|Bridges RxDB replication to Supabase Realtime|

> \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*Why not PowerSync:\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\* PowerSync uses the FSL license (source-available) which restricts building a competing product. RxDB is Apache-2.0 and lets you implement custom client-side conflict logic, which is valuable for a multi-tenant education product.

### 1.3 Backend

|Category|Technology|License|Notes|
|-|-|-|-|
|API framework|**NestJS** (Node.js + TypeScript)|MIT|Enforces modules, DI, testability; authoritative business layer|
|Validation|**Zod**|MIT|Shared schema between NestJS + Next.js; OpenAPI → Dart models|
|Background jobs|**BullMQ**|MIT|Async: batch FCM, reports, BBB webhooks|
|Cache / queue backend|**Valkey** (Redis fork)|BSD-3|Drop-in Redis replacement after Redis license change|
|AI microservice|**FastAPI** (Python)|MIT|Isolated LLM calls + at-risk predictive model|

### 1.4 Data \& Auth

|Category|Technology|License|Notes|
|-|-|-|-|
|Primary DB|**Supabase (PostgreSQL)**|Apache-2.0 (self-host)|Managed during dev; migrate to self-hosted Docker stack on Hetzner in Phase 9|
|Multi-tenant isolation|**Supabase Row-Level Security (RLS)**|—|`tenant\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_id` claim in JWT; DB enforces isolation|
|Auth|**Supabase Auth** (GoTrue)|MIT|JWT with `tenant\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_id` + `role` claims|
|Realtime|**Supabase Realtime**|Apache-2.0|Streams DB changes to both clients|
|Push notifications|**Firebase Cloud Messaging (FCM)**|Free|Free for unlimited production volume|

### 1.5 WebRTC (Live Classes)

|Category|Technology|License|Notes|
|-|-|-|-|
|Live classroom engine|**BigBlueButton (self-hosted)**|LGPL-3.0|Purpose-built: breakouts, whiteboard, polling, shared notes|
|Load balancer (BBB pool)|**Scalelite**|LGPL-3.0|Pools N BBB nodes; native multi-tenant subdomains|
|TURN|**coturn**|BSD-3|NAT traversal for restrictive school networks|

### 1.6 DevOps \& Deployment

|Category|Technology|License|Notes|
|-|-|-|-|
|Container orchestration (abstracted)|**Coolify** (self-hosted PaaS)|Apache-2.0|Heroku-like UX on Hetzner; push-to-deploy; manages Docker under the hood|
|Underlying container runtime|**Docker Engine (Community)**|Apache-2.0|Used internally by Coolify — you do not manage Dockerfiles by hand|
|CI/CD|**GitHub Actions**|Free tier|2,000 min/month private repos (sufficient for pilot)|
|Monorepo tooling|**Turborepo** + **pnpm workspaces**|MIT|One repo: NestJS + Next.js + shared TS packages + FastAPI|
|Reverse proxy / TLS|**Caddy** (via Coolify)|Apache-2.0|Automatic HTTPS|

### 1.7 Observability \& Error Tracking

|Category|Technology|License|Notes|
|-|-|-|-|
|Error tracking|**GlitchTip** (self-hosted)|MIT|Sentry-SDK compatible — point Flutter/NestJS SDKs at your GlitchTip DSN|
|Metrics|**Prometheus**|Apache-2.0|Node/JVB/app metrics|
|Dashboards|**Grafana (OSS)**|AGPL-3.0|CPU, bandwidth, API latency, BBB health|
|Uptime|**Uptime Kuma**|MIT|Self-hosted ping/HTTP monitor|

> \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*Why not Sentry:\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\* The free tier (5,000 errors/mo, 1 user) runs out fast. GlitchTip accepts the official Sentry SDKs, so instrumentation code is identical — you only swap the DSN.

### 1.8 Design \& UI/UX

|Category|Technology|License|Notes|
|-|-|-|-|
|Design tool|**Penpot** (self-hosted)|MPL-2.0|Open-format (SVG/CSS native); design tokens; component libraries|
|Flutter design system|**Material 3** + custom tokens|Apache-2.0|White-label via token overrides per tenant|
|React design system|**MUI / shadcn/ui + Tailwind CSS**|MIT|Same Figma/Penpot tokens → shadcn theme|
|Flutter animations|**Rive** / **Lottie**|Free runtime|Lightweight vector micro-interactions|
|React animations|**Framer Motion**|MIT|Page transitions in admin portal|

### 1.9 Testing

|Category|Technology|License|Notes|
|-|-|-|-|
|Flutter unit/widget|`flutter test`|BSD-3|Built-in|
|Flutter E2E|**Patrol**|Apache-2.0|Crosses native boundary (permissions, notifications, offline↔online)|
|React unit|**Vitest** + **React Testing Library**|MIT|Fast component tests|
|React E2E|**Playwright**|Apache-2.0|Browser E2E for admin portal|
|Backend|**Jest** + **Supertest**|MIT|NestJS unit + integration|

### 1.10 Documentation \& Project Management

|Category|Technology|License|Notes|
|-|-|-|-|
|Docs / ADRs|**Outline** (self-hosted)|BSL-1.1|Beautiful wiki; self-host on Hetzner|
|Project tracking|**Plane** (self-hosted)|AGPL-3.0|Linear-equivalent issue tracker + sprints|
|API docs|**Swagger / OpenAPI** via NestJS|Apache-2.0|Auto-generated; source for Dart + TS clients|

> \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*Why not Notion/Linear/Figma:\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\* All replaced with self-hostable open-source equivalents to keep the entire stack auditable, free of per-seat pricing, and under your data-privacy control.

### 1.11 Infrastructure (Unavoidable Paid)

|Service|Cost Model|Notes|
|-|-|-|
|**Hetzner Cloud (Singapore)**|Paid monthly per instance|CX23 from \~€5.99; CCX33 (BBB media) \~€85–138. **Egress overage: €7.40/TB** — the dominant cost at scale|
|**Supabase Cloud** (dev only)|Free tier, then Pro \~$25/mo|Migrate to self-hosted Supabase on Hetzner in Phase 9 to remove per-project caps|

\---

## 2\. Head-to-Head Comparison on Critical Dimensions

|Dimension|Top-Tier Incumbents (Quipper, Genyo)|**This Platform**|Verdict|
|-|-|-|-|
|**Offline resilience**|Content-caching only; 63% of teachers report weak-internet failures (UNICEF)|**Architectural:** RxDB + Drift mirror DB to device; UI never blocks on network; writes queue \& sync|**Clear win** — single biggest differentiator|
|**AI capability**|Emerging \& student-facing (Quipper AI Tutor, auto-grading)|**Teacher-centric:** lesson-plan generation, quiz generation, at-risk prediction|**Differentiated** — attacks teacher burnout|
|**WebRTC integration**|Bolted-on (Moodle + Google + Zoom/BigBlueButton separately)|**Native:** BBB provisioned by NestJS; roster + breakouts automatic; one-click from LMS|**Superior UX**|
|**Parent engagement**|Passive dashboards|**Proactive:** Next.js PWA + FCM push for attendance, missing work, grades|**Deeper engagement**|
|**DPA compliance**|Baseline legal requirement|**Compliance-as-feature:** immutable audit logs, retention jobs, RLS-enforced tenancy, Compliance Dashboard for schools|**Trust advantage**|
|**Content library**|Deep, ready-made DepEd-aligned (Quipper: thousands of lessons)|Build from scratch → **integrate DepEd LR Portal + Khan Academy PH**|**Key challenge** — cannot out-content; must out-execute on platform experience|
|**Multi-tenancy**|Vendor-managed, opaque|**RLS + `tenant\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_id` JWT** — defense in depth; auditable|**Superior control**|
|**Cost at 1,500 concurrent**|Per-seat licensing (scales linearly with students)|Fixed infra \~€1,800–€2,500/mo (BBB) — **near-zero marginal cost per school**|**Better unit economics at scale**|

**Strategic moats:** true offline-first, teacher-centric AI, unified video+LMS experience, DPA-as-feature.
**Incumbent moat to neutralize:** content volume — solve via integration, not production.

\---

## 3\. Phase-by-Phase Execution Plan

Timeline assumes a team of **2–3 full-stack engineers** (Flutter + NestJS + Next.js) plus **0.5 DevOps**. Durations are calendar weeks.

### Phase 0 — Foundation \& Tooling (Weeks 1–2)

**Goal:** Reproducible dev environment, repo structure, CI, design system baseline.

* \[ ] Monorepo: `apps/api` (NestJS), `apps/web` (Next.js), `apps/mobile` (Flutter), `packages/shared` (Zod schemas, OpenAPI types), `services/ai` (FastAPI)
* \[ ] Turborepo + pnpm workspaces configured; shared `tsconfig`, ESLint, Prettier
* \[ ] GitHub repo + branch protection + PR template
* \[ ] GitHub Actions: lint → test → build for all three apps on PR
* \[ ] Provision Hetzner CX23 dev box; install **Coolify**
* \[ ] Self-host **Penpot** (design), **Outline** (docs), **Plane** (issues) on the dev box
* \[ ] Self-host **GlitchTip**; wire Flutter + NestJS Sentry SDKs to GlitchTip DSN
* \[ ] Create Penpot design system: color, typography, spacing tokens (Material 3 → Flutter / shadcn → React)
* \[ ] ADR-001: Architecture decisions record scaffolded in Outline

**Exit criteria:** `git push` triggers green CI for all three apps; Penpot + Outline + Plane + GlitchTip reachable; first ADR written.

\---

### Phase 1 — Multi-Tenant Core (Weeks 3–6)

**Goal:** Auth, tenant model, RLS, role system — the security foundation everything else depends on.

* \[ ] Supabase project (dev tier); schema migrations via `supabase/migrations`
* \[ ] Core tables: `tenants`, `users`, `user\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_tenants`, `roles`, `audit\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_log`
* \[ ] **RLS policies** on every table keyed on `tenant\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_id` from JWT claim
* \[ ] Supabase Auth: email/password + Google OAuth; custom claims hook injects `tenant\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_id` + `role`
* \[ ] NestJS: `AuthModule`, `TenantModule`, `UsersModule`; global `TenantGuard` and `RolesGuard`
* \[ ] **Audit interceptor** in NestJS → writes immutable `audit\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_log` rows for sensitive ops
* \[ ] Zod schemas in `packages/shared`; OpenAPI spec auto-generated
* \[ ] Generate Dart client (`openapi-generator`) + TS client (`orval`) into `packages/shared`
* \[ ] Flutter: auth screens + Riverpod auth provider (stub offline — full sync in Phase 3)
* \[ ] Next.js: login + tenant switcher + role-gated layout
* \[ ] Vitest/Jest/Flutter test coverage for auth flows ≥ 70%

**Exit criteria:** A teacher and student can log in on both Flutter and Next.js; RLS proven by cross-tenant test (tenant A cannot read tenant B rows); audit log records logins and role changes.

\---

### Phase 2 — LMS Core Features (Weeks 7–12)

**Goal:** The academic engine — courses, sections, assignments, gradebook, attendance.

* \[ ] Schema: `courses`, `sections`, `enrollments`, `assignments`, `submissions`, `grades`, `attendance`, `competencies` (MATATAG-aligned tags)
* \[ ] RLS on all new tables; teacher-owns-section policy, student-sees-own-enrollment policy
* \[ ] NestJS modules: `CoursesModule`, `SectionsModule`, `AssignmentsModule`, `GradebookModule`, `AttendanceModule`, `CompetenciesModule`
* \[ ] Weighted gradebook calculation service with rubric support (unit-tested)
* \[ ] Assignment submission: file upload → Supabase Storage (signed URLs), text entry, deadline enforcement
* \[ ] Attendance: daily mark, bulk mark, sync-ready payload shape for offline (Phase 3)
* \[ ] Competency tagging: every assignment can be tagged to DepEd/MATATAG competency codes
* \[ ] Next.js teacher portal: create course → section → assignment; gradebook grid; attendance sheet
* \[ ] Flutter student app: course list, assignment list, submission (online only for now)

**Exit criteria:** Teacher creates a class with assignments and grades a submission; student sees grade; attendance recorded; all data tenant-isolated.

\---

### Phase 3 — Offline-First Student App (Weeks 13–18)

**Goal:** The differentiator — the student app works fully offline.

* \[ ] Add **RxDB** to Flutter; define collections mirroring `courses`, `assignments`, `submissions`, `grades`, `attendance`, `notifications`
* \[ ] Local SQLite storage (RxDB storage layer) — encrypted at rest (SQLCipher)
* \[ ] **Replication** RxDB ↔ Supabase via `rxdb-supabase` plugin (or ElectricSQL if plugin gaps)
* \[ ] Conflict resolution strategy: server-authoritative for grades/attendance; client-wins-with-merge for submission drafts
* \[ ] Offline queue: assignment submissions, attendance marks (teacher), read receipts — replay on reconnect
* \[ ] UI reads exclusively from local DB; network is a background concern
* \[ ] "Last synced" indicator + manual sync button + sync status stream
* \[ ] Test matrix: airplane mode start → offline work → reconnect → conflict scenarios
* \[ ] Patrol E2E: offline submission → reconnect → server verified

**Exit criteria:** Kill WiFi mid-assignment, complete and submit offline, reconnect — server receives submission; no data loss; no UI blocking on any screen.

\---

### Phase 4 — WebRTC Integration (Weeks 19–22)

**Goal:** One-click live classes via BigBlueButton.

* \[ ] Provision first BBB node on Hetzner (CCX33) + Scalelite + coturn; Caddy TLS
* \[ ] NestJS `MeetingsModule`: create meeting via BBB API on class schedule; store `meeting\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_id`, `join\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_url`
* \[ ] Signed join URLs: teacher → moderator role; student → viewer role; tenant-scoped room names
* \[ ] BBB webhook → NestJS `/webhooks/bbb` → record attendance, duration, recording-ready events
* \[ ] Flutter: "Join class" button → opens BBB in WebView with JWT; deep-link support
* \[ ] Next.js: "Start class" button for teacher → opens BBB in new tab
* \[ ] Load test with 3 concurrent 50-user rooms before scaling to full pool
* \[ ] Guard: class cannot start before scheduled time unless teacher forces

**Exit criteria:** A scheduled class produces a working BBB room; 50 students join from Flutter; teacher has moderator controls; attendance auto-recorded via webhook.

\---

### Phase 5 — Teacher/Admin Web Portal (Weeks 23–28)

**Goal:** Complete the Next.js experience for always-online users.

* \[ ] Admin tenant dashboard: school profile, branding (white-label tokens), user management, role assignment
* \[ ] Teacher dashboard: today's classes, pending grading, at-risk flags (placeholder until Phase 6), announcements
* \[ ] Gradebook: inline edit, bulk actions, CSV export (DepEd SF9/SF10 format scaffold)
* \[ ] Section management: roster, add/remove students, co-teacher assignment
* \[ ] Compliance Dashboard (DPA): audit log viewer, data retention policy config, export for NPC requests
* \[ ] FCM via service worker: PWA install prompt, notification permission flow
* \[ ] Accessibility pass: WCAG AA, keyboard nav, screen reader labels

**Exit criteria:** A school admin can onboard a school, invite teachers, and generate a DepEd-style report; audit log visible; PWA installable and receives push.

\---

### Phase 6 — AI Microservice (Weeks 29–34)

**Goal:** Teacher productivity + early-warning analytics.

* \[ ] FastAPI service on separate Hetzner CX23; internal-only network
* \[ ] `/generate/lesson-plan`: MATATAG competency → structured lesson plan (LLM call, cached)
* \[ ] `/generate/quiz`: competency → N items with answer key + rubric
* \[ ] `/analytics/at-risk`: nightly batch → reads grades + attendance + engagement → risk score per student
* \[ ] At-risk model v1: rule-based (attendance < 80%, ≥2 missing submissions, grade drop > 20%) — ML later
* \[ ] NestJS `AiModule` proxies calls; rate limits per tenant
* \[ ] Teacher UI: "Generate lesson plan" button in Next.js; "Generate quiz" in assignment creator
* \[ ] Admin UI: at-risk student list with intervention suggestions
* \[ ] Cost controls: per-tenant monthly token budget in NestJS

**Exit criteria:** Teacher generates a usable lesson plan in < 30 seconds; at-risk list populates nightly; per-tenant AI cost cap enforced.

\---

### Phase 7 — Parent Portal \& Notifications (Weeks 35–38)

**Goal:** Activate the parent network — the retention driver.

* \[ ] Parent role in auth; parent↔student link table (one parent, many children)
* \[ ] Next.js `/parent` routes: child switcher, grades, attendance, upcoming assignments, announcements
* \[ ] FCM push on: grade posted, absence marked, assignment due in 24h, class starting in 15m
* \[ ] SMS fallback (via local PH gateway — Semaphore/Movider) for critical alerts only
* \[ ] Parent notification preferences (channel + frequency)
* \[ ] Teacher → parent direct message (threaded, audited)
* \[ ] Privacy: parent sees only own children's data (RLS policy)

**Exit criteria:** Parent receives push for a grade and an absence; can view child's week at a glance; can message teacher; RLS prevents cross-family access.

\---

### Phase 8 — Compliance \& Hardening (Weeks 39–42)

**Goal:** Production-grade DPA posture + security.

* \[ ] Full audit log coverage: every sensitive read/write logged with actor, tenant, IP, timestamp
* \[ ] Data retention jobs (BullMQ cron): archive/delete per policy (e.g., 5 years post-grad)
* \[ ] Data Subject Access Request (DSAR) workflow: export all data for a user
* \[ ] Right-to-erasure workflow: soft-delete + hard-delete after grace period
* \[ ] Encryption audit: at-rest (Supabase + SQLCipher on device), in-transit (TLS 1.3, HSTS)
* \[ ] Penetration test (internal or low-cost external) → remediate findings
* \[ ] Rate limiting per tenant on all public endpoints
* \[ ] Secrets management: Coolify env + rotation runbook
* \[ ] Backup \& restore drill: Supabase dump → restore to staging → verified
* \[ ] Incident response runbook (breach → NPC 72-hour notification)

**Exit criteria:** DSAR export and erasure both work end-to-end; audit log covers all sensitive tables; backup restore drilled; pen-test findings resolved.

\---

### Phase 9 — Pilot Deployment \& Supabase Self-Host (Weeks 43–48)

**Goal:** Move off managed Supabase; run a real pilot school.

* \[ ] Self-host **Supabase** on Hetzner (Docker stack: Postgres + GoTrue + Realtime + Storage + Studio) behind Coolify
* \[ ] Migrate dev/staging data; validate RLS, realtime, storage signed URLs
* \[ ] Provision BBB pool: 5 × CCX33 + Scalelite on Singapore; load test 16 × 50-user rooms
* \[ ] Bandwidth policy enforced: student cameras off by default, 720p cap, teacher-only video
* \[ ] Monitoring: Grafana dashboards (JVB CPU, egress, API p95, GlitchTip error rate)
* \[ ] Pilot with 1 partner school (1–3 sections, \~150 students)
* \[ ] Weekly feedback loop; triage → backlog
* \[ ] Cost review: actual egress vs. budget; adjust node count
* \[ ] Go/no-go decision for multi-school rollout

**Exit criteria:** Pilot school completes a full month of classes; no P1 incidents; egress within budget; NPS/teacher satisfaction surveyed.

\---

## 4\. Cost Summary (Pilot Scale)

|Item|Monthly Cost|
|-|-|
|Hetzner CX23 × 3 (dev, AI, TURN)|\~€18|
|Hetzner CCX33 × 5 (BBB pool)|\~€425–€690|
|Hetzner CX33 (Supabase self-host)|\~€8.50|
|Bandwidth overage (policy-enforced)|\~€300–€600|
|**Total (pilot)**|**\~€750–€1,320 / month**|
|**Total (at 1,500 peak, 12 BBB nodes)**|**\~€1,800–€2,500 / month**|

All software in the stack is **free or open-source**. The only recurring costs are Hetzner infrastructure and (during dev) Supabase Cloud — both unavoidable.

\---

## 5\. Risk Register

|Risk|Impact|Mitigation|
|-|-|-|
|RxDB ↔ Supabase replication gaps|Offline sync bugs|Validate early in Phase 3 with a spike; ElectricSQL as fallback|
|Hetzner Singapore egress overage|Cost blowout|Cameras-off default, 720p cap, monthly egress budget alert in Grafana|
|BBB node capacity under real load|Class disruption|Load test Phase 4 + Phase 9; 2 standby nodes; Scalelite auto-routing|
|Content gap vs. Quipper|Adoption friction|Integrate DepEd LR Portal + Khan Academy PH in Phase 2/5|
|DPA non-compliance|Legal/regulatory|Phase 8 dedicated; ADRs document every data flow|
|Small team bandwidth|Timeline slip|Phases 0–4 = MVP; Phases 5–9 can overlap once MVP is validated|

\---

Work around these features: gradebook aggregation and quiz engine



*End of plan.*

