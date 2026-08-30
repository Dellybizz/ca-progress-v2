# Phase 12 — Operations Admin Platform Acceptance

Source of truth: CA Progress V2 detailed phased plan, Phase 12.

## Acceptance matrix

| Requirement | Implementation evidence |
| --- | --- |
| Non-admin cannot access admin data even by direct API request | Every new `/api/admin/*` route calls `requireAdminOperator(...)`; fresh role state comes from `admin_users`. Phase 12 tables have RLS, no browser policies and revoked browser grants. |
| Role hierarchy invariants are enforced server-side | `phase12_set_admin_role` / `phase12_set_admin_active` reject self changes, parent-owner modification, equal/higher targets and equal/higher grants. |
| Every sensitive Phase 12 change is auditable | Privileged Phase 12 database RPCs write `admin_audit_logs` with request ID and before/after state. Audit UPDATE/DELETE is rejected by trigger. Existing ICAI/moderation workflows retain their earlier append-only/domain audit events. |
| Large member lists paginate | `phase12_list_members` validates page/limit, caps limit at 100 and uses SQL LIMIT/OFFSET plus `count(*) over()`. UI defaults to 25/page. |
| ICAI and payment health are visible | `/admin` and `/admin/platform` show latest ICAI sync, payment failure counts, latest payment event and private billing Worker Razorpay credential/webhook health. |

## Phase 12 scope surfaces

- `/admin` overview and health
- `/admin/members`
- `/admin/icai-sync` and its review queue
- `/admin/community/moderation`
- `/admin/resources/moderation`
- `/admin/content`
- `/admin/plans`
- `/admin/platform`
- `/admin/notifications`
- `/admin/audit`
- protected `/api/admin/*` endpoints

## Operations controls

Feature flags are server-read on the mutation paths they control: Community writing, user resource upload, Smart Planner mutations, paid checkout and manual ICAI sync. Maintenance mode uses the same server decision layer and allows an active admin operator to retain recovery access.

## Phase boundary

No Phase 13/later feature is introduced. Notification delivery is not invented: Phase 12 owns composer/templates; actual delivery requires an explicit consuming workflow if a later approved phase defines one.
