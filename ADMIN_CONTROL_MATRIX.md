# CA Progress V2 — Admin Control Matrix

Status: Phase 0 production contract  
Baseline branch: `phase-12-operations-admin-platform`  
Baseline commit: `53681b85250c293cd15e7c17015e8375851e6d84`  
Baseline date: 2026-09-08

This document is the canonical inventory of product behavior that the CA Progress Owner/Admin platform may need to observe or control. It is intentionally broader than the current admin UI. A row marked **Missing** is not an implementation defect by itself; it is a Phase 0 contract for a later phase.

## Control philosophy

The Owner should be able to operate the product without routine D1/R2/source-code edits, but the admin system must not become a raw database editor. Controls must be typed, validated, server-authorized, auditable, privacy-aware and reversible where practical.

Control states used below:

- **Operational** — UI is wired to a backend mutation/read path in the current branch.
- **Read-only** — admin UI reads live data but intentionally does not mutate it.
- **API-only** — privileged backend functionality exists without a complete admin UI.
- **Partial** — useful functionality exists but important operational controls are missing.
- **Missing** — no dedicated owner/admin control exists.
- **Code-owned** — should intentionally remain enforced by trusted code/infrastructure rather than ordinary admin configuration.

Risk levels:

- **L0** — read-only.
- **L1** — normal reversible configuration.
- **L2** — user-affecting mutation.
- **L3** — financial, security, publishing or platform-wide policy mutation.
- **L4** — destructive/recovery/ownership operation.

## Product and operations matrix

