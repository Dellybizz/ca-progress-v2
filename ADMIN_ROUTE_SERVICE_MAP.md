# CA Progress V2 — Admin Route / Service / Data Map

Status: Phase 0 production architecture contract  
Baseline branch: `phase-12-operations-admin-platform`  
Baseline commit: `53681b85250c293cd15e7c17015e8375851e6d84`  
Baseline date: 2026-09-08

This map records the current runtime path from UI/API to trusted services and Cloudflare persistence. Later admin phases should extend these paths instead of creating parallel architectures.

## 1. Runtime topology

Current production architecture is Cloudflare-first:

```text
Browser
  |
  v
Next.js / OpenNext Web Worker (`custom-worker.ts`)
  |
  +--> Cloudflare session/auth runtime
  +--> D1 (`DB`)
  +--> R2 (`USER_RESOURCES_R2`)
  +--> Queue (`BACKGROUND_JOBS`) --> web queue consumer / job executor
  +--> Durable Object (`COMMUNITY_COORDINATORS`)
  +--> Service binding: `ICAI_SYNC_SERVICE` --> ICAI Sync Worker
  +--> Service binding: `BILLING_SERVICE` --> Billing Worker
  +--> public/shared cache services
```

D1 migrations live in `d1/migrations` and are configured through `wrangler.jsonc`.

Do not reintroduce Supabase runtime fallback paths. The permanent retirement workflows remain authoritative regression gates.

## 2. Cloudflare binding ownership

| Binding / service | Current purpose | Admin use later |
|---|---|---|
| `DB` | Canonical application D1 database | Admin reads/writes through trusted services only |
| `USER_RESOURCES_R2` | Student resource/file objects | Storage monitoring/quarantine/cleanup via trusted admin service |
| `BACKGROUND_JOBS` | Background job producer/consumer | Jobs console, safe retry/cancel/requeue |
| `COMMUNITY_COORDINATORS` | Realtime Community coordination | Health/operational monitoring; channel behavior must still persist canonically in D1 |
| `ICAI_SYNC_SERVICE` | Private ICAI source synchronization | Existing admin sync controls and future source config |
| `BILLING_SERVICE` | Private billing/payment boundary | Billing health/operations; never expose provider secrets |

Current crons are configured in `wrangler.jsonc` and include daily/hourly triggers. Future UI may display schedule/health, but changing infrastructure cron semantics should be deliberate and validated.

## 3. Authentication / authorization path

```text
request
  -> proxy.ts
  -> lib/auth/proxy.ts (unsafe cross-site/origin rejection)
  -> lib/auth/cloudflare* session resolution
  -> lib/auth/server.ts getRequestAuthContext()
  -> trusted application user ID + role + entitlements
  -> lib/authorization/server.ts / roles.ts
```

Current important split:

- `isPrivilegedRole()` permits moderator/admin/owner/parent_owner.
- `canEnterAdminArea()` permits admin/owner/parent_owner.
- `app/(admin)/layout.tsx` currently does **not** enforce either; it only mounts the Admin `AppShell`.

Phase 1 must centralize the page boundary while preserving route/service authorization.

## 4. Current admin route map

### 4.1 `/admin`

```text
/admin
  -> app/(admin)/admin/page.tsx
  -> ProductPreviewPage variant="admin"
```

State: preview only. No operational service contract. Phase 2 replaces this with the command-center service layer.

### 4.2 Community moderation

```text
/admin/community/moderation
  -> getCommunityModerationModel()
     -> getRequestAuthContext / getServerAppRole
     -> D1 admin reads:
        message_reports
        moderation_actions
        chat_blocks
        community_channels
        community_messages
        uploaded_resources
        profiles
  -> CommunityModerationConsole
     -> POST /api/admin/community/moderation
        -> moderateCommunity()
           -> isPrivilegedRole()
           -> moderateHotCommunity()
              -> canonical D1 moderation mutation
```

Current actions:

- remove reported message;
- temporary block (1h/8h/24h/48h via current UI);
- unblock;
- resolve report;
- dismiss report;
- view active blocks and moderation action history.

Community read/write/realtime path outside admin:

