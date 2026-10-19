# Payment Rules Phase 4 — Storage Warnings and Permanent Cleanup

Baseline: Phase 3 (local `2a328a44`; published `03a68220`).

## Implemented

- All storage-consuming resource uploads and test attachments participate in quota checks and cleanup. New uploads use a fresh entitlement lookup and the normal allowance; the important-file allowance is never extra upload capacity.
- A quota reduction or expiry to Explorer while over quota schedules a seven-day warning period. Further reductions supersede the old cleanup and get a fresh warning period. A verified upgrade providing sufficient capacity, or the student reducing usage sufficiently, clears cleanup and suppresses pending warnings.
- Normal files are deleted least recently opened first. Files with no recorded open history sort first, with upload date and identifier as deterministic tie-breakers. Opening a file as its owner records activity; another student's access to a shared file does not change the owner's order.
- Latest important markings are read at cleanup. Already-uploaded important files can retain up to the new normal allowance plus 10%. Normal files are removed first; largest important files are removed only if the protected allowance is exceeded. Files uploaded after the reduction do not receive the extra protected allowance.
- Existing files remain viewable, downloadable and manageable throughout the warning period. Resource and test-attachment importance mutations enforce ownership. Once irreversible deletion is claimed, its access and markings are locked until the operation is reconciled.
- Persistent warnings show the deadline, usage, affected file count, deletion rules and upgrade option on Resources, Test Archive and Billing. They refresh every 30 seconds and on focus. An authenticated mobile-compatible endpoint exposes the same cleanup state.
- Email warnings are scheduled at creation, three days before deletion and one day before deletion. Durable payloads, provider request keys and acceptance receipts prevent routine replay duplicates. Missing credentials, an unverified email address, missed warning windows or uncertain delivery leave cleanup pending for review; they never release deletion without the required warning receipts.
- Permanent deletion has a durable per-file journal. Each claim rechecks verified allowance, latest importance and object ownership. R2 failure retains metadata for retry. A crash after deleting bytes can settle metadata from object absence, including after a later upgrade, without pretending the deleted bytes were restored. No recovery bin is introduced.
- Storage increases apply immediately; reductions wait until the next paid service boundary. Current administrative overrides and eligible leaderboard storage rewards are respected. Account deletion removes cleanup notices, email payloads, flags and activity records.
- Migration `0090_owner_storage_cleanup.sql` is additive and is included in the retained migration runner. The billing worker receives the existing resource R2 bucket binding and performs bounded maintenance on its five-minute schedule.

## Validation

- Full repository suite: 1,225 passing tests, zero failures.
- 22 storage tests cover ordering, important allowance, both file families, ownership, seven-day timing, warning deduplication, upgraded quota, last-moment upgrades, further reductions, bucket failures, physical-delete/metadata-commit crash recovery, worker leases, provider receipts, uncertain email delivery, missed reminders, deferred reductions and leaderboard rewards.
- TypeScript, ESLint, production build and whitespace checks pass.
- R2 and email operations are mocked. No production student file was deleted and no live warning email was sent during implementation.

## Release requirements

Configure these secrets/settings on **ca-progress-v2-billing** before enabling live cleanup:

- `RESEND_API_KEY` — a server-side sending key.
- `STORAGE_CLEANUP_EMAIL_FROM` — a sender on a verified domain.
- `USER_RESOURCES_R2` — the configured `ca-progress-v2-staging-user-resources` bucket, already specified in the billing Wrangler configuration.

Validate actual sender delivery, verified student email selection, R2 access and complete migration replay in Phase 6. `sent` records provider acceptance for delivery, not a guarantee of mailbox receipt. The provider retains idempotency keys for 24 hours; ambiguous attempts beyond that window require review rather than an unsafe resend. A warning whose initial dispatch window was missed requires a newly established warning timeline before deletion can proceed; do not simply mark its row sent.

Each run scans up to 30 owners, deletes at most 20 files per owner and processes up to 30 due emails. Exact execution can follow the deadline on the next worker run. Legacy or mismatched bucket keys require review and are never deleted speculatively. Historical open dates that were never recorded cannot be reconstructed.

Phase 5 (recurring gifts) and Phase 6 (live verification/release) remain pending. This phase is published as implementation code; it is not a live deployment.

Provider references reviewed:
- https://resend.com/changelog/idempotency-keys
- https://github.com/resend/resend-openapi/blob/main/resend.yaml
