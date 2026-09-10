# Product Consistency Programme — Phase 0 Baseline

Status: complete and production recovery certified  
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

The non-mutating `Product Consistency Phase 0 D1 Backup` workflow passed in [GitHub Actions run 34453468706](https://github.com/Dellybizz/ca-progress-v2/actions/runs/34453468706) on 2026-09-10.

The workflow used the existing Cloudflare secrets to capture and validate a D1 Time Travel bookmark, execute the read-only integrity pack, and retain the recovery/evidence artifact `product-consistency-phase0-recovery-34453468706` with digest `sha256:66420e8ef32885871b2634b1ab9415d16f0435044c2194244981b89e526af2a5`. It did not export personal rows into the artifact and did not mutate the database.

The production recovery gate is certified.

## Verification completed

- Phase 0 route/persona/integrity/workflow tests: 5/5 passed.
- TypeScript typecheck: passed.
- Targeted ESLint: passed.
- Fresh local D1 migrations: 38/38 applied.
- Read-only local D1 diagnostics: 9/9 executed successfully.
- Production D1 recovery/integrity workflow: passed; recovery artifact retained.

## Next phase

Phase 1 may begin. It will introduce the canonical academic model and quarantine path; Phase 0 made no such schema or data changes.
