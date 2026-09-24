# Native Local-First Phase 20 Status

Phase 20 completes the non-text native lifecycle without starting Phase 21.

## Completed

- SQLite schema v5 stores owner-bound resource metadata, hashes, MIME types, transfer state, offline file references, notification records and device registrations.
- A native Android/iOS file-vault plugin stores selected files under private account directories, writes atomically and verifies SHA-256 integrity.
- Resource metadata and notifications open from SQLite before network recovery.
- Signed R2 access is requested only when a transfer starts and is never persisted as a file identifier.
- Direct R2 uploads retain server-side quota reservations, progress, cancellation, expiry and idempotent completion.
- Interrupted transfers remain bounded recovery records; foreground launch, resume and reconnect recover missed work.
- Native push registration is device/account bound, encrypted at rest when configured, used only as an invalidation hint, and revoked during logout or account deletion.
- Cache eviction excludes pinned files, pending uploads and mutation dependencies.

## Release boundary

Operating-system background opportunities are optional. Correctness always recovers in the foreground. Production push delivery remains fail-closed until the platform provider and `NATIVE_PUSH_TOKEN_KEY` are configured.

Phase 21 has not been started.
