# CA Progress V2 — Phase 12 Status

**Phase:** 12 — Operations Admin Platform  
**Branch:** `phase-12-operations-admin-platform`  
**Scope boundary:** Phase 12 only. No later phase has been started.

## Implemented

- Responsive operations overview with member/moderation/payment counters and Supabase/Auth/Storage/Realtime/Razorpay/ICAI health.
- Fresh database-backed `admin_users` authorization source for moderator/admin/owner/parent-owner hierarchy.
- Server-side role hierarchy safeguards, self-change protection and protected parent-owner bootstrap.
- Server-paginated member directory with subscription detail and owner-level role controls.
- Existing ICAI sync/review, Community moderation and resource moderation retained as the operational queues.
- Controlled syllabus version, exam attempt and ICAI resource state editor.
- Owner-level paid plan and entitlement editor built on Phase 11 tables.
- Feature kill switches and maintenance mode enforced on selected real server mutation paths.
- Notification-template composer/library.
- Immutable privileged operations audit log.
- Protected `/api/admin/*` operations endpoints.
- Desktop/tablet/mobile admin navigation plus loading, error and empty states.

## Security boundary

Admin pages and client controls are display surfaces only. New admin APIs call the central server authorization helper, and sensitive mutations call database RPCs that independently re-check operator hierarchy. Phase 12 private tables have RLS enabled, no browser table policies, and browser execute rights are revoked from privileged functions.

## Infrastructure

Phase 12 introduces no new required secret or public service. It reuses the V2 server-only Supabase credential plus existing private ICAI, Billing and R2 Cloudflare bindings. Existing privileged V2 auth roles are bootstrapped into `admin_users`; if no parent owner exists, a deliberate service-role-only bootstrap RPC is available.

## Completion gate

Complete only after the Phase 12 migration is applied to the isolated V2 Supabase project and the full repository CI / Cloudflare checks pass. The legacy repository, deployment and Supabase project remain out of scope.
