# P0 — Mobile website ↔ bundled app parity inventory

Captured 25 September 2026. **Status: in progress; authenticated mobile reference gate open.**

## Locked evidence

| Item | Value |
| --- | --- |
| Working branch | `mobile-phase7-student-parity` |
| App/source SHA | `ce6d13c0c18cac7fb73cc0327919692b4961f84c` |
| Latest verified web deployment | `551d30a03db9dc908435ddfad5ae438aaed62ba4` (Cloudflare workflow `36120881289`, success); confirm live Worker hash again before screenshot diff |
| Android debug APK | `CA-Progress-Offline-Calendar-Analytics-ce6d13c.apk`; SHA-256 `1afef535ce002571dc4786769b433bd17f4c7b410aef80ca32687276378045e3`; 4,439,499 bytes |
| App build workflow | `36124234159`; verify and Android debug passed; iOS simulator result must be recorded separately |
| Website reference | Live `https://caprogress.zanisheluxe.in/dashboard` observed in a Guest Tester session; this is **not** the authenticated same-account mobile reference |
| Native phone reference | User screenshots 25 September at 15:37–15:38 IST: Progress shows 1 synchronized chapter and 0 pending edits; Focus, Community and website handoff are visible. Device model, OS/build digest on phone and parity viewports not established. |
| D1 migrations | 0065–0067 verified in production deploy workflow `36120881289`; no P0 data mutation performed |

The website deploy SHA and app SHA differ because the app-only commits followed the backend deployment. Pin both for comparisons and verify the exact runtime release before declaring a pixel or data match.

## Route inventory

**Source of truth:** `components/shell/navigation-contract.ts` and `app/(student)/**/page.tsx`. The navigation contract has 23 student entries; nested pages below add more. Native routing is in `apps/mobile/src/main.tsx` and `apps/mobile/src/runtime.ts`. Policies derive from `ROUTE_DATA_MATRIX.md`; these are target policies, not proof the current APK implements them.

Codes: **C** = local-first read/write; **S** = cached read with some connected actions; **O** = authoritative online action with bundled app screen. **Native** means a route exists, not parity. Every row below is **unverified** against authenticated mobile website until matched captures and actions pass.

