# Phase 17 — Server Change Journal and Synchronization Engine

Status: Complete

Phase 17 adds a retained D1 migration and authenticated native synchronization API for deterministic bootstrap, monotonic incremental pull, and idempotent ordered push. Canonical offline-capable mutations now commit their domain writes, receipt, entity version and journal record in one D1 batch.

The native coordinator hydrates SQLite before network work, resumes bootstrap safely, applies pull pages and cursor advancement in one transaction, preserves mutation dependencies, uses exponential backoff with jitter, and exposes updating, offline, pending, conflict and failed states. Account and academic-context keys scope every server and client operation.

Verification covers process interruption/cursor safety, network failure, duplicate mutation IDs, dependency/reordered results, stale baselines, tombstones, account/context switching, bounded indexed queries and all required conflict-policy declarations.

Phase 18 is recorded separately in `PHASE_18_STATUS.md`.
