# Mobile Phase 2 — Versioned Workers API and Service Layer

Baseline: Mobile Phase 1 tree based on production commit `471ade75da025df51fcf98ba6740f400e10b9cae`.

## Implemented

- Added `/api/v1` as the canonical website/mobile transport namespace.
- Kept physical v1 handlers ahead of compatibility rewrites and reused the existing route/domain services for all other endpoints.
- Migrated student-facing website fetches to `/api/v1`; admin-only control-plane calls remain explicitly separate.
- Added a public capability contract covering session, dashboard, progress, Chapter Hub, Today, planner, Focus, notes, resources, community, ICAI, search, profile, settings, notifications and subscriptions.
- Added centralized API-version negotiation, trace IDs, mutation idempotency keys, payload-size validation and media-type validation at the request boundary.
- Added a typed client error adapter so both legacy response bodies and new structured errors resolve to one application error contract.
- Added a shared dashboard read endpoint that calls the same cached dashboard and academic-context services as the website.
- Retained the existing Worker read/write rate-limit buckets and added structured v1 mutation/error/slow-request logs.
- Retained server-side authorization and ownership checks in the existing services; the rewrite layer never accesses D1 directly.
- Retained existing pagination/cursor behavior and published canonical pagination/delta-sync parameter names for additive adoption.

## Compatibility

Existing unversioned routes remain available during the supported-client transition window. The versioned namespace preserves successful payload shapes, so current website screens do not need parallel response models. New clients should send `X-CA-API-Version: 1`; incompatible explicit versions receive HTTP 406. Unsafe requests receive or retain an `Idempotency-Key` and every v1 response carries `X-Request-ID`.

## Deliberately deferred

- Persistent mobile credential rotation and OAuth deep links: Phase 3.
- Adaptive native application shell: Phase 4.
- Service worker/update activation: Phase 5.
- Entity-specific offline delta application and conflicts: Phase 6.
- Native container and store builds: Phase 11.
- Production deployment: requires explicit user authorization.
