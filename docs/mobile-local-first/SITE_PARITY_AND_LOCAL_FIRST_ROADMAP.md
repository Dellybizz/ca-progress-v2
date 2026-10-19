# CA Progress: site parity and local-first mobile roadmap

Status: Phase 1 implementation in progress, 27 September 2026. Scope: student website, Android, and eventual iOS client. This document does not certify an APK or authorize a production rollout.

## Product contract

The installed app presents the same CA Progress product as the mobile site: recognizable navigation, terminology, feature set, visual hierarchy, academic context, and chapter workflows. The agreed mobile study navigation is **Today / Study / Focus / Plan / Progress**, with Explore in the header for the complete website directory. This is a navigation grouping over existing routes, not a new course taxonomy. Desktop retains its richer sidebar. Preserve Dashboard and Today as distinct existing routes: Dashboard summarizes the attempt, Today executes the current plan. Dashboard remains available in Explore.

The app opens its bundled UI without network access. After an authenticated initial download, local account data is the read source for every supported student screen. A supported edit commits to local storage and appears throughout the app before any network request; a durable outbox later reconciles it with the Cloudflare API and website. A generic installation cannot contain a student's private records before authentication. Current billing, identity verification, shared community permissions, and other server-authoritative decisions remain explicitly online.

## Current verified baseline

- `components/shell/navigation-contract.ts` defines the website's Workspace, Plan & review, Knowledge, People, and Account groups. It marks Dashboard, Today, Focus, and Progress as mobile-primary; More exposes the rest.
- The Phase 0 baseline rendered Home, Today, Focus, Progress, More. Phase 1 changes the native shell to Today, Study, Focus, Plan, Progress and adds Explore in the app bar. Search, notifications, and account remain in the app bar. Explore includes the attempt switcher and all website navigation groups.
- Screenshots dated 27 September show the app's neutral canvas, white bordered cards, violet accent, five-item bottom bar, and January 2027 Intermediate context. They show 1/94 first coverage, zero Today tasks, a separate Focus timer, chapter filters in Progress, and a Syllabus subject view. These values are examples from one account, not design defaults.
- `packages/mobile-data` already provides account-scoped SQLite, a mutation outbox, and a sync cursor for several study domains. Test entry and attempt switching currently require connectivity. Analytics and some account/people features use saved server snapshots. Initial bootstrap is bounded; current conflict policy names do not themselves implement automatic reconciliation.
- Existing `CA_PROGRESS_NATIVE_LOCAL_FIRST_IMPLEMENTATION_PLAN.md` contains the native foundation history and architectural safety rules. This roadmap adds product placement, complete offline coverage, and cross-platform acceptance criteria; it does not declare earlier phases complete.

## Feature placement: no feature disappears

| Existing route / feature | Mobile entry point | Contextual entry point | Offline target after first sync |
| --- | --- | --- | --- |
| Dashboard, countdown, quick actions | Explore → Workspace → Dashboard | Today, attempt switcher, notifications | Full from local records and bundled rules |
| Today plan | Today | Dashboard, Planner, chapter | Full |
| Focus timer and session review | Focus | Today, task, chapter | Full, including restart recovery |
| Progress and syllabus completion | Progress | Subject, chapter, Dashboard | Full |
| Planner, Calendar, revision settings, Goals | Plan / Explore → Workspace / Plan & review | Today and chapter actions | Full for personal edits |
| Tests and saved attempts | Explore → Plan & review → Tests | Chapter / related task | Full for personal entry and review |
| Syllabus, chapter hub, Notes | Study / Explore → Knowledge | Progress, Search, chapter | Full after catalogue and account sync |
| Resources, ICAI resources, updates | Explore → Knowledge | Chapter resource links, search, attention | Catalogues locally; files available when bundled or pinned; freshness shown |
| Analytics, Forecast | Explore → Plan & review | Progress overview | Locally derived when inputs suffice; explicit insufficient-data states |
| Community, Study buddy, Activity | Explore → People | Relevant notifications and profile | Recent saved data/readable offline; queued permitted edits; live shared state online |
| Pricing, Billing, Settings, Profile | Avatar / Explore → Account | Entitlement or academic-context prompts | Cached display and device settings; payment and account authority online |

Explore must present actual website group labels, a Search entry, and clear scroll affordance. The selected bottom tab stays consistent on every nested page. Search covers routes and downloaded academic records offline; remotely indexed content may enrich results when connected. Do not move a feature solely to reduce the number of menu rows.

## Phase 0 — exact inventory and screen contract

- Freeze a branch SHA and record website/mobile route matrices, screenshots, server endpoint dependencies, local tables, edit rules, permissions, and source-of-truth status.
- Compare at least Home, Today, Focus, Progress, Syllabus, Chapter Hub, Planner, Tests, Notes, Resources, Analytics, More, Profile, and all failure/empty states between mobile site and app.
- Classify each interaction: offline write, offline read after first sync, downloaded file, shared-online action, or server-authoritative action. Record missing parity instead of replacing it with generic cards.
- Define test accounts: fresh guest, fresh signed-in, 1/94 sparse account, populated account, pending edits, conflict, multi-attempt, and offline-returning account.

**Done when:** every student route and primary action has a named placement, data owner, offline contract, and screenshot/interaction acceptance reference. No code or production state changes in this phase.

