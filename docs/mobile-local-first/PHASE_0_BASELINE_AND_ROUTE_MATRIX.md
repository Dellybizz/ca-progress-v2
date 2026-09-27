# Phase 0: student product baseline and route/data inventory

Status: **complete as a repository and supplied-screenshot audit** on 27 September 2026. Real-phone walkthroughs and a populated test-account capture remain evidence gaps for Phase 1; this document does not claim device certification.

Baseline: branch `mobile-phase7-student-parity`, commit `ba21208f9a451f518278c4a54cff713d4fefa328` (the preceding local commit only added the proposed roadmap). No runtime code, production database, or deployed app was changed for this phase. No push.

## Audit sources and interpretation

- Website routes: `app/(student)/**/page.tsx` (33 pages), `components/shell/navigation-contract.ts` and `components/shell/mobile-navigation.tsx`.
- Bundled app routes and interaction gates: `apps/mobile/src/main.tsx`, `runtime.ts`, `people-insights.tsx`, `account-p6.tsx`, `settings-p6.tsx`.
- Local entities and sync: `packages/mobile-data/src/schema.ts`, `repository.ts`, `sync.ts`, `people-insights.ts`, `community.ts`, `resources.ts`; server `/api/v1/sync/{bootstrap,push,pull}` and related `/api/v1` feature endpoints.
- Supplied phone screenshots dated 27 September 2026 in `../upload/` (outside the repository). Inspected Today, Focus, Progress, Syllabus, Calendar, Analytics, Forecast, Notes, Resources, Profile, Settings and related scrolling captures. They are evidence of **one sparse installed account** (Intermediate, January 2027; 1/94 chapters; 0 Today tasks). They do not prove mobile-web parity or populated flows.
- The two supplied UI concept images at 23:32 and 23:34 are **navigation references only**. Their fabricated scores, chapter completions, firms, MCQ sets, career readiness, and task data are not site requirements or account data.

The website's current primary mobile entries are Dashboard (Home), Today, Focus, Progress, More; desktop sidebar groups Workspace, Plan & review, Knowledge, People, Account. The proposed **study-mode** shell is Today, Study, Focus, Plan, Progress with a global Explore directory. Career and Network from the first concept belong to a separately validated later lifecycle mode; no present student route may vanish because of this proposed reorganization.

Legend: **L** local study reads and immediate edits after initial authenticated download; **C** locally retained content/files only when downloaded or bundled; **S** saved snapshot usable offline, server needed for freshness or shared actions; **O** server-authoritative online action. These are **targets**, not claims of today's behavior. `native` means a bundled route exists; `handoff` means the shell currently falls back to the website for a navigation item; `nested gap` means a site URL has no equivalent deep link but some information may appear in another native route.

## Exact route and feature placement (33 student page routes)

