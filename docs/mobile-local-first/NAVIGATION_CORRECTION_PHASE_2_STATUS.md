# Navigation correction — Phase 2 implementation status

Status: **partial implementation; device/site parity not certified**. Date: 28 September 2026 (IST). Based on the Phase 1 contract in `NAVIGATION_CORRECTION_PHASE_1.md`.

## Implemented on the working branch

- Kept the five stable Today / Study / Focus / Plan / Progress bottom destinations and existing screen content.
- Added direct Practice & Tests, Notes and Resources entries above the existing Syllabus subject list. The Practice entry opens the existing offline-first Tests screen and its saved attempts; it does not invent MCQ or ICAI paper features.
- Added contextual Practice & Tests and Focus actions to native chapter-progress detail, replacing a misleading sentence that implied the controls were only on the website.
- Added Dashboard and Practice & Tests shortcuts at the top of Explore while retaining the website's full group directory, search and attempt selector.
- On compact phones, split the native header into a first row for the page title/back, search, notifications and account, and a second row for academic context and a visible Explore control. Both context and Explore open the existing attempt/directory sheet. The content and sync status offsets account for the taller fixed header.
- Notification destinations now use the native deep-link allowlist, including Tests, Notes and Calendar. Unsupported/unsafe destinations go to the Notifications page instead of silently opening Dashboard.
- Subject and chapter selections are recorded as native history entries, with their view keyed to history context. Android Back and the inline Back control can return to the prior subject or chapter list rather than exiting a route that still shows a detail view.
- Follow-up: canonical website chapter, subject, note and resource links now carry their record context into the native destination. Subject slugs resolve against the saved academic catalogue; unavailable chapter/subject links explain that a sync is needed instead of showing an unrelated root view. Notification actions use the same validated destination mapping and an unsupported action stays in Notifications. The Notifications hash route is recognized on cold launch.
- Follow-up: compact header controls and academic context now have 44px minimum tap targets, long titles truncate, and the saved-data status row no longer receives a second header-height offset. The Explore close button clears the native back-handler state.

## Checks run

- `npm run typecheck`: pass.
- `npm run native:bundle`: pass; bundled asset files refreshed.
- `npm run lint`: pass.
- `node --test tests/mobile-phase7-student-parity.test.mjs tests/mobile-phase20-files-notifications.test.mjs`: 17 pass.
- Follow-up `node --test tests/mobile-navigation-correction.test.mjs tests/mobile-phase7-student-parity.test.mjs tests/mobile-phase20-files-notifications.test.mjs`: 19 pass; typecheck, native bundle and lint pass.

## Remaining Phase 2 acceptance

- No same-account website/native paired captures at 320, 360, 390 and 430px; no Android/iOS installed-device tap/large-text/screen-reader proof. The current generated concept image is not a device screenshot.
- Native subject/chapter history remains hash/state based. The website subject slug and chapter ID can now enter through canonical native links, but direct hash URLs are still not equivalent website URLs. Return and scroll restoration need device proof; unmatched resources and notes need a dedicated missing-record state after the initial sync.
- Some website navigation entries remain explicit handoffs or narrower native screens, notably ICAI updates/resources and full Chapter Hub. The existing Phase 5 release blockers and offline history/sync gaps remain open.
- Explore and the header are implemented but their visual fit, tap targets, safe areas and keyboard overlap must be checked on actual narrow devices before declaring the shell complete.
- The browser available here cannot connect to the local bundled shell, and this workspace has no Android emulator, attached device or iOS simulator. No visual/device results have been inferred from compilation. Same-account paired site/native captures and installed tap, large-text, safe-area and back/keyboard checks are still required to close the phase.

This partial Phase 2 build is for testing. It does not certify site fidelity, offline completeness or store readiness.

## Automated installed-app evidence job

The push workflow now builds a separate **disposable emulator fixture** and installs it in an Android API 35 emulator. It captures Dashboard, Today, Study, Progress and Explore at 320, 360, 390 and 430 CSS px, plus Focus, Plan, subject/chapter navigation and a large-text Study capture. The job uploads PNGs and accessibility hierarchies; failure to find an expected control fails the job. The fixture uses invented study records, makes no authenticated API calls and is eliminated from the normal bundled APK by a compile-time flag. Its APK is not published. The real Android debug artifact still builds independently without this flag.

This job checks an installed shell with deterministic data. It cannot replace same-account website/native captures, signed-in data checks, Android hardware safe areas, iOS interaction tests, or offline mutation/reconnection proof. Its first run and any findings must be inspected before treating its screen evidence as passed.
