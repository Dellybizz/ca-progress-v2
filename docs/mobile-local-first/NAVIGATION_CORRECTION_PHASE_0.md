# Navigation correction — Phase 0 audit

Status: **repository/reference audit complete; device and authenticated website comparison outstanding**. Date: 28 September 2026 (IST). This is evidence for the navigation-correction programme, separate from the older native/mobile Phase 0 and the earlier site-parity Phase 0.

## Frozen baseline and sources

- Branch: `mobile-phase7-student-parity`. Local HEAD `73ccf22057d125ca4e2022e344dbfdcd2a8e32ed`; published equivalent tree `c349a3c174cbc09a784ad89bf47f8705f6448936` at remote commit `233312b1814d7b8ae4a2d61df273a7b7da17d705`. Working tree clean before this document.
- Website navigation: `components/shell/navigation-contract.ts`, `components/shell/mobile-navigation.tsx`. Native navigation and routing: `apps/mobile/src/student-navigation.ts`, `main.tsx`, `runtime.ts`, `styles.css`.
- Full 33-student-route, data-owner, and offline target matrix: `PHASE_0_BASELINE_AND_ROUTE_MATRIX.md`. Release blockers: `PHASE_5_RELEASE_READINESS.md`. Do not substitute this focused inventory for either document.
- User-supplied study-only concept: `ChatGPT Image Sep 27, 2026, 11_34_34 PM(1).png`, stored outside the repository in `upload/`. The preceding `11_32_27 PM.png` concept adds Career and Network. The user requested navigation/other shell ideas from the reference, preserving the site's content structure. The illustrated subjects, marks, scores, test sets, firms, schedule dates and recommendations are illustrative, not requirements or account records.
- The supplied installed-app captures from 27 September show a **previous** Home/Today/Focus/Progress/More bottom bar. The current source contains Today/Study/Focus/Plan/Progress. Do not treat those screenshots as proof of the current APK, nor the concept image as an installed-app capture.

## Existing placement and required comparison

“Current app” below means this branch's code, not a device-verified behavior. The target column names *candidate navigation areas*, not approved new pages. Preserve all 33 site URLs and their route-specific content and actions.

| Existing feature/site path | Current mobile website | Current bundled app | Reference-based area to evaluate | Gap or risk |
| --- | --- | --- | --- | --- |
| Dashboard `/dashboard`, exam detail `/dashboard/exam` | Dashboard in Workspace; Home primary | Dashboard in Explore, `dashboard` shares Today selected state; exam detail nested gap | Today overview with attempt context | Dashboard and editable Today are distinct working views; decide placement without silently merging or fabricating “next up” |
| Today `/planner/today` | Today primary | Today bottom tab | Today | Current Today is task timeline; concept's populated sample is not real user data |
| Focus `/study` | Focus primary | Focus center bottom tab; timer screen | Focus action/session | Reference treats Focus as central action; check active-session return and background state |
| Subjects `/syllabus`, `/subjects/[subjectSlug]`, `/chapters/[chapterId]` | Syllabus in Knowledge | Study bottom tab maps to `syllabus`; subject and chapter are nested state rather than equivalent URLs | Study, subject, chapter | Preserve chapter workflow and selected subject/back context; do not replace Chapter Hub with concept cards |
| Progress `/progress`, `/subjects/[subjectSlug]/progress` | Progress primary | Progress bottom tab; subject filtered native view | Progress | Subject deep link and back behavior need matched flows |
| Tests `/tests` | Tests in Plan & review | Tests reachable via Explore; `tests` selected as **Study** in bottom bar | Practice/Tests | Reference gives Practice its own major area; site's actual test archive/attempt form must remain intact; do not invent MCQ/RTP/MTP screens |
| Planner `/planner`, Calendar `/calendar` | Planner Workspace, Calendar Plan & review | Plan bottom tab, Calendar within Explore | Plan | Contextual calendar/plan navigation; preserve task interaction and time data |
| Revision settings `/planner/revision-settings`, Goals `/goals` | Plan & review | Revision rendered in planner; Goals has native route but default content falls back to Planner; direct deep links differ | Plan and Progress context | Check direct-route/selected-tab behavior and original Goals content; avoid treating a route alias as full parity |
| Analytics `/analytics`, Forecast `/analytics/forecast` | Plan & review | Native saved-snapshot screens, selected as Progress | Progress | Preserve evidence-gated forecast and offline provenance |
| Notes `/notes`, `/notes/[id]` | Knowledge | Native notes under Study, nested detail state | Study | Detail links and editor navigation require comparison |
| Resources `/resources`, `/resources/[id]`, `/resources/[id]/view` | Knowledge | Native metadata/downloads under Study, nested detail; view availability depends on saved file | Study | Cached files versus online permission, and deep link return |
| ICAI resources `/resources/icai`, updates `/updates` | Knowledge | Website handoff for both from Explore | Study/Explore | Explicit handoffs; do not advertise an offline catalogue not actually present |
| Community `/community`, `/community/[channel]`, Buddy `/study-buddy`, public study profile | People | Native Community/Buddy in Explore; nested channel/profile gaps | Explore → People | No Career/Network service should appear from the separate aspirational concept |
| Activity `/activity` | People | Native Activity in Explore | Explore/Progress context | XP and rankings have different data authority from personal progress |
| Profile `/settings/profile`, Settings `/settings`, Pricing `/pricing`, Billing `/billing`, Tour `/feature-tour` | Account/secondary | Account avatar and Explore, with native detail screens | Header avatar/Account | Account/security/payment choices remain server-authoritative where required |
| Search, notifications, academic attempt | Site shell/search, notification surface, attempt switcher in More | Native header actions; Explore attempt selector blocks offline/pending edit switches | Global header and attempt context | Keep actions visible on narrow screens; attempt change still needs server and no pending edits |

