# Cloudflare Migration Phase 1 — Infrastructure Audit, Freeze and Data Abstraction

Baseline branch: `phase-12-operations-admin-platform`  
Baseline commit: `cbb188e70be6dbe565b499d1d372eb98d3826269` (`Mentor Phase 2: normalize academic catalog`)  
Migration phase: 1 only  
Production persistence: Supabase  
Production authentication: Supabase Auth  
Target persistence: Cloudflare D1  
Mentor Phase 3: **not started**

## 1. Freeze statement

CA Mentor Phase 2 is the migration freeze point. No migration may regenerate or reinterpret historical academic identity.

Canonical Academic Catalog IDs are immutable migration invariants:

- `course:<levelId>`
- `group:<groupId>`
- `subject:<subjectId>`
- `chapter:<subjectId>:<chapterStableKey>`
- `topic:<subjectId>:<chapterStableKey>:<topicStableKey>`

The following must survive migration unchanged in meaning: syllabus versions, attempt applicability, chapter/topic stable keys, official chapter/unit/AS numbering, aliases, predecessor/successor lineage, chapter progress, progress events and historical user ownership.

## 2. Current effective infrastructure

### Cloudflare already active

- Main Next/OpenNext Worker: `ca-progress-v2` via `custom-worker.ts` / `wrangler.web.jsonc`.
- R2 binding: `USER_RESOURCES_R2` → `ca-progress-v2-staging-user-resources`.
- Internal Worker service binding: `ICAI_SYNC_SERVICE` → `ca-progress-v2-icai-sync`.
- Internal Worker service binding: `BILLING_SERVICE` → `ca-progress-v2-billing`.
- Cron on the web Worker: `30 0 * * *` UTC.
- Cloudflare runtime value bridge: `lib/cloudflare/runtime-env.ts`.

### Supabase still active

- PostgreSQL is the relational source of truth.
- Supabase Auth owns sessions/claims and application user identity linkage.
- The main Worker still requires `SUPABASE_SERVICE_ROLE_KEY`.
- Browser Community realtime uses Supabase Realtime through the new provider-neutral adapter.
- Avatar bytes still use the private Supabase `avatars` bucket.
- User resource bytes are already R2-backed, but resource metadata/authorization/quota state are in Supabase.
- Billing Worker uses Supabase/PostgREST + Phase 11 RPCs.
- ICAI Worker creates a Supabase service client and uses Phase 8 RPCs/tables.

### Not activated in Phase 1

- No D1 database binding.
- No D1 migrations.
- No migration Queue.
- No KV dependency.
- No Durable Object dependency.
- No Hyperdrive configuration.

Hyperdrive is allowed only as a temporary Worker→PostgreSQL transition if later required. It must not become the final provider contract.

## 3. Supabase client/config inventory

| Path | Dependency | Current purpose | Migration boundary |
|---|---|---|---|
| `lib/supabase/server.ts` | `@supabase/ssr` | server client + Next cookie propagation | infrastructure adapter |
| `lib/supabase/browser.ts` | `@supabase/ssr` | browser client | infrastructure adapter |
| `lib/supabase/admin.ts` | `@supabase/supabase-js` | service-role/admin client + runtime config | service-only adapter |
| `lib/supabase/proxy.ts` | Supabase SSR | auth/session proxy refresh | auth adapter |
| `lib/supabase/config.ts` | env | URL/public key configuration | runtime config |
| `lib/supabase/database.types.ts` | PostgREST schema types | compile-time row/RPC types | provider-specific internal type layer |

## 4. Application dependency inventory

