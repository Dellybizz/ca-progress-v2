# CA Mentor / Think Engine — Implementation Record

## Phase 1 — Mentor Intelligence Foundation

Status: **IMPLEMENTED — validation pending final branch CI**

### Scope completed

- Reused the existing CA Progress V2 academic source of truth (`course_levels`, `course_groups`, `subjects`, `syllabus_versions`, `chapters`, `topics`) instead of creating a parallel academic catalog.
- Reused the existing verified attempt / ICAI source-of-truth layer (`exam_attempts`, `icai_resources`) instead of creating duplicate attempt data.
- Added versioned Mentor model contracts for exam intelligence, preparation intelligence, student modelling, forecasts and source weighting.
- Added Mentor intelligence source and evidence records with provenance, attempt/academic references, verification, confidence, mapping quality, evidence quality and privacy-safe publication controls.
- Added preprocessed Exam Intelligence and Learning Intelligence storage contracts.
- Added the shared confidence scale: `insufficient`, `experimental`, `low`, `medium`, `high`.
- Added metric-specific personalisation rules and per-user eligibility state.
- Added explainable recommendation records with provenance and evidence references.
- Added future source categories for trusted faculty, community, internal outcomes, verified high performers and verified AIR records without activating their later-phase weighting/ranking behaviour.

### Cold-start guarantee

A new user has no eligible personalised metric by default. Personalised output is readable only after the related metric reaches `personalized` or `high_confidence` state.

`unavailable`, `collecting_data` and `early_estimate` remain non-personalised states. The application can continue to return preprocessed/baseline intelligence while personal data is still collecting.

Eligibility is metric-specific. Evidence sufficient for a pace estimate does not automatically unlock weak-area, retention, forecast or similar-student intelligence.

The initial foundation rules intentionally require a meaningful cohort sample before `similar_students` can unlock. These thresholds are foundation defaults and can be versioned/refined in later Mentor phases.

### Security / privacy boundary

- All Mentor foundation tables use RLS.
- Public/preprocessed source and evidence rows must be explicitly published and cannot expose a contributor user ID.
- Client roles receive no direct write access to Mentor intelligence foundation tables.
- Personal eligibility is readable only by its owning user.
- Personalised/cohort recommendation explanations are gated by the metric-specific eligibility function.
- Third-party and future internal source categories default to `untrusted`, authority weight `0`, and `internal` visibility.

### Files

- `supabase/migrations/20260901160000_mentor_phase1_foundation.sql`
- `lib/mentor/types.ts`
- `lib/mentor/eligibility.ts`
- `tests/mentor-phase1-schema.test.mjs`
- `tests/mentor-phase1-eligibility.test.mjs`

### Definition-of-done mapping

- Database/schema/contracts support later Mentor intelligence layers: **done**
- Attempts and academic structures integrated without duplication: **done**
- Intelligence sources/evidence/model versions/confidence contracts: **done**
- Metric-specific personalisation eligibility: **done**
- Newly onboarded users protected from fake personalisation: **done**
- Future Top Performer / Study Time / Consistency / verified high-score / AIR compatibility represented without ranking UI: **done**
- Third-party sources trusted by default: **no — deliberately zero-trust**
- Existing CA Progress behaviour changed by Phase 1: **no**
- Tests added for schema boundaries and cold-start eligibility: **done**
- Typecheck / lint / tests / production build: **pending final branch CI result**

## Phase 2 — Academic Catalog Normalisation

Status: **NOT STARTED**

Phase 1 deliberately does not implement Phase 2 alias normalisation, syllabus predecessor/successor migration work, external source ingestion, intelligence scoring, faculty/community weighting, internal outcome learning, cohort recommendations, leaderboards or ranking UI.
