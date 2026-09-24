# Phase 16 status — native SQLite data layer

Status: Complete

The installed app now opens a native SQLite database before account data is read. Schema version 1 covers configuration, academic catalog, dashboard, progress, planner, study sessions and durable timer state, notes, notifications, resource metadata, community state, synchronization cursors, mutation outbox, conflicts, tombstones and a native-file index.

Every synchronizable row carries stable local/server identity, server version, owner, academic context, local synchronization state and lifecycle timestamps. Repository access is created for one account and every query binds that owner. Removing an account uses foreign-key cascades; wiping all offline data is a separate explicit action.

Migrations are ordered, forward-only and executed transactionally. A recovery checkpoint is taken before and after migration. Android and iOS perform SQLite integrity checks and restore the last checkpoint instead of presenting a blank application after detectable corruption.

The timer and initial dashboard projection render from SQLite and survive process death. Live repository listeners refresh mounted projections after writes. Downloaded resource content is represented by a native filesystem path and checksum; large file bodies are never stored in SQLite. Cache eviction excludes pinned files, pending uploads, and any file referenced by a pending or failed outbox mutation.

## Encryption decision

Phase 16 stores no bearer credentials in SQLite; those remain in Keystore/Keychain from Phase 15. The database is app-sandboxed and iOS receives platform data protection. SQLCipher is not enabled in this build because it adds a separate native cryptographic dependency and key-migration lifecycle. Before a public store release containing private note or community bodies, add SQLCipher with a Keystore/Keychain-wrapped database key, migration/rotation tests, and backup compatibility. This is a store-hardening obligation, not a reason to mix tokens into SQLite.

Phase 17 synchronization is recorded separately in `PHASE_17_STATUS.md`.
