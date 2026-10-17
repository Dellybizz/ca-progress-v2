# Native Local-First Phase 19 Status

Phase 19 implements the Telegram-style Community data path without starting Phase 20.

## Completed

- SQLite schema v4 stores channel sequence cursors, drafts, ordered messages, reactions, pins, read state, delivery state, attachments metadata, event dedupe records and moderation tombstones.
- Cached channels and messages render before any network request.
- Mobile APIs expose authorized `afterSequence` reconciliation and `beforeSequence` pagination with bounded pages.
- Outgoing messages use durable client IDs and optimistic `sending`, `sent`, `failed` and `retrying` states.
- The shared realtime contract carries typed persistent events and ephemeral typing/presence events.
- The Durable Object uses WebSocket hibernation handlers; D1 remains authoritative.
- Reconnect uses sequence deltas and a five-second bounded polling fallback.
- Retention pruning keeps recent history while retaining deleted-message tombstones.

## Verification gates

The automated Phase 19 gate covers ordered/deduplicated events, pagination, optimistic durability, deletion, local-first rendering, reconnect fallback and retention. Physical two-device and process-kill release checks remain part of store-candidate certification.

Phase 20 has not been started.