| Site route | Existing site capability / owner | Proposed entry | Current bundled-app correspondence | Offline target / main gap |
| --- | --- | --- | --- | --- |
| `/dashboard` | Exam context, recommendation, summary; dashboard service + profile/progress/task/session data | Today → overview | `dashboard` native | L; keep overview distinct from editable Today plan |
| `/dashboard/exam` | Exam countdown/details; attempt catalogue + context | Today → attempt detail | nested gap | C/S; verified date provenance and deep link |
| `/planner/today` | Ordered day's tasks; task/goal/revision data | Today → plan | `today` native | L; populated timeline comparison |
| `/study` | Focus timer, saved sessions/review; study_sessions and local timer | Focus; contextual from chapter/task | `focus` native | L; background/process-restart proof |
| `/progress` | Chapter stages and understanding; chapter_progress and preferences | Progress | `progress` native | L; subject filter/toggle parity |
| `/syllabus` | Subjects and chapters; academic catalogue | Study → Syllabus | `syllabus` native | C/L; complete catalog packaging |
| `/subjects/[subjectSlug]` | Subject details/chapter listing; catalogue + progress | Study → subject | nested gap | C/L; link selection must retain subject |
| `/subjects/[subjectSlug]/progress` | Subject-filtered progress; chapter_progress | Progress → subject | nested gap via general Progress | L; subject URL/context and back stack |
| `/chapters/[chapterId]` | Chapter Hub: stages, understanding, notes and linked resources; chapter workspace + progress | Study/Progress → chapter | nested gap via chapter in native Progress | L/C; site Chapter Hub breadth not yet certified |
| `/planner` | Planner, tasks, ordering; tasks + goals | Plan | `planner` native | L; full rule and interaction parity |
| `/calendar` | Calendar/schedule; tasks + planning events | Plan → Calendar | `calendar` native | L; empty and populated events |
| `/planner/revision-settings` | Revision intervals; revision_rules | Plan → Revision settings | rendered inside native `planner`, no direct native path | L; direct route/deep link gap |
| `/goals` | Goals and targets; goals + planner_goal_phase8 | Plan → Goals | **handoff**, no `nativePaths` mapping | L; direct native feature gap |
| `/tests` | Saved test attempts; test archive | Study → Practice/Tests; chapter; Progress | `tests` native | L target; **new attempt currently online-only** (`/api/v1/test-archive`) |
| `/analytics` | Study and test summaries; sessions/progress/test evidence | Progress → Analytics | `analytics` native, saved server snapshot | L target; local derived metrics missing |
| `/analytics/forecast` | Evidence-gated completion forecast; progress, pace, verified attempt | Progress → Forecast | `forecast` native, saved server snapshot | L when evidence exists; retain insufficient-data gate |
| `/notes` | Notes library/editor; notes + attachments | Study → Notes | `notes` native | L; editor/detail parity |
| `/notes/[id]` | Note detail/editor; note record | Study → Notes → note | nested gap | L; note deep link/attachments |
| `/resources` | Personal/shared resource list and uploads; metadata + R2 files | Study → Resources | `resources` native | C metadata/saved file; upload can queue with entitlement checks |
| `/resources/[id]` | Resource details/access; metadata + permission | Study → Resources → item | nested gap | C/S; per-file access and cached authorization |
| `/resources/[id]/view` | Document viewer; R2 signed access | Study → Resources → viewer | nested gap | C only if downloaded; online for uncached file |
| `/resources/icai` | Official ICAI resource browsing; ICAI catalogue/links | Study → ICAI material | **handoff**, no `nativePaths` mapping | C for bundled/pinned files; freshness and license checks |
| `/updates` | ICAI notices; synced official updates | Explore → ICAI updates | **handoff**, no `nativePaths` mapping | S/C; show update timestamp |
| `/community` | Channels and messages; D1 + Durable Object | Explore → Community | `community` native | S for saved messages, queued permitted send; live activity online |
| `/community/[channel]` | Channel conversation/reactions/read state | Community → channel | internal native selection, no route-equivalent deep link | S; offline drafts/read, live moderation and reactions online |
| `/study-buddy` | Buddy relationships; server `people` and study-profile endpoints | Explore → Study Buddy | `buddy` native, saved snapshot | S; relationship authorization online |
| `/study-profile/[userId]` | Public/private study identity; server privacy/profile | Explore/People → profile | nested gap | S for previously saved authorized fields; privacy server-authoritative |
| `/activity` | XP/activity and rankings; xp_ledger + leaderboard | Explore → Activity | `activity` native, snapshot | S; server-authoritative leaderboard/XP |
| `/settings` | Account/settings index | Avatar → Settings | `settings` native plus extra native detail screens | Mixed L/S/O by action |
| `/settings/profile` | Display name, academic level/group/attempt; profiles + academic catalogue | Avatar → Profile/attempt | `profile` native | L target for downloaded attempt switch; currently online and pending-edit gated |
| `/pricing` | Plans and policy; billing service | Avatar → Pricing | `pricing` native snapshot | S read, O purchase/entitlement |
| `/billing` | Subscription/invoices; Razorpay/server ledger | Avatar → Billing | `billing` native snapshot | S read, O account changes/checkout |
| `/feature-tour` | Tour progress | Avatar → Feature tour | `tour` native | L for local tour state; sync later |

Navigation-contract extras: `Delete account` points to `/account-deletion`, but **no corresponding student page is present among the 33 page files**; the app aliases that path to `deletion` and calls `/api/v1/account` online. Verify the website route or intentional redirect in Phase 1. Notifications are an app-bar surface rather than a student page; local saved notifications and queued read state exist, while delivery/subscription is online. Extra native settings pages (appearance, Focus preferences, security, exports, offline storage, privacy) have app hash routes but not matching student-page routes; compare their actual website section controls, not only URLs. `/goals`, `/updates`, and `/resources/icai` are the three listed nav paths with no direct native mapping. This inventory excludes admin-only pages and authentication routes.

## Data ownership, mutation and connectivity matrix

| Domain | Local storage now | Server/API authority | Present edit behavior | Target behavior and risk |
| --- | --- | --- | --- | --- |
| Academic subjects/chapters/attempts | `academic_catalog`; attempted context in profile projection | D1 academic and verified attempt tables; sync bootstrap | read downloaded account scope | versioned public pack + deltas; never fake official exam dates |
| Progress and understanding | `progress_records`, outbox | `chapter_progress`, `chapter_workspace_preferences`; sync push/offline mutation | immediate local stage writes | multi-device stages, undo/correction semantics |
| Today, planner, goals, revision | `planner_items`, `application_config`, outbox | `tasks`, `goals`, `revision_rules` | local task/goal/revision writes where implemented | complete planner parity and context-scoped pending edits |
| Focus, sessions, review | `timer_state`, `study_sessions`, outbox | `study_sessions`, focus mutations | local timer/session actions | recovered time and idempotent append-only sessions |
| Notes | `notes`, outbox | `notes`, file/attachment services | local drafts and save | complete history, attachments, retain both versions on conflict |
| Tests | saved test snapshot (`people-insights`), no test outbox entity | `/api/v1/test-archive`, test archive tables | POST requires online | distinct local attempt IDs, queued create, local analytics update |
| Analytics/forecast | saved snapshot | `/api/v1/insights/analytics`; forecast model | server fetch then snapshot | locally derived from complete inputs; preserve evidence gate |
| Resources/files | `resource_metadata`, `local_file_index`, `file_transfers` | `/api/v1/resources`, signed R2 access, entitlements | selected files persist offline | bundle/pin/download with manifest, checksums, account isolation |
| Community | local channel/message tables, drafts/read/outbox | `/api/v1/community`, D1 and Durable Object | saved read/draft, queued message; reaction online | recent offline history and authorized queued actions; moderation online |
| Buddy/activity/profile privacy | projections and saved feature snapshots | `/api/v1/people`, `/api/v1/study-profile`, XP/leaderboard | saved reads; relationship/privacy writes online | offline readable history; shared permissions server-authoritative |
| Profile/attempt | `profile_projection`, academic context key | `/api/v1/profile`, server academic context | online save; switch blocked by pending outbox | downloaded-context offline switch, no cross-attempt loss |
| Account/billing/security | account snapshots/device settings | `/api/v1/account`, billing, sessions/exports | account actions online | saved display only; payments/revocations/deletion stay online |

