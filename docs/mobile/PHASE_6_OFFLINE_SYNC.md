# Mobile Phase 6 — Offline Synchronization and Conflict Recovery

Baseline: Mobile Phase 5 tree based on production commit `471ade75da025df51fcf98ba6740f400e10b9cae`.

## Implemented

- Retained the owner-isolated IndexedDB stores, write-ahead mutation queue, optimistic projections, storage limits and D1 idempotency receipts.
- Advanced the offline compatibility contract to version 3 while retaining version 2 as the minimum supported migration source.
- Moved offline context and mutation replay transport through the shared `/api/v1` boundary.
- Added Background Sync registration where the browser supports it. The service worker signals open CA Progress clients; the authenticated client remains responsible for replay so credentials and owner checks are never copied into the worker.
- Added a shell-wide count for edits waiting to synchronize and conflicts requiring review.
- A D1 conflict now returns a sanitized comparison containing the original baseline, current cloud fields and saved local edit.
- Added per-edit downloads, a side-by-side comparison and two explicit recovery choices:
  - **Apply my version** rebases only after the student chooses it, then uses the normal idempotent replay path.
  - **Use cloud version** removes the selected local edit and every later edit that directly or transitively depends on it.
- Academic-context conflicts remain fail-closed and cannot be rebased because they belong to a different selection.
- Queue order remains strict: later dependent edits never pass an unresolved edit.

## Safety boundaries

- No conflict is silently resolved and no last-write-wins policy is used.
- Reapplying a local version requires connectivity and an explicit user action.
- Discarding asks for confirmation and identifies dependent-edit removal; a single edit or the full offline store can be exported first.
- Conflict evidence contains only the entity fields already authorized for the signed-in owner and is sanitized before IndexedDB storage.
- A changed account or academic context locks replay. Authentication, billing, admin data, signed URLs and entitlements remain outside offline storage.
- The existing data-free service-worker cache boundary remains unchanged.

## Supported offline mutations

- Chapter progress milestones.
- Planner task creation, editing, completion and deletion.
- Private revision-note creation and editing.
- Focus timer start, pause, resume, finish and discard.

Other actions remain online-only until they receive an entity-specific projection, conflict baseline and D1 replay contract.

## Deferred

- Push notifications and server-triggered background delivery.
- Native background execution and secure-storage plugins: Phase 11.
- App Store and Play Store packaging/submission: Phase 11.
- Production deployment: requires explicit user authorization.
