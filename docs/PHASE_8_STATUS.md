# Phase 8 Implementation Status

## Scope
ICAI Daily Update & Verification Engine.

## Current implementation state
Phase 8 frontend/backend/database implementation is present on the Phase 8 branch. Final PR CI, database acceptance cleanup/verification and Cloudflare staging secret/deployment verification must be completed before this phase is closed.

## Implemented frontend
- [x] Responsive `/resources/icai` verified resource browser.
- [x] Level, attempt, subject and resource-type filters.
- [x] Official-source badges, source links, first-seen and last-verified dates.
- [x] Responsive `/updates` feed with attempt-aware student notification preview.
- [x] Responsive `/admin/icai-sync` with permission state, source health, latest run counters, parser/hash observability, manual Run Sync and high-impact review actions.
- [x] Loading, error and empty states for Phase 8 surfaces.
- [x] Desktop/mobile student navigation and desktop/mobile admin navigation.

## Implemented backend/platform
- [x] Official ICAI source registry and source-specific adapter configuration.
- [x] Timeout, retry/backoff, request pacing, ETag/Last-Modified conditional fetch and HTML safety ceiling.
- [x] Official ICAI domain allowlist and metadata-only ingestion policy.
- [x] Canonical SHA-256 hashes and source snapshots.
- [x] Normalized resources, exam attempts/events and subject/attempt mappings.
- [x] Deterministic resource IDs + unique source/URL constraint for duplicate prevention.
- [x] Authoritative-list removal detection preserves historical records with `removed` status.
- [x] Per-source failure isolation preserves last verified data.
- [x] High-impact exam date/time changes enter an auditable review queue before canonical mutation.
- [x] Phase 2 attempt picker now consumes verified `exam_attempts`.
- [x] Protected `/api/cron/icai-sync` and admin-only manual sync/review server actions.
- [x] Cloudflare scheduled handler configured for `30 0 * * *` (00:30 UTC / 06:00 IST), independent of user traffic.
- [x] Sync/review RPCs explicitly executable only by `service_role`.

## V2 database
Applied only to V2 project `wgdhpzbgyjqjlgntibqg`:
- `phase8_icai_sync_engine`
- `phase8_security_hardening`

## Environment/manual setup
Before public staging operation:
- [ ] Add `SUPABASE_SERVICE_ROLE_KEY` to Worker `ca-progress-v2` as a secret (V2 project only).
- [ ] Add a strong random `ICAI_CRON_SECRET` to Worker `ca-progress-v2` as a secret.
- [ ] Deploy merged Phase 8 `main` with the existing manual staging workflow.
- [ ] Confirm the Cloudflare daily Cron Trigger and perform one successful/manual source verification run.

## Quality gate
- [ ] Phase 8 PR CI green.
- [ ] Complete Phase 0–3 + 8 tests green.
- [ ] Next production build green.
- [ ] OpenNext/Cloudflare dry-run green.
- [ ] Database acceptance tests cleaned up and 6/6 Phase 8 criteria recorded.

Do not start Phase 4 until all six Phase 8 acceptance criteria are recorded as passed.
