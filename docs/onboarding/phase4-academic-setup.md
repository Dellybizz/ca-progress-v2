# Onboarding Phase 4 — versioned academic setup

## Web flow

`/onboarding` now uses the shared design outside the public marketing shell. The screens are introduction, CA level, verified target attempt, groups (skipped for Foundation), preparation stage, illustrative progress introduction, support preferences and daily study goal. A basic read-only summary preserves a functional finish; editable review is Phase 5.

`/onboarding-preview` uses the same components and live verified attempt catalog, clearly labels every screen as a design preview, and never sends saves or completion requests. The preview can be used without signing in.

Level changes clear dependent attempt/group choices. Attempt choices come from the current catalog; unavailable groups are disabled and also rejected by the server. Foundation uses `not_applicable` internally but never visits the group screen. Retired catalog choices in an existing saved draft move the student back to the affected choice without erasing unrelated preferences.

Preparation is context, not invented historical progress. Progress examples are explicitly illustrative. Support preferences may contain progress, planning, notes/materials and consistency; they grant no paid entitlements. Students may skip preferences.

Daily presets are 60, 120 and 240 minutes. Custom goals use the existing 15–720 whole-minute policy. Set later keeps the current profile goal, including a null/unset goal. A pre-existing non-preset goal is offered as an explicit keep choice; saving other setup choices never replaces it with a default.

## Versioned persistence and compatibility

Migration 0094 adds account-scoped `onboarding_setup` rows, schema version 2, semantic step keys, validated JSON, revision numbers and completion metadata. It does not modify existing profiles, preparation state, progress, billing or study history.

The existing `/api/v1/onboarding` transport accepts version 2 alongside legacy draft/complete requests. Legacy numeric 1–4 resumptions are translated into the new flow; a missing prerequisite always takes precedence over a later saved step. Existing preparation and goal values are reused. The old four-step component/API contract is retained for compatibility; it is no longer the active web setup UI.

Version 2 requires the posted owner to match the authenticated account; it never trusts a posted user ID to select the write target. Draft saves use compare-and-swap revisions and reject stale tabs/devices. Back changes the local screen; Continue saves the confirmed draft/step. Drafts do not change canonical academic profile fields until completion.

Completion revalidates the live academic mapping, then atomically writes the draft, profile choices, preparation and completion marker. Failed batches roll back. Completed accounts are not re-onboarded; duplicate completion does not overwrite their records. Explicit new goals update the profile; keep/set-later reads and preserves the current goal inside the transaction.

## Undecided attempt

Not decided yet stores a null catalog key and an explicit tentative choice. No placeholder attempt ID, subject scope or syllabus records are created. Students can finish general setup, but the academic context remains `setup`, with empty subjects/groups and no selection. Subject-specific reads/writes remain guarded by the existing context checks. Profile’s validated attempt selection later enables a real academic context; no attempt-specific initialization is performed by setup.

## Native/offline boundary

`NativeAcademicSetup` is a portable adapter for the same local screen components and bundled SVG paths. Bundle tests reject Next/server dependencies and remote asset fetching. Phase 6 connects this adapter to the native entry point, cached catalog and installation/account draft handoff. This phase does not claim persistent offline drafts, background synchronization or an installable APK. Until then, web save/finish controls require a connection and never show false synced/completed state offline.

## Validation and release

Tests cover actual level/group mappings, Foundation skip, tentative attempts, unknown fields/support keys, goal limits, legacy resume, catalog withdrawal, account isolation, stale revisions, completion rollback, preserved goals/history and portable UI semantics. Local CI passed all 1,270 tests, TypeScript, ESLint and the production build. The generated Worker measured approximately 3.324 MiB compressed. Release smoke checks include the public preview and owner-mismatch rejection in addition to the existing account safeguards.

The web Worker budget is 3.75 MiB (previously 3.35), using the owner’s permission for modest additional paid-plan headroom. This remains a rejecting build-size guard; it is not a storage quota or a paid-plan upgrade. No framework minification experiments are included. Billing/ICAI budgets are unchanged.
