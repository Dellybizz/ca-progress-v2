# Phase 10 — Community V2 & Collaborative Learning acceptance

Source of truth: CA Progress V2 detailed phased plan. This phase is isolated to the V2 staging project and does not begin Phase 11 billing or entitlements.

## Architecture boundary

- Community is normalized in PostgreSQL. Messages are not stored in a single JSON document.
- Phase 7 approved shared uploads are the only attachment source; Community does not accept uncontrolled file blobs.
- Channel visibility and write authorization are enforced server-side and in RLS/RPCs from profile level/group/subject applicability and app role.
- Browser table access is read-only for Community data; mutations use guarded RPCs.
- Realtime subscribes only to the active channel's messages, reactions and pins.
- Message history uses stable sequence cursor pagination rather than loading all history.
- Moderation actions are auditable and temporary blocks support 1, 8, 24 and 48 hour windows.

## Acceptance 1 — Unread counts are accurate

PASS mapping:
- `channel_read_state.last_read_sequence` stores each user's last consumed sequence per channel.
- `phase10_mark_read` clamps the requested sequence to the actual latest active message and only advances the saved sequence.
- `phase10_list_channels` counts active messages after `last_read_sequence` and excludes the viewer's own messages.
- Channel list renders the returned unread badge.

## Acceptance 2 — Older messages paginate

PASS mapping:
- Community messages have a monotonically increasing `sequence_id` and `(channel_id, sequence_id desc)` index.
- `getCommunityMessagePage` accepts a cursor and queries `sequence_id < cursor` with a bounded page size.
- API exposes `cursor` and the chat has an explicit “Load older messages” control.
- Search remains scoped to the active channel and uses the same cursor contract.

## Acceptance 3 — Unauthorized users cannot write to restricted channels

PASS mapping:
- `phase10_channel_visible_to_user` enforces global/level/subject visibility using completed profile level/group applicability.
- `phase10_can_write_channel` additionally enforces chat blocks and channel `write_policy`.
- Announcements are `moderators` write policy; normal student channels are `members`.
- `phase10_create_message` refuses writes unless `phase10_can_write_channel` passes.
- Authenticated clients have table-level SELECT only; there is no direct insert/update/delete privilege on Community tables.

## Acceptance 4 — Moderator actions are logged

PASS mapping:
- `phase10_moderate` requires moderator/admin/owner/parent_owner role.
- Delete/restore/pin/unpin/block/unblock/report resolution paths all converge on an insert into `moderation_actions`.
- The admin moderation surface shows recent audit actions with role, channel, reason and timestamp.

## Acceptance 5 — Mobile chat occupies the proper viewport without overflow issues

PASS mapping:
- Under 760px the channel detail becomes a dedicated full-width chat rather than a squeezed desktop split pane.
- Chat height is based on `100dvh` minus shell chrome, with `min-height:0` and contained `overflow:hidden`.
- `.phase10-message-scroll` owns vertical scrolling.
- Composer accounts for `env(safe-area-inset-bottom)` and chat descendants are constrained to `max-width:100%`.
- The channel index remains WhatsApp-style on mobile; selecting a channel opens its full chat route.

## Required Phase 10 surfaces

- `/community`
- `/community/[channel]`
- `/admin/community/moderation`
- loading/error/empty/permission states for Community and moderation

## Intentionally deferred

Phase 11 plans, entitlements, billing, Razorpay, storage quotas and paid-feature access rules are not introduced here.