## Known architecture blockers documented for later phases

1. Sync coordinator calls `/api/v1/sync/bootstrap` on every sync cycle before push/pull; this couples routine sync to a multi-query bootstrap. Bootstrap caps progress/tasks at 1500, goals 500, notes/sessions 1000, chapters 3000, activity 100, and tracked mobile entities 5000. No completeness proof for larger histories.
2. `/api/v1/sync/push` rejects stale `baseVersion`; `packages/mobile-data/src/sync.ts` stores the 409 as a conflict. `conflictPolicy()` names rules but does not execute automatic entity-field resolution. There is no guarantee that edits at 14:00 and 14:00:05 converge by original edit order.
3. Changed academic context plus pending outbox currently aborts sync; profile/attempt switch explicitly requires online and no pending. Per-context outbox preservation and cross-context recovery are needed.
4. The local database is an account-scoped repository, but not every website feature reads from it; tests, analytics, account/privacy, and relationships still use direct API calls or snapshots. Bundling a bigger APK alone does not change this.
5. `mobile-feature-parity.ts` is a legacy policy manifest and sometimes describes website/offline prototypes rather than the current bundled app. This matrix checks actual native routes and guards; update the manifest only after Phase 1 behavior is proved.
6. Web direct writes and native outbox must use one versioned operation contract. Physical client timestamps or server arrival order alone do not establish the user's intended last edit.

## Screenshot evidence and missing test fixtures

| Supplied capture | Observed state / design defect to verify in Phase 1 |
| --- | --- |
| `Screenshot 2026-09-27 182813.png` | Today: 0 planned/completed; large empty timeline and stacked blocks; compare site empty state. |
| `182824.png`, `182833.png` | Focus: timer, subject/chapter selectors, idle 25:00; inconsistent bare select styling and significant vertical area; no active session proof. |
| `182903.png`, `183150.png` | Progress 1/94 and Syllabus Taxation chapters; oversized summary blocks and horizontally cramped subject filters; chapter hub not shown. |
| `182937.png` | Calendar month grid with no tasks; populated schedule untested. |
| `183014.png`, `183022.png`, `183034.png`, `183046.png` | Analytics/Forecast sparse evidence, forecast withheld; long metric cards and explanatory content; do not invent readiness. |
| `183215.png`, `183235.png` | Resources empty library and Notes empty/editor state; attached file and saved note proof missing. |
| `183245.png`, `183255.png` | Settings section list and Profile January 2027; account edit/switch offline proof missing. |

Screenshots alone cannot certify accessibility, hit target size, parity with the **live mobile website**, login recovery, populated layouts, device performance, or sync correctness. Phase 1 must capture live site and app at matching account/viewport. Required fixture set: guest; new logged-in unset academic context; sparse 1/94; populated tasks/sessions/notes/tests/resources/community; multiple attempts; pending outbox; stale/conflict; offline after first sync; expired session; second device plus website. No fixture values may be rendered as defaults for a real student.

## Phase 0 acceptance and handoff

- [x] Exact branch/SHA frozen; working tree clean before this audit.
- [x] 33 student page routes enumerated; native correspondence and missing routes identified.
- [x] Navigation mapping uses existing website features and identifies future-only Career/Network content.
- [x] Each route has a target offline category and owner; key personal/shared actions classified.
- [x] Current sync, bootstrap completeness, conflict, attempt and test blockers recorded.
- [x] Supplied image/screenshot evidence indexed with its limits.
- [ ] Matching live-site/account/device recordings: unavailable in this read-only repository/screenshot audit; **Phase 1 prerequisite, not a claim of Phase 0 device certification**.

Phase 1 should first build matched screen/interaction references for the fixture set, then implement the shell and page refinements. Do not delete a route or change production navigation based solely on the concept images. A later release report should link actual device recordings and two-device sync evidence.
