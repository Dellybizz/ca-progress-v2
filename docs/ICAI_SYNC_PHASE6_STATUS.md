# ICAI Sync Phase 6 — Incremental Item Processing

Phase 6 makes repeated ICAI synchronization incremental. It preserves one normalized official dataset for every student while avoiding repeated parsing and database writes for unchanged items.

## Implemented

- Durable item-level ETag, Last-Modified and content-hash state.
- Conditional requests and a no-parse path for HTTP 304 or identical HTML.
- Failure-specific retry state with exponential backoff bounded at 24 hours.
- Explicit administrator retries bypass automatic backoff.
- Incremental/partial payloads are never treated as authoritative listings and therefore cannot cause destructive removals.
- Runs containing only unchanged or deferred items close safely without rewriting canonical resources.
- Admin run summaries show unchanged and deferred item counts as incremental savings.
- Additive, idempotent D1 migration `0029_icai_sync_incremental_items.sql` is applied before Worker deployment.
- Phase 6 is a focused gate in V2 CI, retirement closure and deployment.

## Local verification

- Focused ICAI Phase 1–6 tests: **29/29 passed**.
- Complete repository tests: **474/474 passed**.
- Typecheck: passed.
- Lint: passed.

Authoritative final-SHA workflow evidence remains required before operational closure. Production deployment and `main` merge are outside this branch.
