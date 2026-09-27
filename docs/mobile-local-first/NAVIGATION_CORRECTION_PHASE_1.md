# Navigation correction — Phase 1 contract

Status: **navigation contract defined; no runtime change or device certification**. Date: 28 September 2026 (IST). Base: `NAVIGATION_CORRECTION_PHASE_0.md`, published branch tree `d706c556f8e1ebe02ea7fa6980471557a3adb088`.

## Decision: five permanent destinations, prominent Practice

Retain a stable **Today · Study · Focus · Plan · Progress** bottom bar. Focus remains the center action with its existing timer screen. **Practice is a named, prominent entry in Study and a contextual entry in the Chapter and Progress workflows, plus a first-level Explore shortcut.** All lead to the existing Tests route and its actual archive/entry UI. Do not conditionally replace Plan with Practice on the Practice screen, and do not create fake MCQ/RTP/MTP content from the concept image.

This uses the concept's six task areas while preserving its five-item phone bar, the existing CA Progress routes, and the student's current Focus action. A dedicated Practice tab may be reconsidered when the site has a sufficiently broad Practice hub and measured navigation use justifies replacing the Focus tab; it is not part of this contract.

| Candidate from Phase 0 | 320px phone with 16px total horizontal inset | 390px phone | Decision |
| --- | --- | --- | --- |
| A: five stable tabs, Practice one level within Study | about 61px per destination | about 75px | **Selected.** Keeps a predictable center Focus action, readable labels and a direct Practice shortcut. |
| B: five tabs with Practice replacing Focus; Focus floats | about 61px plus a separate Focus target | about 75px plus a separate Focus target | Deferred. Introduces a second persistent control and changes the reference's center Focus affordance before timer background behavior is certified. |
| C: six stable tabs | about 51px per destination | about 62px | Deferred. Nominal 44px targets can fit but longer labels, safe areas, text scaling and the center action become crowded; requires a real visual/touch comparison. |

These widths are arithmetic, **not screenshot or accessibility proof**. At 320–360px, at 390–430px, with large text and safe areas, Phase 2 must render and measure the actual controls. If A fails on those devices, revise the contract with recorded evidence instead of silently swapping tabs.

## Route and active-state contract

| Entry | Website route / existing native route | Selected bottom destination | Required behavior |
| --- | --- | --- | --- |
| Today | `/planner/today` / `today` | Today | Opens the existing editable plan; do not replace the content with Dashboard. |
| Dashboard overview | `/dashboard` / `dashboard` | Today | Remains a distinct screen reachable from Today context and Explore. Preserve existing summary and URL. |
| Study | `/syllabus` / `syllabus` | Study | Existing syllabus and subject/chapter structure remains. Its first-level navigation offers **Practice / Tests**, Notes, Resources and other actual study destinations. |
| Subject / Chapter | `/subjects/[subjectSlug]`, `/chapters/[chapterId]` / nested native selection | Study, or Progress when entered via a progress subflow | Keep selected subject/chapter, return route and scroll position; expose actual contextual Practice/Tests and Focus actions without rewriting chapter content. |
| Practice / Tests | `/tests` / `tests` | Study | A **Practice** entry opens the current Tests screen. Keep the site's test/archive terminology on the page until a real Practice hub exists. Reachable in one tap from Study's first-level menu, or via Explore. |
| Focus | `/study` / `focus` | Focus | Center action opens/returns to the actual timer; later active-session mini-player is a separate work item, not a fabricated active state. |
| Plan | `/planner` / `planner` | Plan | Planner stays intact; Calendar, Revision settings and Goals group under Plan. |
| Progress | `/progress` / `progress` | Progress | Existing metrics and subject filtering stay intact; offer a contextual Tests link where actual data supports it. |
| Analytics / Forecast | `/analytics`, `/analytics/forecast` / native equivalents | Progress | Keep existing saved-data and insufficient-evidence states. |
| Explore, People, Account, Billing | Website grouped navigation / existing native routes | No falsely selected tab on standalone pages | An overlay retains its underlying route's selected tab; opening a standalone page gets its own title and Back. |

Tests are **not** mislabeled as a Progress or Plan bottom tab just because a student arrived from there. A contextual return control goes back to the originating page; the selected root reflects the stable Study ownership of the `/tests` destination. The desktop sidebar and website URLs remain unchanged in this phase.

## Global shell contract

- Every root and nested student screen keeps access to search, notifications and the account avatar. Explore remains a visibly named control or row on compact phones; an icon-only ellipsis with no visible label is not enough for first-time discovery.
- The active academic attempt/level has a readable context affordance. At narrow widths, use a compact secondary header row for attempt context and Explore when necessary; do not force four header actions and a long title into one clipped line. Switching attempts retains its current online/pending-edit guard until a certified offline switch exists.
- Bottom destinations have fixed order and do not change with scroll, feature entitlement, current route, or data availability. Their interactive targets are at least 44×44 CSS px, respect horizontal and bottom safe areas, and leave content above the bar visible when the keyboard is open. Labels remain understandable with large text; do not simply shrink font size to make a failing layout fit.
- Back closes a modal/sheet before popping its route. A nested screen returns to its source with context. A cold deep link has a valid root fallback; it must not take the user to unrelated Dashboard content. Search selects a real page or saved record and closes cleanly. Notifications resolve to their actual destination rather than defaulting silently to Dashboard.
- Explore exposes the website's existing Workspace, Plan & review, Knowledge, People and Account groups, plus obvious shortcuts for Dashboard and Practice. Keep its search and attempt switcher. An unavailable native route is clearly marked as an online website handoff; billing/identity/community permissions stay server-authoritative.
- Offline and pending/conflict status remains available without covering the header controls or changing navigation position. A never-downloaded screen states that it needs an initial sync; an empty downloaded screen says it has no records.

## Phase 2 implementation and verification handoff

1. Update the navigation source of truth and app-shell presentation together; ensure both a route entered via a tab and one entered by deep link select the same tab. Do not create a second label-only navigation registry that diverges from the website.
2. Add the prominent Practice entry to the Study landing navigation and Explore, and contextual links where Chapter/Progress currently expose real Tests data. Preserve all existing route handlers and data repositories.
3. Implement compact header and overlay/back behavior in the shell, then verify tap order and accessibility names at 320, 360, 390 and 430px widths, large text, Android safe area and iOS safe area. Capture screen pairs with the website using the same account and attempt.
4. Cover empty and populated accounts, offline after sync, pending outbox and conflict states. Record each action's reachable path, tap count, selected tab, displayed data source, return route and whether it hands off to the website.
5. Run native bundle/typecheck/lint and relevant routing contracts after code changes. Device evidence and the Phase 5 release matrix remain separate gates; a successful compile does not certify visual parity.

Acceptance for **this Phase 1**: one stable bottom-bar contract, explicit Practice ownership, complete route/active-state rules and compact-width criteria are recorded. Rendering, flow screenshots and actual implementation belong to Phase 2 and later phases. No current APK changes result from this design contract.