| Domain | Active paths | Supabase dependency | Cloudflare target |
|---|---|---|---|
| Authentication | `lib/auth/server.ts`, `lib/auth/provider.ts`, `app/auth/*` | claims/user/profile + OAuth/session exchange | Worker auth/session implementation behind `lib/auth/provider.ts` |
| Authorization | `lib/authorization/server.ts`, DB RLS/functions | claims/app metadata, profile/role lookups, RLS | explicit Worker authorization helpers |
| Profiles/onboarding | `lib/profile/service.ts`, profile/onboarding API routes | `profiles`, private avatar Storage | D1 profile repo + R2/avatar storage or approved equivalent |
| Academic catalog | `lib/academic/query.ts`, `lib/academic/catalog-normalization.ts` | public academic tables + attempt mapping | D1 academic repository |
| Progress | `lib/progress/service.ts` | `chapter_progress`, `progress_events`, progress RPCs | D1 transaction/service logic |
| Planner | `lib/planner/service.ts`, `lib/smart-planner/service.ts` | tasks/goals/calendar/revision/daily plan tables + RPC/trigger semantics | D1 planner repository + Worker transaction logic |
| Study | `lib/study/service.ts` | timer/session tables + timer RPCs | D1 study repository + service transactions |
| Resources/notes | `lib/resources/service.ts`, `lib/resources/r2.ts` | metadata/RPC/moderation in Supabase; bytes in R2 | D1 metadata + existing R2 |
| Community | `lib/community/service.ts`, `lib/community/realtime-provider.ts` | tables, Phase 10 RPCs, RLS, Supabase Realtime | D1 history + Worker auth; DO/WebSockets only if required |
| Billing | `lib/billing/service.ts`, `workers/billing/index.ts` | PostgREST, service role, Phase 11 RPCs | D1 billing repo + existing private billing Worker |
| ICAI | `lib/icai/query.ts`, `workers/icai-sync/sync-engine.ts` | tables/RPCs/service-role client | D1 ICAI repo + existing sync Worker/cron |
| Dashboard | `lib/dashboard/service.ts`, reference services | indirectly composes Supabase-backed domains | provider-neutral domain composition |
| Mentor 1 | `20260901160000_mentor_phase1_foundation.sql` | Mentor foundation tables/RLS | D1 equivalent in Phase 2 |
| Mentor 2 | `20260901170000_mentor_phase2_academic_catalog.sql` | canonical catalog tables/views/resolvers | D1 equivalent preserving canonical IDs |

Feature-level provider leakage explicitly reduced in Phase 1:

- OAuth routes now call `lib/auth/provider.ts` instead of constructing Supabase clients.
- Profile/onboarding/avatar routes now call `lib/profile/service.ts`.
- Community Chat now calls `lib/community/realtime-provider.ts` instead of constructing a browser Supabase client.

Existing domain services remain Supabase adapters in Phase 1. They are the deliberate boundary to replace with D1 repositories in Phase 2; rewriting their query semantics now would violate the phase scope.

## 5. Effective relational data contract

### Core / user

- `profiles`
- `user_preferences`
- `app_settings`
- `system_health_log`
- `dashboard_events`

### Academic / attempts

- `course_levels`
- `course_groups`
- `subjects`
- `syllabus_versions`
- `chapters`
- `topics`
- `attempt_syllabus_map`
- `academic_change_events`
- `exam_attempts`
- `exam_events`

### Progress / study / planning

- `chapter_progress`
- `progress_events`
- `study_sessions`
- `study_timer_state`
- `tasks`
- `goals`
- `user_calendar_events`
- `revision_rules`
- `planner_events`
- `revision_due_items`
- `daily_plans`
- `daily_plan_items`
- `forecast_snapshots`

### Notes / resources

- `notes`
- `note_tags`
- `note_tag_map`
- `uploaded_resources`
- `resource_moderation`
- `resource_reports`

### ICAI

- `icai_sources`
- `icai_sync_runs`
- `icai_source_snapshots`
- `icai_resources`
- `resource_attempt_map`
- `resource_subject_map`
- `icai_change_events`
- `icai_review_queue`

### Community

- `community_channels`
- `community_messages`
- `message_reactions`
- `channel_read_state`
- `pinned_messages`
- `message_reports`
- `chat_blocks`
- `moderation_actions`
- `community_message_mentions`
- `community_notifications`

