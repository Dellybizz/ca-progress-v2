# CA Progress V2 Architecture

## Boundary

CA Progress V2 is a separate system. It intentionally has no code, database, deployment or DNS dependency on the legacy CA Progress project.

## Deployment model

CA Progress V2 uses an optimized hybrid Cloudflare architecture:

```text
Browser
  -> ca-progress-v2 (single public OpenNext / Next.js Worker)
       -> Supabase / PostgreSQL RLS
       -> USER_RESOURCES_R2
       -> ICAI_SYNC_SERVICE -> private ca-progress-v2-icai-sync
       -> BILLING_SERVICE -> private ca-progress-v2-billing
       -> ADMIN_OPS_SERVICE -> private ca-progress-v2-admin-ops
```

The application deliberately keeps one Next.js deployment unit so normal Cloudflare Connected Builds stay simple. It does not split ordinary UI/SSR routes into separate Core/Admin/Community/Planning Next Workers.

Heavy or security-sensitive engines are extracted only when that boundary has clear value:

- ICAI sync owns source parsing, retries, scheduled synchronization and batch processing.
- Billing owns Razorpay secrets, signature verification, payment reconciliation and billing health.
- Admin Ops owns privileged platform/member/plan/content/audit operations and independently re-checks authorization.
- R2 stores user resource bytes outside the Worker bundle.

This is a modular-monolith web architecture with a small number of purpose-built internal services, not an all-in-one Worker and not microservices for every feature.

## Request path

Normal application requests follow:

```text
Browser
  -> OpenNext / Next.js App Router
  -> Server Component or route handler
  -> domain/server service
  -> validation + authorization boundary
  -> typed Supabase client or private service binding
  -> PostgreSQL RLS / internal Worker
```

## Source boundaries

- `app/(student)` — student product surfaces.
- `app/(public)` — login, onboarding and public surfaces.
- `app/(admin)` — privileged UI/orchestration surfaces; privileged mutations are not trusted to the browser.
- `components/` — shared UI and product components.
- `lib/<domain>/` — domain modules such as academic, admin, analytics, auth, billing, community, planner, progress and resources.
- `server/` — server/domain services and authorization boundaries.
- `workers/icai-sync/` — private heavy background engine.
- `workers/billing/` — private payment authority boundary.
- `workers/admin-ops/` — private privileged operations boundary.
- `supabase/migrations/` — ordered V2 schema history.

A single deployment unit does not mean a single code module. Feature code remains separated by domain even though Next.js compiles into one web Worker.

## Bundle policy

Cloudflare Free has a hard compressed Worker-size ceiling, so the repository maintains its own lower safety gates.

Current policy:

- consolidated web Worker hard repository gate: 2.80 MiB compressed;
- preferred operating target: move toward 2.50 MiB or lower where practical;
- ICAI worker gate: 1.50 MiB;
- Billing worker gate: 0.75 MiB;
- Admin Ops worker gate: 1.00 MiB.

New features stay inside the normal Next.js application when they are lightweight. A new service Worker is justified only when a feature introduces meaningfully heavy processing, sensitive credentials/authority, scheduled/background work, or enough bundle growth to threaten the web safety margin.

Examples of future candidates, only if needed, include document processing, AI workloads or a large test-evaluation engine. Ordinary pages should not become separate deployment Workers by default.

Unused OpenGraph runtime code continues to be removed from Cloudflare builds because the application does not use Next dynamic OG image generation.

## Authentication and authorization

Authenticated account sign-in remains social-only:

- Google
- LinkedIn

Guest mode remains local non-account access. It is not an authentication provider.

Authorization is enforced server-side and through PostgreSQL RLS. Admin controls in the browser are only UI/orchestration; privileged Admin Ops requests are re-authorized inside the private service boundary.

## Environment model

- Local: developer workstation.
- Preview/staging: Cloudflare Workers with visible V2 staging identity.
- Production V2: intentionally not connected/cut over until the appropriate later-phase approval.