| Domain | Student surface / canonical implementation | Current source of truth | Current admin state | Required owner/admin control | Target capability | Risk | Audit / recovery | Target phase |
|---|---|---|---|---|---|---:|---|---:|
| Admin overview | `/admin` | `components/mock/product-preview.tsx` | **Missing** — current page is a preview | Real command center: users, study, moderation, billing, jobs, ICAI, health, alerts | `admin.dashboard.read` | L0 | Read telemetry only | 2 |
| Users | auth/profile/account services; `app_users`, `profiles` | D1 stable application user ID | **Missing** | Search/filter, account state, academic profile, product activity summary, plan, storage, moderation, security, audit | `users.read` | L0 | Read access logged for sensitive support views where appropriate | 3 |
| Account suspension | `app_users.account_state` | D1 | **Missing** | Suspend/unsuspend with reason and confirmation | `users.suspend` | L2 | Immutable admin event; reversible | 3 |
| Sessions | Cloudflare session runtime; `sessions` | D1 | **Missing** | View safe session metadata, revoke one/all sessions | `users.sessions.revoke` | L2 | Audit; idempotent revocation | 3 |
| Onboarding/profile reset | onboarding/profile APIs | D1 `profiles` | **Missing** | Reset onboarding safely without deleting unrelated history | `users.onboarding.reset` | L2 | Reason + before/after + audit | 3 |
| Staff / roles | `app_users.role` | trusted D1 role projection | **Missing** | Promote/demote, scope staff, inspect staff audit | `staff.manage` | L3 | Strong confirmation; Parent Owner invariants | 3 |
| Dashboard | `/dashboard`, `lib/dashboard/*` | D1 services + ICAI reference + planner/study/progress | **Missing** | Toggle/order exam countdown, leaderboard, ICAI updates, quick actions, progress/streak widgets, notices | `product.dashboard.configure` | L1/L2 | Versioned config | 5 |
| Today plan | planner `/today` APIs and `lib/planner/phase8-today.ts` | `daily_plans`, `daily_plan_items`, planner events | **Missing** | Enablement, task/recommendation limits, generation behavior, fallbacks | `product.today.configure` | L1/L2 | Config history; preserve generated-plan provenance | 5 |
| Study timer | `/study`, study API/service | `study_timer_state`, `study_sessions` | **Missing** | Min qualifying duration, max duration, reflection requirements, suspicious thresholds | `product.study.configure` | L1/L2 | Version rules; immutable completed history | 5 |
| Progress | `/progress`, progress API/service | `chapter_progress`, append-style `progress_events` | **Missing** | Stage visibility/policy, undo window, controlled corrective recomputation | `product.progress.configure` | L1/L3 | Never silently rewrite history; audit corrections | 5 |
| Revision | planner revision settings / revision services | `revision_rules`, `revision_due_items` | **Missing** | Default intervals, reminder behavior, tier access | `product.revision.configure` | L1 | Versioned defaults; user settings preserved | 5 |
| Planner tasks | `/planner`, `/api/planner/tasks` | `tasks`, `planner_task_phase8`, `planner_events` | **Missing** | Limits, feature enablement, default scheduling behavior | `product.planner.configure` | L1 | Config audit | 5 |
| Goals | `/goals`, `/api/planner/goals` | `goals`, `planner_goal_phase8` | **Missing** | Enablement, limits, goal kinds and plan access | `product.goals.configure` | L1 | Config audit | 5 |
| Calendar | `/calendar`, `/api/planner/calendar` | `user_calendar_events` | **Missing** | Access tier, event limits, feature defaults | `product.calendar.configure` | L1 | Config audit | 5 |
| Activity | `/activity`, event services | event/history tables | **Missing** | Which event families are visible and retention/display policy | `product.activity.configure` | L1/L3 | Retention changes require explicit policy | 5 |
| Analytics | `/analytics`, `lib/analytics/*` | D1 personal history + analytics logic/rollups | **Missing** | Basic/advanced section access, history windows, display thresholds | `product.analytics.configure` | L1 | Config versioning | 5 |
| Forecast | dashboard/analytics forecast services | `forecast_snapshots` + calculation code | **Missing** | Enablement, confidence display, minimum history, model/display version | `product.forecast.configure` | L1/L3 | Model/calculation code remains code-owned; display policy versioned | 5 |
| Tests | `/tests`, test APIs/services | D1 test archive/result tables | **Missing** | Archive limits, allowed workflows/uploads, XP policy integration, tier access | `product.tests.configure` | L1/L2 | Preserve test history | 5 |
| Notes | `/notes`, notes APIs/services | `notes`, `note_tags`, `note_tag_map` | **Missing** | Limits, sharing, attachments/richer features, tier access | `product.notes.configure` | L1 | Private content remains private | 5 |
| Resources library | `/resources`, resource service | `uploaded_resources`, ICAI resources, notes | **Partial** | Upload policies, sharing policy, owner support views, quotas | `resources.configure` | L1/L2 | Metadata audit; private resources protected | 6 |
| Resource moderation | `/admin/resources/moderation` → `/api/admin/resources/moderation` → `moderateHotResource` | `notes`, `uploaded_resources`, `resource_reports`, `resource_moderation` | **Operational / Partial** | Replace prompt UX; preview metadata/context; history; reason templates; bulk/restore/quarantine | `resources.moderate` | L2 | Existing moderation history; improve reversibility | 6 |
| R2 storage | direct upload intents + `USER_RESOURCES_R2` | R2 objects + D1 metadata/intents | **Missing** | Global/per-user usage, quotas, object metadata, orphan/abandoned scan, quarantine/cleanup, MIME/size policy | `storage.manage` | L2/L4 | Dry-run before destructive cleanup; object/content privacy | 6 |
| Community channels | `/community`, Community service / Durable Object realtime | `community_channels`, D1 messages/read state + DO broadcast | **Missing** | Create/archive/configure channels, visibility/write policy, slow mode, links, attachments, limits, moderator scope, global Normal/Read-only/Disabled | `community.configure` | L1/L3 | Config audit + safe kill-switch confirmation | 6 |
| Community moderation | `/admin/community/moderation` → `/api/admin/community/moderation` → `moderateCommunity` → `moderateHotCommunity` | `message_reports`, `moderation_actions`, `chat_blocks`, messages | **Operational / Partial** | Current remove, fixed 1/8/24/48h blocks, unblock, resolve/dismiss work; add custom/permanent/channel bans, strikes, appeals, bulk actions | `community.moderate` | L2 | Existing moderation action log; reason required for stronger actions | 6 |
| Community verification | same admin page → `/api/admin/community/verifications` → Phase 7 verification service | verification tables/audit | **Operational / Partial** | Grant/revoke Verified Result, Exemption, 70%+, 75%+, 80%+, Ranker, AIR with evidence; replace raw user-ID entry with searchable user picker | `community.verification.manage` | L2 | Existing evidence + audit history | 3/6 |
| Study Buddy | `/study-buddy`, APIs/service | relationships, directional sharing, safety, nudges, shared goals, study-together, reports | **Missing** | Feature availability, invite limits, safety thresholds, reports, support restrictions | `study_buddy.configure` / `study_buddy.moderate` | L1/L2 | Never expand directional sharing without user consent | 5/6 |
| Gamification | product gamification services | append-only XP, streak evidence, achievements | **API-only / Partial** | XP policy, streak policy, achievement thresholds, review tools; no raw ledger editing | `gamification.configure` | L1/L3 | XP/streak/achievement historical evidence remains append-only | 8 |
| Anti-cheat | `/api/admin/gamification` | `anti_cheat_flags` + service | **API-only** | Queue UI, scan user, evidence, clear/uphold, notes | `gamification.review` | L2 | Evidence cannot be erased while account exists | 8 |
| Leaderboard | leaderboard APIs/service | opt-in profiles + derived monthly ranking | **Missing** | Enable, periods/categories, opt-in policy, display/reward policy | `leaderboard.configure` | L1/L3 | Policy versioning | 8 |
| Reward settlement | `/api/admin/gamification` `settle_rewards` | `leaderboard_reward_grants` + billing plan data | **API-only with security defect** — current privileged-role guard includes moderator | Owner-only preview/check/confirm settlement and revoke/withhold policy | `rewards.settle` | L3 | Idempotent, anti-cheat snapshot, immutable audit | 1/8 |
| Referrals | referral/gamification services | `referral_codes`, `referrals`, immutable bonus ledger | **Missing** | Activation rules, XP/reward policy, abuse monitoring | `referrals.configure` | L1/L3 | Referral history preserved | 8 |
| Syllabus | `/admin/syllabus` → `getAcademicVersionPreview` | versioned academic catalog | **Read-only** | Draft → validate → impact preview → publish; historical versions retained; rollback by version | `academic.edit`, `academic.publish` | L3 | Never overwrite/delete historical academic versions | 9 |
| ICAI Sync execution | `/admin/icai-sync` actions → job queue → ICAI Worker/service → D1 | sync runs/runtime/snapshots/change/review tables | **Operational** | Run, live status, cancel, skip current source, stale recovery already exist | `icai.run` | L2/L3 | Existing run/change/review history | 9 |
| ICAI review | admin sync monitor → `decideIcaiReview` | append-only `icai_review_decisions`, review queue | **Operational / Partial** | Approve/reject exists; add required reviewer notes for high-impact and before/after diff | `icai.review` | L3 | D1 trigger requires decision audit; decisions append-only | 9 |
| ICAI source registry | admin sync monitor | `icai_sources` | **Read-only** | Add/edit/enable/disable, official URL, trust, parser, timeouts/retries, thresholds, run one source, dry-run | `icai.configure` | L3 | Version/source-change audit; official-domain validation | 9 |
| Pricing / plan display | `/pricing`, billing policy | code `lib/billing/plan-policy.mjs` plus subscription tables | **Missing** | Draft/validate/publish plan presentation/quotas/features; business policy changes guarded | `billing.plan.configure` | L3 | Never take canonical price from browser | 7 |
| Billing operations | `/billing`, payment APIs, Billing Worker | payment orders/events, subscriptions | **Missing** | Subscriber counts, payment/renewal/failure/webhook health, user billing history | `billing.read` | L0 | Payment history immutable/append-style | 7 |
| Entitlements | billing/authorization services | plan entitlements + subscriptions + effective policy | **Missing** | Temporary manual grant/override with reason + expiry + automatic revert | `entitlements.override` | L3 | Distinguish payment vs manual/reward source | 7 |
| Notifications | planner notification APIs + outbox | notification preferences, in-app notifications, outbox | **Missing** | Audience, send/schedule/expire, templates, priority/CTA, stats | `notifications.manage` | L2/L3 | Bulk-send confirmation + audit | 11 |
| Content / announcements | user-facing page copy/components | mostly code | **Missing** | Structured announcement bar, maintenance notice, support/FAQ/pricing notes/footer/legal metadata | `content.manage` | L1/L3 | No arbitrary JS/HTML | 11 |
| User settings/preferences | `/settings`, preference/profile services | `user_preferences`, profile settings | **Missing** | Configure which preferences/options are offered and defaults, not users' private choices | `product.settings.configure` | L1 | Do not silently overwrite user choices | 5/11 |
| Profile / academic scope | profile/onboarding services | `profiles`, course/attempt mappings | **Missing** | Support diagnostics and controlled correction workflow | `users.profile.correct` | L2/L3 | Preserve history and ownership | 3/9 |
| Exports | `/api/exports` | canonical user data services | **Missing** | Trigger user data export and monitor status; global backup/export separately restricted | `users.export` | L2 | Audit support access | 3/10 |
| Background jobs | `/admin/jobs`, `/api/admin/jobs` → `getBackgroundJobStatus`, `getOpenDeadLetters` | `background_jobs`, dead letters | **Read-only diagnostic** | Real filtered console: retry, requeue, cancel queued, resolve DLQ, run supported job, pause supported type | `jobs.read`, `jobs.retry`, `jobs.cancel` | L2/L3 | Redact payloads; idempotency | 10 |
| System health | `/api/health`, `system_health_log`, Cloudflare observability | Worker/D1/R2/Queue/DO/service health | **Missing as admin console** | Healthy/Degraded/Failed for web, billing, ICAI, DB, storage, queues, cron, realtime, cache, deployment | `system.read` | L0 | Operational logs only; redact secrets | 10 |
| Backups / recovery | operational runbooks/provider facilities | D1/R2/provider backups | **Missing** | Last backup status, verification, controlled restore workflow | `system.recovery` | L4 | Parent Owner/Owner, re-auth, dry-run, typed confirmation | 10/12 |
| Global admin audit | currently domain-specific moderation/ICAI/resource histories | multiple D1 audit/event tables | **Missing unified ledger** | Cross-system immutable admin audit with actor, capability, target, before/after, reason, request ID | `audit.read` | L0/L3 | Append-only; safe undo links where supported | 1 |
| Security console | sessions/auth/staff/authorization | Cloudflare session runtime + D1 | **Missing** | Staff access, session revocation, recent security actions, sensitive operation controls | `security.manage` | L3/L4 | Re-auth and immutable audit | 3/12 |