### Billing / entitlements

- `subscription_plans`
- `plan_entitlements`
- `user_subscriptions`
- `payment_orders`
- `payment_events`
- `subscription_events`

### Mentor Phase 1

- `mentor_model_versions`
- `mentor_intelligence_sources`
- `mentor_evidence`
- `mentor_exam_intelligence`
- `mentor_learning_intelligence`
- `mentor_personalization_rules`
- `mentor_personalization_eligibility`
- `mentor_recommendation_explanations`

### Mentor Phase 2 canonical catalog

- `academic_catalog_nodes`
- `academic_catalog_version_items`
- `academic_catalog_aliases`
- `academic_catalog_lineage`

Views that must be recreated or replaced intentionally:

- `academic_syllabus_lineage`
- `chapter_progress_canonical`
- `progress_events_canonical`

## 6. Supabase/PostgreSQL function and RPC contract

The migration must preserve the *behavior*, not necessarily the database implementation, of these function families:

### Core/profile

- `set_updated_at`
- `handle_new_auth_user`
- `phase6_set_timezone`

### Progress/study

- `progress_state_json`
- `progress_validate_state`
- `progress_chapter_is_applicable`
- `progress_set_stage`
- `progress_undo_event`
- `study_subject_is_applicable`
- `study_timezone_is_valid`
- `study_timer_current_elapsed`
- `study_timer_start`
- `study_timer_pause`
- `study_timer_resume`
- `study_timer_touch`
- `study_timer_finish`
- `study_timer_discard`

### Resources

- `phase7_can_moderate`
- `phase7_validate_academic_scope`
- `phase7_note_share_policy`
- `phase7_upload_share_policy`
- `phase7_save_note`
- `phase7_create_uploaded_resource`
- `phase7_update_uploaded_resource`
- `phase7_delete_uploaded_resource`
- `phase7_moderate_resource`
- `phase7_report_resource`
- `phase11_create_uploaded_resource`

### ICAI

- `icai_sync_apply_source_batch`
- `icai_sync_record_unchanged`
- `icai_sync_mark_source_failure`
- `icai_review_decide`

### Revision / smart planner

- Phase 9 planner event/schedule/rebuild functions and their progress/task/profile triggers.
- `phase9_set_revision_rules`

### Community

- `phase10_current_role`
- `phase10_is_moderator`
- channel visibility/write/block helpers
- channel synchronization helpers/triggers
- `phase10_list_channels`
- `phase10_list_channel_members`
- `phase10_create_message`
- `phase10_mark_read`
- `phase10_toggle_reaction`
- `phase10_report_message`
- `phase10_moderate`

### Billing

- `phase11_add_plan_duration`
- `phase11_current_plan_id`
- `phase11_effective_entitlement`
- `phase11_get_my_entitlement`
- `phase11_reconcile_payment`
- `phase11_create_uploaded_resource`

### Mentor

- `mentor_personalization_is_eligible`
- `academic_catalog_resolve_legacy`
- `academic_catalog_is_applicable`
- `academic_catalog_resolve_alias`
- `academic_catalog_resolve_alias_one`

## 7. Trigger contract

Triggers are used for more than timestamps. Phase 2 must distinguish mechanical timestamps from business invariants.

- Shared `set_updated_at` triggers on mutable tables.
- `on_auth_user_created` bootstraps profile/preferences from `auth.users`.
- study timer timezone sync updates profile timezone.
- task academic-scope validation.
- notes/resources academic-scope validation and share/moderation policy triggers.
- Phase 9 progress/rules/task/profile/study triggers rebuild revision/planner state.
- Phase 10 academic reference triggers synchronize community channels.
- Mentor mutable tables use updated-at triggers.

Business triggers should generally become explicit Worker/service transaction logic rather than hidden D1 triggers unless Phase 2 proves a D1 trigger is safer.

## 8. Storage and realtime inventory

### Supabase Storage

