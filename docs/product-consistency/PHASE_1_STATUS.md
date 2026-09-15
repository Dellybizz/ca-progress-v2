# Product Consistency Programme — Phase 1 Status

Status: implementation complete; production migration and data certification pending
Branch: `phase-12-operations-admin-platform`
Date: 2026-09-10

## Implemented

- Reused the existing `course_levels`, `course_groups`, `subjects`, `syllabus_versions`, `exam_attempts`, `attempt_syllabus_map`, `chapters` and canonical catalog tables rather than creating a competing academic system.
- Added stable syllabus-scoped modules and assigned every existing chapter to a compatibility module without changing chapter IDs.
- Added one academic content-mapping registry for resources, ICAI resources, tests, progress, plans, notifications, community content, study records and notes.
- Backfilled unambiguous chapter- and subject-linked records while preserving every source row and relationship.
- Added automatic mapping for future core progress, test, plan and subject-channel writes.
- Added an unmapped-content quarantine. Verified/public content without one safe scope is withheld for review rather than guessed into a student feed.
- Added exact legacy-ID aliases for the current level/group/subject/syllabus/chapter IDs.
- Added evidence-only duplicate candidates. Phase 1 never automatically merges or deletes a possible duplicate.
- Added D1 guards for level/group, syllabus effective-range, attempt/syllabus, module/chapter and content-mapping consistency.
- Added an owner-capability-protected mapping resolution and dismissal workflow to `/admin/syllabus`. Both actions validate the whole hierarchy, use an atomic D1 batch and append immutable admin audit evidence.
- Added a read-only Phase 1 integrity diagnostic pack.
- Added migration `0039` to the retained production migration chain and fresh-D1 validator.

## Safety properties

- Existing academic, progress, test, planner, study, note, resource and community rows are not deleted or rewritten.
- Existing logical IDs remain valid through exact compatibility aliases.
- A changed title or URL does not create a new canonical identity.
- Ambiguous ICAI resources with multiple subject mappings are quarantined.
- Invalid future hierarchy writes fail in D1 even if a caller bypasses the UI.
- Admin resolution is authorization-checked, hierarchy-validated, audited and idempotent by `(entity_type, entity_id)`.

## Verification

- Dedicated Phase 0 + Phase 1 and affected academic/ICAI tests: **29/29 passed**.
- Complete repository suite: **542/542 passed**.
- TypeScript: **passed**.
- Targeted ESLint: **passed**.
- Fresh in-memory D1: **39/39 migrations applied**.
- Fresh D1 foreign keys: **clean**.
- Negative hierarchy writes: **rejected by D1 triggers**.

The sandbox could not execute Wrangler or the Next production build because those commands were intercepted as unavailable network operations. The migration was independently executed against SQLite with the complete 39-migration chain, and source/type/regression gates passed. GitHub CI remains the authoritative build and Cloudflare/D1 certification boundary.

## Remaining production gate

Before Phase 1 is marked production-certified:

1. publish the implementation commit;
2. pass V2 CI and retirement workflows on that commit;
3. retain a fresh D1 Time Travel recovery point;
4. apply migration `0039` through the retained migration runner;
5. run `scripts/product-consistency/phase1-integrity.sql` against production;
6. confirm all active student-visible rows are mapped or pending in quarantine and foreign keys are clean;
7. verify `/admin/syllabus` read access and one controlled owner resolution flow.

Phase 2 has not been started.