## Current admin surfaces — source-wired status

### `/admin`

Current implementation only renders `ProductPreviewPage` with the `admin` variant. It must be replaced in Phase 2 rather than treated as a completed operational dashboard.

### `/admin/community/moderation`

Current flow:

`page.tsx` → `CommunityModerationConsole` → `POST /api/admin/community/moderation` → `moderateCommunity` → `moderateHotCommunity` → D1 moderation/message/report/block records.

Current controls are source-wired: remove message, temporary fixed-duration block, unblock, resolve report and dismiss report. The page also includes evidence-backed Community verification; only admin/owner-level operators may grant/revoke verification while moderators can still moderate reports.

### `/admin/resources/moderation`

Current flow:

`page.tsx` → `ModerationQueue` → `POST /api/admin/resources/moderation` → `moderateHotResource` → D1 resource/note moderation history.

Shared notes/uploads only enter this moderation queue; private student files are intentionally excluded.

### `/admin/icai-sync`

This is the strongest current admin surface. Current flow includes authenticated admin operator gating, manual queueing, active run protection, adaptive live monitoring, cooperative cancel/skip, stale-run recovery, source health, run history, high-impact review decisions and cache invalidation.

The source registry is currently observational, not configurable.

### `/admin/syllabus`

Read-only version registry. It explicitly keeps academic writes migration/service-role only. Future editing must use versioned draft/publish semantics and preserve stable IDs/history.