- Private bucket `avatars`, max 2 MiB, JPEG/PNG/WebP.
- Avatar object path is user-ID-prefixed and protected by ownership policies.

### Cloudflare R2

- User resource bytes already use private R2 binding `USER_RESOURCES_R2`.
- Supabase still stores resource metadata, moderation state, ownership and quota state.
- Historical `storage_bucket` accepts the old Supabase marker and current R2 marker; migration must preserve metadata history.

### Supabase Realtime

- Community Chat listens to `postgres_changes` for `community_messages`, `message_reactions`, and `pinned_messages`, filtered by `channel_id`.
- The browser now consumes this through `lib/community/realtime-provider.ts`.

## 9. Authentication freeze

Effective auth on this branch:

- Google OAuth.
- LinkedIn OIDC.
- Supabase Auth session cookies/claim validation.
- application ownership currently uses the Supabase auth user UUID.
- `handle_new_auth_user` creates profile/preferences rows using that UUID.
- historical phone OTP infrastructure was created and then removed by `20260830020300_phase2_social_login_only.sql`; it is **not** part of the effective Phase 1 auth contract.

Phase 1 does not replace authentication and does not change user IDs.

## 10. Authorization matrix

| Actor | Read | Write | Special rules | Cloudflare replacement |
|---|---|---|---|---|
| Anonymous | public app settings, public academic catalog, verified ICAI data, published Mentor outputs | none for private/user domains | cannot access user-owned state | public repository methods only |
| Authenticated student | own profile/preferences/progress/planner/study/notes/resources; visible community; public catalog | own allowed mutations via RLS/RPC/service routes | academic applicability, chat blocks, moderation status and entitlement limits apply | trusted session → user-scoped repository context |
| Resource owner | own notes/uploads | edit/delete/share within validation rules | shared content enters moderation policy | ownership checks in service transaction |
| Moderator | visible community/resource moderation | moderation RPCs/actions | role currently derived from auth app metadata; cannot bypass unrelated billing ownership | `requireModerator` / scoped moderation checks |
| Admin | moderator capabilities + admin interfaces | service-approved admin operations | must not rely on browser role flags | server role lookup + explicit operation policy |
| Owner / parent_owner | inherited privileged roles where current code permits | privileged admin/moderation operations | preserve current hierarchy/self-protection rules implemented elsewhere | explicit Worker role/operation matrix |
| Subscriber | ordinary authenticated access plus configured entitlements | quota/paid-plan permitted operations | `phase11_effective_entitlement` is current truth | entitlement service using D1 |
| Web service | service-bound internal operations | selected protected writes | must carry trusted server identity | service binding + server authorization |
| Billing Worker | payment/order/subscription reconciliation | billing service-only writes/RPC | provider amount/currency/signatures/idempotency must be preserved | private Worker + D1 transaction/idempotency |
| ICAI Worker | official source/sync state | ICAI service-only RPCs/tables | source verification/review semantics | private Worker + D1 transaction layer |
| Service role | bypasses RLS | service-only tables/functions | never exposed to browser | removed in final architecture; replaced by Worker bindings/authorization |

## 11. PostgreSQL → D1 compatibility map

