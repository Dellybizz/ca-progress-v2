# CA Progress V2 — Phase 12 Status

**Phase:** 12 — Integrated Operations Admin Platform + Architecture Hardening  
**Branch:** `phase-12-operations-admin-platform`  
**Scope boundary:** Phase 12 only. No later phase has been started.  
**State:** Verification pending — do not mark Complete until all repository and Cloudflare gates pass.

## Integrated branch state

Phase 12 now reconciles the two previously diverged Phase 12 lines of work:

- `phase-12-operations-admin-platform`
- `phase-12-architecture-hardening`

The integration preserves the newest Operations/Admin/Login/Onboarding/Feature Guide work and the private Admin Operations Worker/service-binding/security hardening. The integration commit has both Phase 12 branch heads as parents so neither history was discarded.

## Operations/Admin platform

- Responsive operations overview with member/moderation/payment counters and Supabase/Auth/Storage/Realtime/Razorpay/ICAI health.
- Fresh database-backed `admin_users` authorization source for moderator/admin/owner/parent-owner hierarchy.
- Server-side role hierarchy safeguards, self-change protection and protected parent-owner bootstrap.
- Server-paginated member directory with subscription detail and owner-level role controls.
- Existing ICAI sync/review, Community moderation and resource moderation retained as operational queues.
- Controlled syllabus version, exam attempt and ICAI resource state editor.
- Owner-level paid plan and entitlement editor built on Phase 11 tables.
- Feature kill switches and maintenance mode enforced on selected real server mutation paths.
- Notification-template composer/library.
- Immutable privileged operations audit log.
- Protected `/api/admin/*` operations endpoints.
- Desktop/tablet/mobile admin navigation plus loading, error and empty states.

## Authentication and first-run experience

Authenticated account sign-in remains social-only:

- Google
- LinkedIn

Phase 12 does **not** add phone login, OTP, SMS authentication or email/password authentication.

Existing Guest mode remains local non-account access and does not become an authentication provider.

The integrated first-run flow preserves:

- resumable onboarding state;
- CA level selection;
- Group selection where applicable;
- attempt selection based on verified academic data;
- ranked onboarding priorities;
- daily study target;
- Change account flow;
- server-side onboarding validation;
- onboarding completion routing into the feature guide.

## Dashboard feature guide

The integrated Phase 12 build preserves the real Dashboard spotlight feature guide rather than a mock/static slideshow.

It:

- runs over the actual Dashboard;
- highlights real Dashboard/navigation controls;
- follows ranked onboarding priorities first;
- optionally offers additional useful features afterward;
- supports Back, Next, Skip and Finish;
- scrolls real targets into view;
- persists guide completion so completed first-run users are not repeatedly forced through it.

## Security boundary

Admin pages and client controls remain display/orchestration surfaces only. Admin APIs call the central server authorization helper, while privileged mutations are re-authorized through the Phase 12 database/RPC hierarchy safeguards.

Phase 12 private tables retain RLS and privileged browser execution remains revoked where required.

Parent Owner safeguards remain authoritative, including hierarchy checks and protection against unsafe self/last-owner role changes.

Phase 11 payment authority remains unchanged: browser data does not determine paid amount or subscription authority; Razorpay order/payment state and signatures continue to be verified server-side through the private Billing Worker and Phase 11 reconciliation path.

## Hybrid Cloudflare architecture

Phase 12 now uses an optimized hybrid deployment model rather than splitting ordinary Next.js route families into separate Core/Admin/Community/Planning Workers.

```text
Browser
  -> ca-progress-v2 (single OpenNext / Next.js web Worker)
       -> USER_RESOURCES_R2
       -> ICAI_SYNC_SERVICE -> ca-progress-v2-icai-sync
       -> BILLING_SERVICE -> ca-progress-v2-billing
       -> ADMIN_OPS_SERVICE -> ca-progress-v2-admin-ops
```

The web application remains one deployment unit so normal Cloudflare Connected Builds stay simple. Source code remains modular by product/domain; a single deployment unit does not collapse those source boundaries.

The following temporary split deployment units are removed:

- `ca-progress-v2-web-core`
- `ca-progress-v2-web-admin`
- `ca-progress-v2-web-community`
- `ca-progress-v2-web-planning`

Heavy/background/security-sensitive work remains outside the Next bundle. Future Workers should be added only when a feature has a clear processing, security or bundle-size reason rather than creating a Worker for every route family.

The consolidated web Worker has a repository compressed-size gate of **2.80 MiB**, below the Cloudflare Free hard limit, with a preferred optimization target of **2.50 MiB or lower** where practical. ICAI, Billing and Admin Ops retain their independent tighter budgets.

## Private Admin Operations Worker

Architecture hardening remains part of the integrated Phase 12 branch.

Admin operations use:

```text
Next.js Web Worker
  -> ADMIN_OPS_SERVICE Cloudflare service binding
  -> private ca-progress-v2-admin-ops Worker
  -> privileged admin database/RPC operations
```

The private Admin Worker:

- is not exposed as a public application route;
- independently resolves fresh `admin_users` role state;
- enforces minimum role levels before privileged work;
- handles member, platform, plan, notification, audit, content and health operations;
- calls the private Billing Worker for billing health where required;
- participates in local multi-worker preview and independent size-budget checks.

`wrangler.web.jsonc` contains the `ADMIN_OPS_SERVICE`, `BILLING_SERVICE`, `ICAI_SYNC_SERVICE` and `USER_RESOURCES_R2` bindings plus Phase 12 Worker version metadata.

## Phase 12 migrations

The integrated branch retains these migrations in chronological order:

1. `20260831090000_phase12_operations_admin_platform.sql`
2. `20260831110000_phase2_onboarding_refinement.sql`
3. `20260831121000_requested_owner.sql`
4. `20260831123000_phase2_onboarding_priority_list.sql`

All prior Phase 0–11 migrations remain intact.

## Verification required

Phase 12 may be marked **Complete** only after the integrated branch passes:

```text
npm run typecheck
npm run lint
npm test
npm run build
npm run cf:check
npm run cf:smoke
```

The verification must also include the existing Phase 11 payment/security regressions, Phase 12 admin/security regressions, Phase 2 onboarding/feature-guide regressions and hybrid Cloudflare architecture regressions that are part of `npm test`.

The Phase 12 migration must also be applied to the isolated V2 Supabase project before production acceptance. The legacy repository, legacy deployment and any unrelated Supabase project remain out of scope.