```text
student Community UI
  -> lib/community/service.ts
  -> lib/data/d1/hot-screens.ts + D1 RPC/data
  -> CommunityChannelCoordinator Durable Object for realtime fan-out
```

Future channel configuration must update canonical D1 policy and let the realtime layer consume it; do not store a conflicting DO-only policy.

### 4.3 Community verification

```text
/admin/community/moderation
  -> getCommunityVerificationAdminModel()
  -> CommunityVerificationConsole
     -> GET/POST /api/admin/community/verifications
        -> lib/community/phase7 manageCommunityVerification()
        -> D1 verification/audit records
```

Current UI supports evidence-backed grant/revoke for Verified Result, Exemption, 70%+, 75%+, 80%+, Ranker and AIR. Admin/Owner management is narrower than moderator report handling. Current UX requires a stable user ID; Phase 3 should provide a shared searchable user picker.

### 4.4 Resource moderation

```text
/admin/resources/moderation
  -> getResourceModerationPageModel()
     -> optionalUser + getServerAppRole + isPrivilegedRole
     -> D1 reads:
        notes (shared pending/reported)
        uploaded_resources (shared pending/reported)
        resource_reports (open)
  -> ModerationQueue
     -> POST /api/admin/resources/moderation
        -> optionalUser
        -> getServerAppRole / isPrivilegedRole
        -> validate entity/id/decision
        -> moderateHotResource()
           -> canonical D1 moderation mutation/history
```

Private notes/files are intentionally not ordinary shared-resource moderation inputs.

Related student resource path:

```text
/resources and /notes
  -> lib/resources/service.ts / lib/notes/*
  -> D1 metadata + direct-R2 upload/download flows
  -> uploaded_resources / notes / tags / report & moderation tables
```

R2 object mutation must remain behind trusted signing/service paths; future admin storage does not directly hand credentials to the browser.

### 4.5 ICAI Sync

Read path:

```text
/admin/icai-sync
  -> getAdminOperator()
  -> getIcaiAdminDashboard()
  -> D1:
     icai_sources
     icai_sync_runs
     icai_sync_runtime
     icai_source_snapshots
     icai_change_events
     icai_review_queue
     icai_review_decisions
     background_jobs
```

Manual run path:

```text
Run Sync
  -> runIcaiSyncAction()
  -> requireAdminOperator()
  -> verify no active run/job
  -> enqueueBackgroundJob(type="icai-sync")
  -> BACKGROUND_JOBS Queue
  -> canonical job consumer/executor
  -> ICAI_SYNC_SERVICE / ICAI Sync Worker
  -> official ICAI sources
  -> D1 snapshots/runs/change events/review queue/canonical data
```

Control path:

```text
Cancel / Skip / Recover
  -> controlIcaiSyncAction()
  -> requireAdminOperator()
  -> D1 icai_sync_runtime control flags / heartbeat
  -> worker cooperatively observes control state
```

Review path:

```text
Approve / Reject
  -> decideIcaiReviewAction()
  -> requireAdminOperator()
  -> decideIcaiReview()
  -> atomic/audited D1 review decision + canonical patch semantics
  -> invalidateSharedPublicCache(["icai"])
  -> revalidate /admin/icai-sync, /updates, /resources/icai
```

Existing D1 triggers require an audit decision for approved/rejected review transitions and make review decisions append-only.

Future source configuration must extend `icai_sources` and source services; do not bypass the existing sync engine.

### 4.6 Syllabus

```text
/admin/syllabus
  -> getAcademicVersionPreview()
  -> D1 academic catalog:
     course_levels
     course_groups
     subjects
     syllabus_versions
     chapters
     topics
     attempt_syllabus_map
```

State: read-only by design. Future write path must be a versioned academic service:

```text
Draft -> validate -> impact diff -> publish -> cache invalidation
```

Never turn this page into direct row editing.

### 4.7 Background jobs

```text
/admin/jobs
  -> requireAdminOperator()
  -> getBackgroundJobStatus()
  -> getOpenDeadLetters()
  -> raw JSON display

GET /api/admin/jobs
  -> requireAdminOperator()
  -> same status/dead-letter services
```

Data:

- `background_jobs`
- `background_job_dead_letters`
- related job-specific tables such as `student_plan_snapshots`, `analytics_daily_rollups`, `notification_outbox`, `attachment_processing_jobs`.