### `/admin/jobs`

Authenticated read-only diagnostic that prints job/dead-letter data as JSON. The API is GET-only. It is not yet an operations console.

### `/api/admin/gamification`

Privileged backend functionality exists without an admin page. It supports anti-cheat list/scan/review and monthly reward settlement. Its current shared `isPrivilegedRole` guard permits moderators, so reward settlement is a **Phase 1 priority security correction**.

## Existing configuration foundation

The D1 schema already contains `app_settings(key, value, is_public, ...)`. Phase 4 must evolve this existing foundation into a typed/versioned/scoped configuration control plane rather than creating a disconnected second settings architecture.

The target precedence should be deterministic and bounded by code safety invariants, for example:

`hard code safety floor → global → plan → academic/cohort → user override`

## Intentionally code-owned controls

The following must not become ordinary mutable admin fields:

1. Session-token hashing/cryptographic behavior and authentication protocol details.
2. OAuth, Razorpay, Cloudflare and other secret values. Admin UI may only show safe status such as `Configured`.
3. Payment signature verification, canonical amount verification and payment-event authenticity.
4. D1 schema constraints, migration history, foreign-key design and index definitions.
5. Stable application user IDs and ownership keys.
6. Historical academic IDs/version lineage and canonical immutable/superseded history.
7. Append-only XP/streak/achievement evidence, anti-cheat evidence, ICAI review decisions and provider payment events.
8. Worker/service binding names, Durable Object class/migrations, Queue binding semantics and trusted service authentication.
9. Hard security ceilings/minimums; owner configuration may select within safe bounds but cannot disable fundamental authorization/input validation.
10. Raw SQL, arbitrary executable JavaScript and unrestricted HTML injection.
11. Production credentials, private keys, session tokens and raw provider secrets.
12. Branch/ruleset/deployment-security mechanics from the normal product admin UI.

## Phase 0 conclusions

- The existing product surface is much wider than the existing admin surface.
- Community moderation, resource moderation and ICAI Sync are real source-wired controls and should be preserved and improved rather than rebuilt.
- Syllabus and Jobs are real reads but not operational mutation consoles.
- Gamification has hidden privileged API operations and needs both capability tightening and UI ownership.
- Billing/product feature policy is still largely code-owned/hard-coded at runtime.
- D1 already provides the seeds for the future control plane (`app_settings`), audit/event history, jobs, notification outbox and system health.
- Phase 1 must establish centralized admin authorization, capability checks and unified admin audit before more powerful controls are added.
