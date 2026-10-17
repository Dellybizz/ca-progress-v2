# Mobile Phase 1 — Shared Architecture Foundation

Baseline: `main` at `471ade75da025df51fcf98ba6740f400e10b9cae`.

## Implemented

- Retained the existing Next.js application structure; no monorepo rewrite.
- Retained the existing cached `getStudentContext` as the single website/mobile academic context resolver.
- Added an explicit academic-context contract version.
- Added a public, non-secret application release compatibility contract.
- Added `/api/app-config` for update and compatibility checks.
- Added `/api/v1/bootstrap` for one-request viewer, release and academic-context startup.
- Added a read contract to `/api/planner/today` while retaining existing mutation behavior.
- Added API/context compatibility headers to Today, progress and offline context paths.
- Added a deterministic npm lockfile and moved active CI/deployment workflows to `npm ci`.

## Compatibility rules

- Contract changes are additive within API version 1.
- Removing or renaming a response field requires a new API version.
- Academic selection changes produce a new `contextKey`; queued offline mutations with an older key remain conflicts and are never silently applied.
- Native minimum/recommended versions are configuration only in this phase. No native container exists yet.
- The public app-config route contains no secrets, entitlements or user data.

## Deliberately deferred

- PWA manifest, icons and install onboarding: Phase 5.
- Capacitor Android/iOS projects: Phase 11.
- Native push and secure storage: Phase 11.
- Payment provider mapping repair: separate authorized payment programme before mobile billing activation.
- Production deployment: requires explicit user authorization.
