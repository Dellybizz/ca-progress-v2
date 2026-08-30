# Phase 3 Implementation Status

## Scope
CA Syllabus & Academic Data Engine.

## Implementation status

**Phase 3 implementation is feature-complete on the phase branch; final CI/acceptance verification is pending.**

## Implemented frontend
- [x] Responsive `/syllabus` explorer with Foundation / Intermediate / Final tabs.
- [x] Group filters, current/applicable-attempt filter and verified-source indicator.
- [x] Subject cards with expandable chapter/unit hierarchy.
- [x] Accounting Standards and special units represented through normalized topic/chapter kinds rather than page-specific hacks.
- [x] `/subjects/[subjectSlug]` with progress-ready stable chapter/topic identifiers and explicit Phase 5 progress deferral.
- [x] Debounced subject/chapter/topic search backed by `/api/academic/search`.
- [x] Read-only `/admin/syllabus` version preview; editing intentionally remains unavailable in Phase 3.
- [x] Syllabus added to desktop navigation, mobile More navigation and admin navigation.
- [x] Dedicated loading and error boundaries plus empty states.

## Implemented backend
- [x] Typed academic domain model and request-scoped query service.
- [x] Normalized `course_levels`, `course_groups`, `subjects`, `syllabus_versions`, `chapters`, `topics`, and `attempt_syllabus_map` schema.
- [x] Stable immutable text identifiers and restrictive foreign keys for history safety.
- [x] `effective_from`, `effective_to`, status and `supersedes_version_id` versioning contract.
- [x] Public read-only RLS policies for reference metadata; all client writes revoked.
- [x] Service-only `academic_change_events` audit table.
- [x] Search/filter indexes for level/group/attempt/version/title lookups.
- [x] Phase 2 onboarding/profile attempt picker now reads Phase 3 attempt applicability instead of the placeholder setting.

## V2 staging database
Applied migration: `phase3_academic_engine`.

Verified staging row counts after import:
- 3 levels
- 5 groups
- 16 subjects
- 17 syllabus versions
- 264 chapters/special units
- 52 indexed topics/special components
- 43 attempt-version mappings

The 17 versions include a historical Foundation Business Laws version plus the current version that supersedes it; historical chapter/topic rows remain present.

## Source provenance
See `docs/ACADEMIC_DATA_SOURCES.md`. Academic structure was manually verified against official ICAI / Board of Studies sources on 30 August 2026. Phase 3 stores structure metadata and official-source links only, not ICAI study-material body content.

## Environment/manual setup
- [x] No new secrets or provider-dashboard setup required.
- [x] Existing V2 Supabase public URL/publishable key remain the only required academic runtime configuration.
- [x] Cloudflare staging version marker advanced to `phase-3`.

## CI verification
- [ ] dependency install
- [ ] TypeScript
- [ ] ESLint
- [ ] complete Phase 0 + 1 + 2 + 3 test suite
- [ ] Next.js production build
- [ ] OpenNext / Cloudflare dry-run

## Acceptance gate
- [x] Foundation, Intermediate and Final coexist in the same normalized catalog.
- [x] A syllabus version can be superseded without deleting historical structure.
- [x] Academic query service returns subjects only for the selected level/group/attempt mapping.
- [x] Syllabus arrays are not hardcoded in page components; pages consume the typed DB query service.
- [ ] Final branch CI is green.
- [ ] Post-merge main CI/staging verification is green.

**Do not start the next phase until this document records a green final CI and Phase 3 is explicitly closed.**