Remaining website route variants and offline ownership stay enumerated in the 33-route matrix. In particular, the app's `nativePaths` mapping does **not** mean each website nested URL has equivalent native back/deep-link behavior. Explore currently lists the website's Workspace, Plan & review, Knowledge, People and Account groups. Its header trigger is icon-only on phone width (`styles.css` hides the text), so discovery is weaker than a visibly named More/Explore entry.

## Reference contradiction and decisions for Phase 1

The study concept labels **six areas** at the top: Today, Study, Focus, Practice, Plan, Progress. Each illustrated phone nevertheless shows a **five-slot bottom bar**; the Practice screen illustrates Practice occupying the Plan slot while another screen shows Plan. This cannot be copied literally as one stable tab map. Do not conditionally replace a tab based on the active screen, and do not squeeze six labeled destinations into five slots without an explicit mobile-width interaction check.

Phase 1 must specify and compare these choices on a narrow and a large phone: (A) five permanent tabs with Practice prominently available as a contextual Study/Progress/Explore destination; (B) five permanent destinations with Focus as a persistent action rather than a tab and Practice as a tab; (C) six bottom destinations only if label, 44px touch targets, safe-area and large-text checks pass. Select one stable contract, record where Plan, Practice, Progress, Focus and Dashboard are reached, and keep Explore, search, notification, avatar and attempt context reachable. The existing website labels, content structures and route URLs remain source material; do not create career/firm/skills products from the other concept image.

## Flow and state checklist for matched captures

1. Website and app, same signed-in account and academic attempt, compact and large widths: open Today → subject → chapter → Focus → Tests → Progress → Plan/Calendar → back. Record entry paths, selected tabs, breadcrumb/back state and any website handoff.
2. Repeat with new/empty account, populated study account, multiple downloaded attempts, queued edits, offline after sync, conflict and expired session. Mark where UI is locally rendered, snapshot-only, online-only or never downloaded; keep user-visible empty states distinct from missing data.
3. Inspect header on all root and nested routes: search, notifications, Explore, avatar/account and academic attempt. Test overlay close/back, keyboard and scroll return, dark mode, large text and screen reader labels.
4. Verify the six named reference areas are reachable in a predictable number of taps without changing the site's actual test/chapter/planner content. Count any unavailable actions and preserve an honest handoff label.
5. Keep a screenshot pair for each flow with viewport, device, build/commit, account fixture, online state and expected interaction. Capture at least 320–360px and 390–430px phone widths, then an Android device and iOS build before release certification.

## Phase 0 outcome

- [x] Frozen source/tree SHA and confirmed clean baseline.
- [x] Website/nav groups, app bottom tabs, Explore and global controls located.
- [x] All 33 routes covered through the existing matrix; navigation-sensitive gaps mapped above.
- [x] Concept-image contradiction and fabricated-content boundary recorded.
- [x] Existing screenshot build mismatch distinguished from current source.
- [ ] Same-account live website versus current-build app captures: unavailable in this repository/reference-only phase; required before claiming visual parity.
- [ ] Permanent five/six destination selection: Phase 1 design and compact-phone validation.

No runtime, backend, production, APK or store behavior changes belong to this audit.
