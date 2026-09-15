# Phase 7 — Guest-to-account preservation

Implemented on top of the Phase 6 offline branch.

- A secure, same-site, HTTP-only cookie supplies a stable browser guest identifier.
- IndexedDB rows remain owner-namespaced for both guests and accounts.
- Sign-in prepares a pre-migration summary before asking for confirmation.
- Account snapshots win conflicts; unique guest records are merged by stable ID.
- Guest mutations retain their client IDs and idempotency keys and replay through the Phase 6 atomic receipt path.
- D1 records resumable migration sessions, registered mutation IDs and append-only audit events.
- Completion is rejected while a registered mutation lacks an account-owned receipt or any conflict remains.
- Guest storage is cleared only after the server verifies completion.
- Interrupted work is retained in account migration metadata and resumes after reload.

Phase 8 has not been started.