| PostgreSQL/Supabase behavior | Current examples | D1/Cloudflare decision for Phase 2 |
|---|---|---|
| RLS | nearly all user/private tables | move to explicit Worker/server authorization; no browser-trusted user ID |
| `auth.uid()` | progress, study, resources, community, Mentor | authenticated session supplies actor ID to service layer |
| `auth.jwt()` app metadata | moderator/community/resource role checks | trusted server-side role lookup/session claims |
| `security definer` | mutation RPCs | private Worker/service method with explicit authorization |
| PL/pgSQL RPC | progress, timer, resources, ICAI, planner, community, billing | repository/service transactions; do not emulate PostgREST RPC surface blindly |
| `FOR UPDATE` row locks | progress undo, payment reconcile | D1 transaction + optimistic/version/idempotency strategy; prove concurrency behavior |
| advisory transaction lock | resource quota | D1-safe serialized/idempotent quota transaction strategy |
| `uuid` / `gen_random_uuid()` | most user/event rows | preserve existing UUID strings; generate new IDs in trusted Worker code |
| identity/bigserial | sequence IDs, change events, catalog version items | preserve imported values; define D1 INTEGER identity strategy explicitly |
| `timestamptz` | user/activity/history | normalized UTC ISO-8601 TEXT contract |
| `date` / `time` | attempts/events/goals | normalized ISO TEXT contract with service validation |
| `jsonb` + JSON functions | settings, progress snapshots, payloads, Mentor evidence | canonical JSON TEXT + service validation/JSON1 where appropriate |
| PostgreSQL arrays | ICAI source arrays, revision intervals/weekdays | D1 JSON or normalized child tables based on query needs |
| `unnest`, `ANY`, `ALL` | revision planner | rewrite as service logic or normalized relational queries |
| `pg_timezone_names` | study/profile timezone validation | validate IANA timezone in Worker/JavaScript (`Intl`) |
| `make_interval` | planner/billing duration logic | explicit deterministic date arithmetic in service layer |
| generated stored expression + `regexp_replace` | `academic_catalog_aliases.normalized_alias` | compute with shared canonical normalization code before write or D1-safe expression |
| `DISTINCT ON` | canonical current chapter/topic selection | window function / ordered query rewrite |
| GIN + `to_tsvector` | community message search | D1-supported full-text strategy or explicit normalized search; no direct GIN translation |
| partial indexes | undo, active sync, active model, payment ID | recreate only after D1 support/access-pattern verification |
| expression indexes | lower-title search, single running sync | rewrite/test D1 expression index support or use stored normalized fields |
| regex operator `~` | currency constraint | service/check-compatible validation |
| `octet_length` | resource/note limits | enforce byte limits in service before write |
| FK `auth.users` | most user-owned rows | application `users` identity table in D1; preserve user UUIDs |
| cascade/restrict/set null | relational ownership/history | reproduce each FK action intentionally and test deletes |
| self-referencing FKs | syllabus supersedes, resource replacement, message reply | preserve with D1 foreign keys and migration ordering |
| `ON CONFLICT` / upsert | bootstrap, aliases, sync, events | D1 upsert syntax/RETURNING behavior must be verified; keep idempotency semantics |
| `RETURNING` | RPC mutation flows | verify D1 support for each use or split safely inside transaction |
| `IS DISTINCT FROM`, `NULLS FIRST` | billing/planner logic | rewrite explicitly where SQLite ordering differs |
| `pgcrypto` extension | Phase 11 | no extension; Worker WebCrypto/UUID generation |
| PostgREST filters | billing service REST calls | parameterized D1 repository SQL |
| Supabase Realtime `postgres_changes` | community | DO/WebSockets only if required; persist durable history in D1 |
| Supabase Storage policies | avatars | R2/private Worker authorization |

## 12. Migration-file inventory

Every migration present at the Phase 1 baseline is listed below and must be considered by the D1 design:

