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
- Cloudflare free-plan bundle optimization that removes unused Next.js OG runtime only when application source does not use it, then minifies the Worker.

Preserved boundaries:

- Phase 7 remains the source of approved student resource attachments.
- Phase 8 ICAI sync remains unchanged.
- Phase 9 planner/revision engine remains unchanged.
- No Phase 11 plans, billing, Razorpay or entitlement schema is introduced.

No new Phase 10 secret or external paid service is required.
