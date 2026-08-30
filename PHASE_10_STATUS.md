# CA Progress V2 Phase 10 Status

Phase 10: **Community V2 & Collaborative Learning**

Implemented in isolated CA Progress V2 only:

- CA-specific global, level and subject channels;
- normalized messages, replies, reactions, read state and pinned messages;
- accurate unread counts from per-channel last-read sequence;
- stable cursor pagination for older messages and active-channel search;
- active-channel-only Supabase Realtime subscriptions;
- mentions and mention/reply/announcement notification rows;
- approved Phase 7 shared-upload references as Community attachments;
- server-side channel visibility/write authorization by academic selection and role;
- message length, rate-limit and duplicate-spam protections;
- reports, temporary chat blocks and contextual moderator controls;
- auditable moderator action log;
- responsive desktop split chat and mobile full-viewport WhatsApp-style experience;
- `/community`, `/community/[channel]`, `/admin/community/moderation` plus loading/error/empty/permission states;
- covering indexes for Phase 10 foreign-key lookup paths.

Cloudflare deployment hardening introduced while closing Phase 10:

- the user-facing Next.js/OpenNext Worker remains `ca-progress-v2`;
- the heavy Phase 8 ICAI parser/scheduled synchronization engine now runs in the private internal Worker `ca-progress-v2-icai-sync`;
- the web Worker calls it through the `ICAI_SYNC_SERVICE` Cloudflare Service Binding rather than bundling the parser into the user-facing Worker;
- `ca-progress-v2-icai-sync` has `workers_dev=false` and no public route;
- scheduled ICAI work goes directly from the main Worker cron handler to the service binding;
- manual Phase 8 admin sync keeps the same application API but delegates to the internal Worker;
- the existing unused Next.js OG runtime is stripped only when repository tests prove the application does not use `next/og` or `ImageResponse`;
- Cloudflare Workers are minified;
- CI enforces compressed-size budgets of 2.70 MiB for the web Worker and 1.50 MiB for the ICAI internal Worker, leaving headroom below platform hard limits;
- deployment order is internal ICAI Worker first, web Worker second, so the Service Binding target exists before the caller deploys.

Verified against the V2 database:

- all Phase 10 Community tables have RLS enabled;
- authenticated table access is SELECT-only; INSERT/UPDATE/DELETE are not granted directly;
- Community Realtime publication contains messages, reactions, pins and notifications;
- a transactional smoke test verified unread 0 → 1 → 0 behavior, restricted student writes, and moderator audit logging, then rolled back all smoke data;
- Supabase performance advisor no longer reports unindexed foreign keys for Phase 10 tables.

Preserved boundaries:

- Phase 7 remains the source of approved student resource attachments.
- Phase 8 ICAI data model, parser behavior, validation, review gate and sync semantics are preserved; only heavy execution moves behind an internal Worker boundary.
- Phase 9 planner/revision engine remains unchanged.
- No Phase 11 plans, billing, Razorpay or entitlement schema is introduced.

No new Phase 10 secret or external paid service is required. The internal ICAI Worker receives the already-required server runtime only over the private Service Binding invocation and is not exposed as a public endpoint.