## Phase 1 — site-faithful mobile UI and navigation

- Reuse website design tokens, navigation names, component states, icon semantics, typography, and route hierarchy in the installed app. Keep mobile-specific density, safe-area spacing, touch sizes, and bottom-bar clearance.
- Fix real screenshots' layout defects: oversized empty cards, clipped subject chips, sparse Progress metrics, uneven Focus form styling, and nested More discoverability.
- Keep Dashboard and Today separate: Home gives attempt overview and a real data-backed recommendation; Today presents the editable timeline and actionable empty state. Never fabricate a recommendation when no evidence exists.
- Make Chapter Hub connect status, revision dates, understanding, notes, resources, tests, and Focus without deleting the existing standalone libraries.
- Add global Search, account access, notifications, and stable back/deep-link behavior to all supported routes. Keep account/billing under the existing account area.

**Done when:** mobile-site-to-app screenshots and task flows match in terminology, content, affordances, and interaction outcome at compact and large phone widths; all existing student features remain reachable; no placeholder page masquerades as a completed feature.

## Phase 2 — complete local reads and instant personal edits

- Build a versioned, bundled public academic catalogue for supported levels/groups/attempts, plus fonts, icons, empty states, and help content. Verify licensing and update manifests for ICAI files before including binaries.
- Paginate the first authenticated download to complete all supported personal history, store it by account and academic context, and continue from a durable cursor. Clearly distinguish never-downloaded data from an empty account.
- Route Dashboard, Today, Focus, Progress, Planner, Tests, Notes, Syllabus/Chapter Hub, Analytics, and Forecast reads through local repositories. Compute affected summaries in the same local transaction or from subscribed local selectors.
- Queue offline test entry, progress and revision edits, planner changes, and changes to previously downloaded attempt contexts. Preserve unsynced edits in their original attempt rather than blocking all attempt changes.
- Make queued edits and download state visible but unobtrusive; recover after force quit and relaunch. Protect private records/files on sign-out and account switch.

**Done when:** in airplane mode after the first account download, the user can open all core study routes, change a revision, create a test attempt, edit the plan, and switch between downloaded attempts; all related local screens update immediately and retain their values after app restart.

## Phase 3 — shared web/native sync and conflict semantics

- Use stable operation IDs, idempotency, per-entity versioning, server change journal, scoped deletion events, resumable pagination, and atomic local cursor commits. Both website and app participate in the same contract; web direct writes must emit the same versioned changes.
- Define a rule for each actual entity and field. Independent fields merge; new test attempts are distinct immutable IDs; additive study sessions remain additive; progress milestones preserve legitimate undo/correction operations; note conflicts retain both versions or request review. Rejected academic contexts remain recoverable.
- Do not use device time or server arrival order as a blanket latest-wins rule. Preserve competing operations and show a review choice where a same-field order cannot be established reliably. Payments and entitlements remain server-authoritative.
- Pull deltas without blocking the locally rendered screen. Add bounded retry/backoff, changed-context handling, and an account-visible pending/conflict status.

**Done when:** offline Android edits, online website edits, and a second-device edit converge under documented rules in both reconnection orders. No edit silently disappears; retries produce no duplicate test/session; a conflict is actionable; the website reflects the synced result.

## Phase 4 — offline content and speed

- Bundle the small, broadly useful catalogue and UI assets. Offer versioned per-level/attempt content packs and per-subject pinned PDFs with checksums, progress, resume, storage usage, and remove/re-download controls.
- Index downloaded chapters, notes, and permitted document text locally. Derive Today/Progress summaries locally and avoid network blocking on navigation.
- Measure APK/AAB installed size, iOS bundle/download size, cold/warm start, screen transition, edit-to-visible latency, initial account download, storage use, and battery/network costs on low-end and current phones. Set budgets from measured baselines before declaring improvements.

**Done when:** installed UI opens offline; downloaded content and search work without a connection; the user can see which files are available offline; size and performance comparisons show the actual trade-off against the current build.

## Phase 5 — real-device certification and staged release

- Repeat the Phase 0 flows on Android phones and an iOS build, including small screen, large text, dark mode, screen reader, poor network, captive/offline network, storage pressure, process kill, account switch, upgrade, and logout.
- Verify personal data deletion/retention policy and local file isolation. Run the full existing repository suite and release gates. Ensure website and app remain compatible during partial rollout and old client versions.
- Produce signed test artifacts and a route-by-route evidence report. Gate store submission and production deployment on a separate review of actual device evidence.

**Done when:** all route contracts pass on devices, no critical web regression exists, conflict and recovery evidence is attached, and the installed app has no unexplained website handoff for a student-core action.

## Out of scope until the study product works

The attached strategic analysis proposes CA Passport, articleship applications, firm workspaces, skills verification, mentorship, placements, and professional profiles. These can become future programmes after validation, with their own privacy, moderation, and server-authoritative requirements. They must not be represented by empty tabs or fabricated cards in the study app. If launched, reevaluate navigation with student/firm research rather than squeezing the career marketplace into the existing five tabs.

## Release and measurement rule

For each phase, record the exact SHA, before/after screen evidence, affected routes, device test results, remaining online dependencies, and rollback path. Do not equate compilation, a generated mockup, or a successful server deployment with mobile product completeness. Advance only after the phase-specific definition of done is demonstrated.
