# Resources and Notes — Eight-Phase Implementation

Accepted delivery grouping: 14 October 2026. This replaces the 24-phase delivery numbering with **Phase 0–7**, preserving all 65 audit entries and their acceptance requirements. The [detailed research/audit](RESOURCE_NOTES_AUDIT_AND_PLAN_2026-10-14.md) remains the feature specification. Prior security plan P00–P33 policies continue to apply.

| Phase | Scope | Original roadmap mapping |
|---|---|---|
| 0 — Audit and foundations | Reproduce baseline, editor evaluation, contracts, policy matrix, migration/rollback design | RN00, RN02 |
| 1 — Reliable file manager | Current save/upload bug repairs, folders/notebooks, complete search, saved views, bulk operations, Trash and restore | RN01, RN03, RN04, RN07 |
| 2 — Uploads and previews | Durable/resumable transfers, byte inspection, quotas, processing jobs, thumbnails and previews | RN05–06 |
| 3 — Professional typed notes | Structured editor, typography, rich blocks/tables/media/math, references and page/print layout | RN09, RN11–13 |
| 4 — Offline and history | Browser/native persistence and jobs, autosave/recovery, incremental versions, conflicts and multi-device sync | RN08, RN10 |
| 5 — Handwriting and PDFs | Notebook/stylus core, advanced ink/object manipulation, PDF reading/annotation and split view | RN14–16 |
| 6 — Study tools and sharing | CA templates, backlinks/cards, import/export/backup, protected sharing and device/security lifecycle | RN17–19 |
| 7 — Advanced features and release | OCR/recognition, audio/transcription, comments/coediting, optional AI, performance/security/web/APK certification and rollout | RN20–23 |

These are delivery groups, not permission to postpone necessary safeguards. Phase 3 starts with the local-draft contract from Phase 4 and cannot release until it is durable. Restricted content cannot enter Phase 2/5 preview or processing until Phase 6's protected delivery enforcement passes. Existing immutable-source and no-export policies apply from the first change. Accessibility, old-client compatibility and native parity are checked in every affected phase.

Separate checkpoints remain for D1/R2 provisioning, isolated processing, key management, native vault/OS jobs, delta history, OCR/transcription providers and collaborative transport. Optional AI and coediting must not block reliable personal writing. Core handwriting is required scope.

## Phase 0 outputs

- [Current status and editor decision](phase0/PHASE_0_STATUS.md).
- [Versioned contracts](phase0/WORKSPACE_CONTRACTS.md).
- [Migration and rollback design](phase0/MIGRATION_AND_ROLLBACK.md).
- [65-entry capability-to-phase matrix](phase0/capability-matrix.json).
- [Reproducible current-system observations](phase0/current-system-baseline.json).
- [Isolated editor model benchmark](phase0/editor-model-benchmark.json).

Implementation command names in later conversation refer to these eight phases. This does not relabel or reopen completed onboarding/payment phases.

## Current progress — 15 October 2026

- Phase 0: complete.
- Phase 1: implemented and deployed; [production evidence](phase1/PHASE_1_STATUS.md).
- Phase 2: implemented and deployed; [scope, validation and production evidence](phase2/PHASE_2_STATUS.md).
- Phase 3: next — professional typed notes, including its required durable local-draft foundation.
- Phases 4–7: planned; their remaining native/background, history, handwriting, protected-sharing and certification guarantees are not claimed by the Phase 2 web release.