1. `20260830000100_phase0_core.sql` — profiles, settings, health, base updated-at/RLS.
2. `20260830010100_phase1_user_preferences.sql` — user preferences/RLS.
3. `20260830020100_phase2_auth_profiles.sql` — onboarding profile fields, auth trigger, avatar bucket/policies.
4. `20260830020200_phase2_auth_function_permissions.sql` — auth-trigger execute hardening.
5. `20260830020300_phase2_social_login_only.sql` — removes historical phone-OTP table.
6. `20260830030100_phase3_academic_engine.sql` — academic hierarchy, syllabus versions, chapters/topics, attempt mapping.
7. `20260830030200_phase3_academic_index_hardening.sql` — academic FK/lineage indexes.
8. `20260830080100_phase8_icai_sync_engine.sql` — ICAI source/snapshot/attempt/resource/review model + sync RPCs.
9. `20260830080200_phase8_security_hardening.sql` — ICAI RPC service-role boundary.
10. `20260830080300_phase8_index_hardening.sql` — ICAI/reference index hardening.
11. `20260830090100_phase4_smart_student_dashboard.sql` — dashboard event telemetry.
12. `20260830120100_phase5_progress_tracker.sql` — normalized progress/event truth + RPC mutations.
13. `20260830121500_phase5_guard_latest_undo.sql` — latest-event concurrency guard for undo.
14. `20260830130000_phase6_study_planner_calendar.sql` — timer/session/tasks/goals/calendar + RPCs.
15. `20260830133000_phase6_timezone_and_task_guard.sql` — timezone persistence/validation and task academic guard.
16. `20260830140100_phase7_notes_resources.sql` — notes, uploads, moderation/reporting and resource RPCs.
17. `20260830141500_phase7_storage_write_hardening.sql` — server-only upload/storage writes.
18. `20260830142000_phase7_privilege_hardening.sql` — Phase 7 function/table privilege hardening.
19. `20260830153000_phase7_cloudflare_r2_resource_storage.sql` — user-resource bytes switch to R2; metadata remains Supabase.
20. `20260830154500_phase7_r2_rpc_privilege_hardening.sql` — R2-era RPC privilege hardening.
21. `20260830155000_phase7_r2_transition_default_guard.sql` — R2 transition/default guard.
22. `20260830170000_phase9_smart_revision_planner.sql` — revision rules/events/daily plans/forecasts and automation triggers.
23. `20260830170500_phase9_revision_schedule_completion_hardening.sql` — revision completion hardening.
24. `20260830171000_phase9_trigger_safety.sql` — planner trigger safety.
25. `20260830190000_phase10_community_v2.sql` — community schema/RLS/RPCs/channel synchronization.
26. `20260830190500_phase10_channel_sync_trigger_hardening.sql` — channel-sync trigger hardening.
27. `20260830191000_phase10_community_fk_indexes.sql` — community FK/index hardening.
28. `20260830211500_phase11_plans_entitlements_billing.sql` — plans/entitlements/subscriptions/payments and reconciliation.
29. `20260830212000_phase11_payment_idempotency_hardening.sql` — prevents duplicate entitlement grants for duplicate payment delivery/order.
30. `20260830212500_phase11_atomic_resource_quota.sql` — atomic storage quota + resource metadata creation.
31. `20260831030000_phase11_source_truth_hardening.sql` — configurable commercial truth and billing visibility/idempotency hardening.
32. `20260901160000_mentor_phase1_foundation.sql` — Mentor intelligence/evidence/model/personalization foundation.
33. `20260901170000_mentor_phase2_academic_catalog.sql` — canonical Academic Catalog, aliases, lineage, history views/resolvers.

No migration in this list is deleted or rewritten by Phase 1.

## 13. Phase 1 repository/service abstraction decision

Phase 1 does not try to recreate Supabase's query builder as a fake generic database API. That would leak PostgREST semantics into the D1 design.

Instead:

1. `lib/data/migration-contract.ts` defines provider-neutral domain/repository boundaries and explicit phase gates.
2. Existing domain services are treated as the current Supabase adapter boundary.
3. Provider creation stays inside infrastructure/domain adapter code.
4. Auth route provider calls are behind `lib/auth/provider.ts`.
5. Profile/onboarding/avatar persistence is behind `lib/profile/service.ts`.
6. Community browser realtime is behind `lib/community/realtime-provider.ts`.
7. Phase 2 will implement D1 repositories per domain instead of teaching feature code D1 SQL.

## 14. Definition-of-Done freeze

Phase 1 must finish with all of the following still true:

- active persistence is Supabase;
- active auth is Supabase Auth;
- no production rows are copied or mutated for migration;
- no D1 database is activated;
- no source ingestion is added;
- Mentor Phase 3 is not started;
- Mentor Phase 2 canonical identity is unchanged;
- existing Cloudflare R2/Worker boundaries are reused;
- Phase 2 is not implemented.