State: read-only diagnostic. Future mutations must go through a job-control service that preserves idempotency and queue semantics.

### 4.8 Gamification admin API

```text
GET /api/admin/gamification
  -> privilegedIdentity()
  -> listAntiCheatFlags()

POST /api/admin/gamification
  -> privilegedIdentity()
  -> scan_user -> scanAntiCheatForUser()
  -> review_flag -> reviewAntiCheatFlag()
  -> settle_rewards -> settleMonthlyRewards()
```

Current data families:

- immutable `xp_ledger`;
- immutable `study_streak_days`;
- immutable `user_achievements`;
- `leaderboard_profiles`;
- `anti_cheat_flags`;
- `leaderboard_reward_grants`;
- referrals and immutable referral bonus ledger.

State: API-only. Current shared privileged guard allows moderator access to all three POST actions, including settlement. Phase 1 must split capabilities before Phase 8 exposes a UI.

## 5. Student domain route/service map

This table establishes ownership for later admin controls. It is not a claim that every row already has an admin endpoint.

| Product domain | Student/API surface | Canonical service family | Primary D1 / infra families | Future admin owner |
|---|---|---|---|---|
| Dashboard | `/dashboard`, `/api/dashboard` | `lib/dashboard/*` | profile, progress, study, planner, ICAI reference/events | Feature Controls / Command Center |
| Today | planner Today routes | `lib/planner/phase8-today.ts`, smart planner | daily plans/items, planner events, job snapshots | Product controls |
| Study | `/study`, `/api/study` | `lib/study/*` | study timer state, study sessions | Product controls |
| Progress | `/progress`, `/api/progress` | `lib/progress/*` | chapter progress, progress events | Product controls |
| Revision | planner revision API | planner/revision services | revision rules, revision due items | Product controls |
| Planner | `/planner`, planner APIs | `lib/planner/*` | tasks, planner events/extensions | Product controls |
| Goals | `/goals`, planner goals API | planner phase8 | goals + goal extension | Product controls |
| Calendar | `/calendar`, planner calendar API | `lib/planner/calendar.ts` | user calendar events | Product controls |
| Activity | `/activity` | event/history services | dashboard/planner/progress/study event history | Product controls |
| Analytics | `/analytics` | `lib/analytics/*` | personal history + daily rollups | Product controls / Command Center aggregates |
| Forecast | analytics/dashboard | forecast logic | forecast snapshots | Product controls |
| Tests | `/tests`, `/api/tests` | `lib/tests/*` | test archive/result records | Product controls |
| Notes | `/notes`, `/api/notes` | `lib/notes/*` | notes, tags, note extensions | Product controls / Resource moderation |
| Resources | `/resources`, resource APIs | `lib/resources/*` | uploaded resource metadata, R2, reports/moderation | Resources / Storage |
| Community | `/community`, community APIs | `lib/community/*`, D1 hot screens | messages/reactions/pins/read/reports/blocks + DO realtime | Community |
| Study Buddy | `/study-buddy`, APIs | `lib/study-buddy/*` | relationship/sharing/safety/nudges/goals/study-together/reports | Product controls / Safety |
| Gamification | gamification/leaderboard APIs | `lib/gamification/*` | XP/streak/achievements/leaderboard/flags/rewards/referrals | Gamification |
| Syllabus | `/syllabus`, `/subjects`, `/chapters` | `lib/academic/*`, chapter hub | versioned academic catalog | Academic |
| ICAI updates | `/updates`, ICAI resources | `lib/icai/*` | ICAI sources/snapshots/change/review/resources/events | ICAI Sync |
| Billing/Pricing | `/billing`, `/pricing`, payments APIs | `lib/billing/*`, Billing Worker | plans/entitlements/subscriptions/orders/events | Billing / Entitlements |
| Settings/Profile | `/settings`, onboarding/profile APIs | auth/profile/preferences | app user, profile, preferences, sessions | Users / Product Settings |
| Notifications | planner notification API | planner/notification jobs | preferences, in-app notifications, outbox | Notifications |
| Exports | `/api/exports` | `lib/exports/*` | canonical user data reads | Users / Data operations |

## 6. Existing D1 control-plane building blocks

Important existing schema primitives:

