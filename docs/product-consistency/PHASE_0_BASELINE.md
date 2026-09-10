# Product Consistency Programme — Phase 0 Baseline

Status: implementation complete; production backup certification pending  
Branch: `phase-12-operations-admin-platform`  
Baseline date: 2026-09-10

## Scope completed

- Inventoried all 40 student and admin page routes.
- Assigned each route an explicit purpose, service boundary, principal D1 tables, academic scope, entitlement mode, offline candidate and current enforcement state.
- Defined eight boundary personas covering guest, Foundation, Intermediate Group 1, Group 2, Both Groups, Final Group 1/2 and admin preview.
- Added a read-only D1 integrity diagnostic pack.
- Added CI coverage that fails when a new student/admin page lacks a route contract.
- Added a production D1 Time Travel checkpoint workflow, triggered by this Phase 0 push or manually.
- No production row, schema or application behaviour was changed by Phase 0.

## Baseline result

| Measure | Result |
| --- | ---: |
| Student/admin pages | 40 |
| Contracted pages | 40 |
| Missing contracts | 0 |
| Stale contracts | 0 |
| Duplicate routes | 0 |
| Canonical boundaries already identified | 11 |
| Partial-consistency boundaries | 29 |
| Required test personas | 8 |

“Partial” is not a claim that a page is broken. It means the page currently resolves academic context inside its own service or composed services rather than through the single request-scoped context planned for Phases 2–3.

## Highest-priority findings

1. `/subjects/[subjectSlug]` resolves a globally unique subject slug without validating the signed-in level/group context.
2. `/resources/icai` permits explicit query filters that may be broader than the signed-in profile.
3. Dashboard data is composed from independently scoped services; the approved-exam-to-countdown chain requires dedicated Phase 5 certification.
4. Tests, planning, progress, analytics and study features each retain service-local academic selection logic.
5. `/admin/syllabus` and `/admin/icai-sync/data` do not yet expose canonical mapping quarantine/resolution controls.
6. Resource moderation does not surface academic mapping health.

These findings are inputs to later phases. Phase 0 intentionally does not apply speculative data corrections.

## Read-only D1 checks

The diagnostic pack checks:

- D1 foreign-key integrity;
- subject/group level disagreement;
- attempt/group/subject/syllabus disagreement;
- overlapping published syllabus versions;
- active subjects without attempt mappings;
- verified ICAI resources without academic scope;
- ICAI subject/attempt level disagreement;
- invalid examination date ranges;
- approved upcoming attempts without a start date.

All 38 migrations applied to a fresh temporary local D1 database. All nine diagnostic statements executed successfully and returned no findings against the empty local baseline.

## Production recovery gate

The local environment did not contain `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID`, so it could not truthfully certify a production checkpoint. The repository now contains the non-mutating `Product Consistency Phase 0 D1 Backup` workflow.

The workflow uses the existing Cloudflare secrets to capture a D1 Time Travel bookmark, validates that the bookmark exists, runs the read-only integrity pack, and retains the recovery/evidence artifact. It does not export personal rows into a GitHub artifact and does not mutate the database.

Phase 0 must not be marked fully certified until that workflow passes and its recovery bookmark and integrity output are retained.

## Verification completed

- Phase 0 route/persona/integrity/workflow tests: 5/5 passed.
- TypeScript typecheck: passed.
- Targeted ESLint: passed.
- Fresh local D1 migrations: 38/38 applied.
- Read-only local D1 diagnostics: 9/9 executed successfully.

## Next phase

Phase 1 may begin only after the production backup gate above is satisfied. Phase 1 will introduce the canonical academic model and quarantine path; Phase 0 made no such schema or data changes.
