# Student route and data matrix

Policy meanings: **core** renders and mutates from SQLite/outbox; **snapshot** renders cached data but some actions require network; **online** has an intentional connected boundary; **excluded** is not shipped in the student native navigation. Operation exceptions are explicit below.

| Student route(s) | Policy | Server data authority | R2 / entitlement | Mutation and sync contract | Planned cutover |
|---|---|---|---|---|---|
| `/dashboard`, `/dashboard/exam` | core | `dashboard_events`, `daily_plans`, `daily_plan_items`, `chapter_progress`, `study_sessions`, academic catalog | entitlement shapes feature cards | bootstrap/delta; dashboard events append | 16–17 |
| `/planner`, `/planner/today`, `/calendar` | core | `planner_task_phase8`, `planner_events`, `daily_plans`, `daily_plan_items`, `user_calendar_events` | plan limits checked server-side | versioned task/event outbox; planner delta | 16–17 |
| `/goals`, `/planner/revision-settings` | core | `goals`, `planner_goal_phase8`, `revision_rules`, `revision_due_items` | plan feature/limits | versioned goal/rule writes; journal | 16–17 |
| `/progress`, `/syllabus`, `/subjects/[subjectSlug]`, `/subjects/[subjectSlug]/progress` | core | `chapter_progress`, `progress_events`, `subjects`, `chapters`, `topics`, syllabus/catalog tables | feature visibility only | idempotent progress mutations; academic + progress cursors | 16–17 |
| `/study` | core | `study_timer_state`, `study_timer_phase3`, `study_session_phase3`, `study_sessions`, doubts | entitlement may limit advanced tools | timer actions become durable event/outbox operations | 16–17 |
| `/notes`, `/notes/[id]` | core | `notes`, `note_revision_metadata`, tags and resource links | note/file quotas | client IDs, versions, tombstones; explicit edit conflict | 16–17 |
| `/community`, `/community/[channel]` | core | `community_channels`, `community_messages`, reactions, reads, follows, saved/pinned/message reports | server gates channel access | channel sequence delta + typed realtime + idempotent send/reaction/read | 18 |
| `/chapters/[chapterId]` | snapshot | chapter workspace/preferences/links plus academic and progress tables | linked protected resources checked online | cached composite; writes delegated to core domains | 17 |
| `/activity` | snapshot | `planner_events`, `progress_events`, `exam_events`, study events | none beyond source feature | append-only activity delta; no direct mutation | 17 |
| `/analytics`, `/analytics/forecast` | snapshot | `analytics_daily_rollups`, `forecast_snapshots`, progress/study/planner summaries | Pro analytics checked on server | cached last computation; refresh/recompute connected | 17, 20 |
| `/tests` | snapshot | `test_attempts`, stage records, mistakes, attachment maps | attachment/advanced-analysis entitlement | local draft where safe; final submit and grading online | 17, 20 |
| `/resources`, `/resources/[id]`, `/resources/[id]/view` | snapshot | `uploaded_resources`, moderation, subject/attempt maps, `r2_upload_intents` | R2 and resource quota/access | metadata delta; download cache; upload/delete online and resumable | 19 |
| `/resources/icai`, `/updates` | snapshot | `icai_resources`, versions, mappings, `icai_change_events` | R2/provider URL may require online refresh | catalog delta; file download is explicit | 19 |
| `/settings`, `/settings/profile` | core | `profiles`, `user_preferences`, notification preferences, sessions | account plan displayed from server cache | profile/preferences outbox; session revoke and deletion online | 15–17 |
| `/study-buddy`, `/study-profile/[userId]` | snapshot | study profiles, buddies, relationships, goals, nudges, safety/reports | feature access checked server-side | cache relationships; requests/reports require connection | 20 |
| `/feature-tour` | snapshot | `onboarding_experience`, local completion state | may be plan-aware | completion queues; media bundled/cached | 14, 17 |
| `/billing`, `/pricing` | snapshot | subscriptions, plans, policy publications, mappings, entitlements | billing is the authority | display last status; purchase/change/cancel/restore are online-only | 20 |
| login, OAuth, device sessions | online | identities, sessions, auth events | n/a | PKCE/exchange/rotation/revocation; secure token storage | 15 |
| extended search | online with cached recent results | domain-specific server indexes | enforce access per result | query online; no offline global-index promise | 20 |
| `/admin/**`, webhook and reconciliation surfaces | excluded | administrative/billing/ICAI operational tables | privileged roles | website/worker only; never import into mobile | permanent |

## API boundary inventory

The existing compatibility surface uses `/api/v1/:path*` with a fallback rewrite to `/api/:path*`. Native sync must add explicit versioned contracts for bootstrap, per-domain pull, idempotent push, file authorization and community recovery. It must not scrape Next.js page models.

| Domain | Existing endpoint families | Required local-first evolution |
|---|---|---|
| Progress/academic | `/api/v1/progress`, bootstrap/capabilities | progress mutations plus academic/progress cursors |
| Planner/goals/calendar | `/api/v1/planner/tasks`, today, calendar, goals, revision | versioned entities, tombstones and planner cursor |
| Notes | `/api/v1/notes`, note item/export | versions, tombstones, attachment references and cursor |
| Study | `/api/v1/study/timer`, reflection/session routes | immutable session events and cursor |
| Community | messages/options/read/reactions/realtime | sequence delta, typed events and gap recovery |
| Resources | upload intent/access/download and ICAI query | metadata cursor, resumable transfer, offline manifest |
| Identity/settings | session/profile/account deletion/push | native bearer lifecycle and preference cursor |
| Billing | plans/subscriptions/payment actions | read-only cached entitlement envelope; connected actions |

## Local entity ownership

Every local-first row carries `account_id`, stable server ID or client ID, entity version, sync state and timestamps. Account-global academic catalog rows live in a separately versioned read-only partition. Files store only metadata and an app-private path; signed R2 URLs are transient. Entitlement snapshots carry expiry/staleness metadata and can never mint access locally.

## Current mismatch retained as evidence

The Phase 6 prototype queues only the unversioned keys `/api/progress`, `/api/planner/tasks`, `/api/notes`, and `/api/study/timer`, while current UI calls their `/api/v1/...` forms. The server fallback rewrite does not help client-side `snapshotKind` matching. Phase 16 replaces this string-routing prototype with typed repositories and outbox operations; it must not be patched ad hoc into the native architecture.