### Identity/security
- `app_users`
- `auth_identities`
- `sessions`
- trusted `role` projection

### Configuration
- `app_settings`
- `subscription_plans`
- `plan_entitlements`
- user preference tables

`app_settings` is the seed for Phase 4. Extend it with typed definitions/scopes/versioning as needed rather than creating a disconnected settings system.

### Academic / ICAI
- course/subject/chapter/topic/version/attempt mapping tables
- ICAI sources/snapshots/runs/runtime/change/review/decision tables

### Product history
- progress events
- planner events
- study sessions
- dashboard/activity events
- test/note/resource histories

### Moderation / safety
- Community reports/actions/blocks
- resource reports/moderation
- Study Buddy safety/reports
- anti-cheat flags

### Jobs/operations
- background jobs/dead letters
- analytics rollups
- notification outbox
- attachment jobs
- `system_health_log`

### Billing
- subscription plans/entitlements
- user subscriptions
- payment orders/events
- subscription events
- leaderboard reward grants

## 7. Configuration resolution contract for Phase 4+

Future feature configuration should resolve through one trusted service:

```text
hard application safety invariant
  -> code default / setting definition
  -> global override
  -> plan override
  -> academic level/group/attempt override
  -> user override
  -> effective value + provenance
```

The effective-value API must return provenance for support/admin diagnostics. A browser must never directly decide feature access based only on UI configuration; server-side feature/entitlement checks remain authoritative.

## 8. Cache / invalidation boundaries

Shared public data such as verified academic/ICAI references may be cached. Personalized/admin data must not enter a shared cache.

Admin mutations that affect shared user-facing data must invalidate the corresponding shared cache and revalidate affected routes. The existing ICAI review action already demonstrates this pattern.

Future settings service must include cache-invalidation metadata so a global toggle or published academic change cannot leave stale student behavior indefinitely.

## 9. Data privacy boundaries

- Browser never connects directly to D1 with privileged credentials.
- Browser never receives R2/provider secrets.
- Admin resource moderation operates on shared/reported items; private content is not automatically exposed.
- Study Buddy sharing is directional and remains user-controlled.
- Job payloads are sanitized before admin rendering.
- Audit records store operational metadata, not raw secrets/private payload dumps.

## 10. Future admin route ownership map

Later phases should converge on these route families rather than adding unrelated one-off pages:

```text
/admin
/admin/users
/admin/staff
/admin/features
/admin/product/*
/admin/community
/admin/resources/moderation
/admin/storage
/admin/billing
/admin/entitlements
/admin/gamification
/admin/syllabus
/admin/icai-sync
/admin/notifications
/admin/content
/admin/jobs
/admin/system
/admin/backups
/admin/security
/admin/audit
```

API/service families should mirror domain responsibility and declare capabilities explicitly.

## 11. Testing / CI map

Repository-standard gates currently include:

- permanent Supabase retirement verification;
- TypeScript typecheck;
- ESLint with zero warnings;
- focused ICAI regression suites;
- retained D1 hot-index validation;
- Next.js production build;
- OpenNext/Cloudflare Worker dry-runs and size budgets;
- Cloudflare SSR smoke;
- repository-wide Node tests;
- final retirement re-scan.

Authoritative workflows:

- `.github/workflows/ci.yml` — `V2 CI`.
- `.github/workflows/supabase-retirement-closure.yml` — permanent Supabase retirement closure.

Phase-specific admin tests added later must complement these gates with permission matrix and live state verification; source-code regex tests alone are not sufficient proof that a control works.

## 12. Phase 0 architecture conclusions

1. Preserve the existing Cloudflare/D1/R2/Queue/DO architecture.
2. Build the admin platform as a control plane around canonical services, not a second application stack.
3. Centralize authorization in Phase 1 without removing service-level guards.
4. Reuse the existing `app_settings` foundation for Phase 4.
5. Preserve existing Community/resource/ICAI operational paths.
6. Do not make Syllabus a raw D1 editor; use versioned publishing.
7. Do not turn Jobs into direct arbitrary queue/database manipulation; use job-control services.
8. Split gamification capabilities before exposing reward settlement UI.
9. Maintain Supabase permanent retirement and Cloudflare-only runtime paths.
