# Product Consistency Phase 6 — Offline browser storage

Status: implementation continued; **not certified complete**. Rollout is disabled by default.

Base: `phase-12-operations-admin-platform` at `ebfc37e26c2d4240d2e65874fa1ca03e4bf6666b`.
The previous uncommitted Phase 6 draft was reconciled with this HEAD. The dashboard countdown and canonical mobile-navigation changes are preserved.

## Implemented

- IndexedDB schema v2: owner-indexed snapshots, pending mutations, explicit files and metadata. Legacy v1 snapshots/files are retained; legacy edits without safe baselines remain blocked and exportable.
- Dashboard, syllabus, progress, study, planner, notes and resource metadata snapshots. A public, static `/offline` shell renders owner-scoped cached models through the existing components. Own note detail URLs can open cached notes for editing.
- Durable write-ahead edits, stable client IDs, FIFO replay, Web Locks, exponential backoff, conflict/blocked states and last-successful-sync status. Idle or blocked queues do not poll the server.
- `/api/offline/mutations` authenticates the current owner and academic context, invokes the existing validated routes, stages D1 writes, and commits a unique receipt, optimistic guard, domain changes and response together. Replays return the recorded response. Dependent edits refer to the previous entity receipt; intervening changes produce a conflict.
- Timer events retain their actual occurrence times (bounded to seven days, with existing session safety limits), paused duration and Today-plan association. Progress revision scheduling runs after the atomic domain commit.
- The service worker caches only the data-free offline shell and public Next build assets. Personalized HTML, RSC, API responses, arbitrary images, admin/auth/billing surfaces and signed file URLs are excluded. Authentication navigation locks the active local identity; cross-tab changes use BroadcastChannel.
- Settings controls expose connectivity, pending errors, synchronization, export, explicit saved-file retrieval/removal and confirmed per-owner clearing. Derived snapshots can be evicted; unsynchronized edits and explicit files are retained. Downloads are limited to 50 MB each / 200 MB per owner; queued edits have a 25 MB / 1,000-edit admission limit.
- Existing online request behavior remains active unless `NEXT_PUBLIC_OFFLINE_ENABLED=true` is set at build time. Keep it disabled until the remaining gate passes.

## Important files

- `lib/offline/`: database, queue, model projections, atomic staging and request-local transaction context.
- `components/offline/`, `app/offline/page.tsx`, `public/sw.js`: cached screens, runtime, controls and downloads.
- `app/api/offline/context/route.ts`, `app/api/offline/mutations/route.ts`: identity validation and atomic replay.
- `d1/migrations/0040_product_consistency_phase6_offline.sql`: additive receipt table; included in retained migration application/validation.
- Student page snapshot hooks and progress/planner/note/timer integration; shared D1 getters accept the scoped offline transaction.
- `tests/product-consistency-phase6.test.mjs` and `scripts/product-consistency/phase6-browser-check.mjs`.

## Validation

- Full repository suite: **582 / 582 passed**.
- Phase 6 executable SQLite/projection/endpoint tests: **5 / 5 passed**, covering receipt replay, atomic rollback, stale record rejection, owner mismatch, dependent edits, projection isolation and timer pause accounting.
- Focused regression set after migration/navigation contract corrections: **45 / 45 passed**.
- TypeScript and repository lint: passed.
- Next production build with `NEXT_PUBLIC_OFFLINE_ENABLED=true`: passed; `/offline` is statically generated.
- Migration 0040 applied twice to an isolated SQLite fixture: passed without modifying existing records. No production migration was run.

## Remaining certification gate

Chromium is absent from this environment. The browser script could not launch, and the official Playwright Chromium download timed out. Therefore real IndexedDB restart, quota-pressure, schema-upgrade, multi-tab reconnect and service-worker navigation checks are **not claimed as passed**. The script contains these checks, but still needs execution in an environment with Chromium. Also verify the real cached student views and authorized R2 downloads there before enabling rollout.

Run `node scripts/product-consistency/phase6-browser-check.mjs` with Playwright/Chromium available. `CHROMIUM_EXECUTABLE_PATH` can point to an existing Chromium executable. Run the application with the flag enabled against a local/test D1 database containing migration 0040 for the integrated student journeys. Export and review conflicts; do not silently overwrite server records or discard queued work.

No deployment, production queries, production data changes or merge to `main` were performed. The work is saved separately because a push to the existing working branch triggers automatic deployment.

Next phase: Phase 7 — guest-to-account preservation. Not started.
