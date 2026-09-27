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

## Checks run

- `npm run typecheck`: pass.
- `npm run native:bundle`: pass; bundled asset files refreshed.
- `npm run lint`: pass.
- `node --test tests/mobile-phase7-student-parity.test.mjs tests/mobile-phase20-files-notifications.test.mjs`: 17 pass.

## Remaining Phase 2 acceptance

- No same-account website/native paired captures at 320, 360, 390 and 430px; no Android/iOS installed-device tap/large-text/screen-reader proof. The current generated concept image is not a device screenshot.
- Native subject/chapter history remains hash/state based; it does not yet accept the website's subject slug or chapter ID deep links as equivalent URLs. Actual return and scroll restoration need device proof.
- Some website navigation entries remain explicit handoffs or narrower native screens, notably ICAI updates/resources and full Chapter Hub. The existing Phase 5 release blockers and offline history/sync gaps remain open.
- Explore and the header are implemented but their visual fit, tap targets, safe areas and keyboard overlap must be checked on actual narrow devices before declaring the shell complete.

This partial Phase 2 build is for testing. It does not certify site fidelity, offline completeness or store readiness.