| ID | Website route | Website owner/data | Target policy | Native state at app SHA | Critical interactions to compare |
| --- | --- | --- | --- | --- | --- |
| W01 | `/dashboard` | `student-dashboard`, dashboard service | C | native, simplified | focus card, exam, pulse, subject, leaders, ICAI update, quick actions |
| W02 | `/planner/today` | `today-plan-client`, planner services | C | native, partial | task order, filters, notifications, weekly summary, add/finish |
| W03 | `/study` | `study-timer`, study service | C | native, partial | timer modes, pause/restart, session reflection/doubts |
| W04 | `/progress` | `progress-tracker`, progress service | C | native, partial | group/subject/search, stages/dates, rating, chapter links |
| W05 | `/planner` | `planner-client`, planner service | C | native, partial | task CRUD, scheduling, daily plan, goal progress |
| W06 | `/calendar` | `calendar-client`, calendar service | C | native, simplified | month navigation, agenda, event edit, study schedule |
| W07 | `/planner/revision-settings` | `revision-settings-client`, smart planner | C | website handoff | intervals, preferred days, session estimates |
| W08 | `/analytics` | `phase9-actionable`, analytics/billing | S | native, simplified | insights, date range, Pro gates, navigation |
| W09 | `/analytics/forecast` | analytics service | S | native, simplified | readiness/pace, explanation, missing-data state |
| W10 | `/goals` | `goals-client`, planner/billing | C | website handoff | create/edit/complete goals, quota/limits |
| W11 | `/tests` | `test-archive-workspace`, tests/progress | S | website handoff | attempt capture, scores, mistakes, private files |
| W12 | `/syllabus` | `syllabus-explorer`, academic | C | native, partial | level/group/search, subject/chapter navigation |
| W13 | `/updates` | `updates-feed`, ICAI catalog | S | website handoff | source/date/course filters, official links |
| W14 | `/resources` | `resource-library`, resources/R2 | S | native, partial | views/search/filter/upload/download, ownership, access |
| W15 | `/resources/icai` | `resource-browser`, ICAI catalog | S | website handoff | course/attempt/resource filters, authorized file links |
| W16 | `/notes` | `resource-library` and note draft | C | native, partial | create/edit/search/tags, save state |
| W17 | `/community` | `channel-list`, community | C | native, partial | channel browse/unread, entry, membership |
| W18 | `/study-buddy` | `study-buddy-workspace`, relationships | S | native, read-only | discovery/requests/nudges/comparison/report |
| W19 | `/activity` | `activity-gamification-client`, activity | S | native, partial | XP history, categories, leaderboard/privacy |
| W20 | `/pricing` | `pricing-client`, commercial policy | S/O | website handoff | plans/cycles/eligibility; purchase online |
| W21 | `/billing` | `subscription-controls`, recurring billing | S/O | website handoff | status/invoices/cancel; charges online |
| W22 | `/settings` | appearance, focus, session and offline controls | C/O | native, partial | themes/motion, sessions, export, account storage |
| W23 | `/account-deletion` | deletion controls | O | website handoff | export, confirm, server deletion result |
| D01 | `/dashboard/exam` | dashboard service | S | falls to dashboard | attempt dates/details/source |
| D02 | `/subjects/[subjectSlug]` | `subject-detail`, academic | C | falls to syllabus/dashboard | chapter catalog, topic detail |
| D03 | `/subjects/[subjectSlug]/progress` | progress page | C | falls to progress/dashboard | context-scoped chapters |
| D04 | `/chapters/[chapterId]` | `chapter-hub`, academic/resources | C/S | no detail route | stage dates, rating, notes, resources |
| D05 | `/notes/[id]` | `note-editor`, notes | C | no detail route | edit/save/delete/revision |
| D06 | `/community/[channel]` | `community-chat`, community | C | channel tabs in one screen | history/search/reactions/pins/read/report |
| D07 | `/resources/[id]` | resource detail | S | no detail route | access, metadata, owner controls |
| D08 | `/resources/[id]/view` | resource viewer | S | no detail route | view/download/expiry/offline copy |
| D09 | `/settings/profile` | `profile-form`, auth/academic | C | internal native read-only | identity, level/group/attempt, target, privacy |
| D10 | `/study-profile/[userId]` | study profile service | S | no detail route | privacy, follow/buddy actions |
| D11 | `/feature-tour` | feature tour | C/S | website handoff | progress, replay, completion |
| G01 | search overlay | site shell/search | local + online | absent | query, results, keyboard, routes |
| G02 | notification center | site shell/planner | S | native internal screen | unread, read, deep link |
| G03 | attempt switcher/account menu | site shell | C/O | partial | context change, profile/sign out |
| G04 | mobile app bar/bottom tabs/More | navigation contract/site shell | bundled | native partial | exact order/labels/icon/active/back |
| G05 | authentication/onboarding | public routes | O | native OAuth bootstrap | sign-in/recovery, context setup |
| G06 | settings exports and sessions | settings controls | O | partial | download and revoke device |
| X01 | `/admin/**` | admin area | excluded | excluded | role isolation only |

## Action and state ledger

These checks are mandatory across **every** row, with route-specific actions above. Test IDs use the route ID prefix (e.g. `W05-OFFLINE`).

| Suffix | Check | Expected evidence |
| --- | --- | --- |
| `-VIS` | same account/data, narrow and wide phone, light/dark | matched website/app screenshots, annotated allowed OS differences |
| `-NAV` | all visible links, tabs, overlays, back/deep link | interaction trace and final route |
| `-CRUD` | each visible add/edit/delete/toggle/filter/search | state before/after, website convergence |
| `-STATE` | loading, empty, stale, pending, conflict, error | visual captures and retry/resolve behavior |
| `-OFFLINE` | cached launch, action, restart, reconnect | local DB/outbox state then server agreement |
| `-AUTH` | account/context switch, entitlement and denial | no cross-account leakage; valid denial and recovery |
| `-A11Y` | keyboard, text scaling, screen reader, touch | device results |

Capture the website's actual visible controls in this ledger at matched mobile viewport. Source references above identify likely actions but are **not** a substitute for an authenticated interaction trace. For server/R2 authorization and exact mutation endpoints, use `ROUTE_DATA_MATRIX.md` as the initial map and trace each control's request during P2 before implementing it.

## P0 remaining evidence and exit gate

1. Capture authenticated site at 360–390 px and 414–430 px width, light/dark, same account/attempt as an installed app. Save viewport, browser/OS, source release and route/state ID with each image. Current cloud browser is 1363×936 Guest Tester, so it cannot satisfy this.
2. Capture the installed APK on the same devices/data: shell, each route, overlays, empty/loading/error states, keyboard and back. The four existing phone images cover only Progress, Focus, Community and ICAI website handoff.
3. Verify deployed Worker SHA at capture time, rather than assuming the last successful deployment still serves unchanged assets.
4. Expand each row's action ledger with observed controls and trace exact backend calls/permissions for all 23 navigation destinations plus nested/global entries.
5. Review the inventory for omissions, then mark P0 complete only when route ownership is 100% and matched references exist. No P1 implementation is certified by this inventory.

No production data or runtime behavior was changed by this document.