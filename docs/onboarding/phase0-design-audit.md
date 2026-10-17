# CA Progress onboarding — Phase 0 design and implementation audit

Date: 2026-10-13. Scope: website and bundled native app onboarding.

## Baseline and design source

- Runtime baseline: `7293e495f5da4f133aad7db97120b0d9b7f27da2`, the deployed payment-rules-phase6 release including the Gifts refinement. Onboarding work must preserve those billing changes.
- Source: `CA-Progress-Onboarding-Screens.pdf`, 20 pages, created 2026-10-13; Library identity `libfile_4690bb9af1e48191a2ac3ee885388938`.
- PDF SHA-256: `bf58191897fe91a68241915ef1d47281e48b242c2155776bc1899f14b4717448`.
- All twenty pages were rendered and visually reviewed. Pages 1–17 are the implementation reference; pages 18–20 are variations/earlier explorations, not additional onboarding steps.
- Setup steps 9 and 10 were explicitly removed. Do not reintroduce them or renumber the PDF references.
- The PDF contains composed screen images, not a reusable component or illustration library. Editable layouts and separate background/character assets must be prepared in Phase 1; do not ship screenshot-only forms.

## Screen register

| PDF page | Screen | Existing capability | Implementation phase |
|---|---|---|---|
| 1 | Mobile book welcome | No corresponding local welcome flow found | 2 |
| 2 | Desktop book welcome | No corresponding web welcome flow found | 2 |
| 3 | Mobile feature carousel and signup | Google/LinkedIn and password entry exist; carousel is new | 2 |
| 4 | Desktop feature carousel and signup | Existing login panel; needs desktop composition | 2 |
| 5 | Username/password account setup | Website and native account setup exist | 3 |
| 6 | Setup introduction | New introductory screen before academic choices | 4 |
| 7 | CA level | Existing level validation and persistence | 4 |
| 8 | Target attempt | Existing verified attempt catalog; undecided branch is missing | 4 |
| 9 | Groups | Existing group validation; Foundation must skip this screen | 4 |
| 10 | Preparation stage | Existing preparation state table and validation | 4 |
| 11 | Progress introduction | New informational screen; sample progress is illustrative | 4 |
| 12 | Support preferences | New multi-select onboarding preference persistence | 4 |
| 13 | Daily study goal | Reuse existing dailyTargetMinutes; wire it into onboarding | 4 |
| 14 | Review and ready | Existing completion operation; new editable summary | 5 |
| 15 | Existing-user login | Website and native password/OAuth login exist | 3 |
| 16 | Password recovery via linked provider | Requires explicit recovery-purpose verification flow | 3, separate recovery subphase |
| 17 | Reset password | Requires verified recovery handoff and session policy | 3, separate recovery subphase |
| 18 | Mobile pencil variation | Retain as a reference only; book version is primary | Not enabled by default |
| 19 | Water/cap exploration | Earlier visual exploration | Excluded |
| 20 | Desk/bookmark exploration | Earlier visual exploration | Excluded |

## Design contract

Preserve the vivid blue stationery background, yellow book character, white rounded foreground panels, serif headings and blue primary action. Desktop uses the wider compositions on pages 2 and 4; do not simply enlarge the narrow phone screenshots. Remaining desktop setup layouts should extend the same visual system with a readable panel width.

Do not reproduce the mock phone status bar, fake signal/battery indicators, example username availability or illustrative account-verification badges as real app state. Keep selectable cards, progress, Back, Continue and final Edit controls functional.

Welcome gestures need tap/click and keyboard alternatives. Respect reduced motion, show focus, announce validation errors, maintain contrast in light/dark environments and use mobile safe areas with reachable actions. Transitions must not add network delays.

## Existing implementation and gaps

### Website

- `app/(public)/onboarding/page.tsx` requires a signed-in account, loads profile/attempts/preparation state, and redirects already-completed users.
- `components/auth/onboarding-wizard.tsx` currently has four steps: level, group, attempt and preparation/review. Every advance uses a server draft request; no persistent local onboarding draft exists in this wizard.
- `app/api/onboarding/route.ts` accepts draft/complete; requires an authenticated user and validates academic context. Both stored step and completion currently use the legacy range 1–4.
- `lib/profile/onboarding-experience.ts` stores preparation state. `lib/profile/service.ts` already supports dailyTargetMinutes, onboardingStep and onboardingCompletedAt.
- `lib/profile/validation.ts` accepts daily study goals of 15–720 whole minutes. Preserve this contract and translate the reference's 1/2/4 hours to 60/120/240 minutes. Custom and Set later must have explicit behavior; do not silently overwrite an existing goal.
- Attempt choices must come from the current validated catalog. January/May/September 2027 in the images are examples, not hardcoded production dates.
- The reference places attempt before groups; the current wizard puts groups first. Final completion must still validate the complete level/group/attempt combination, clear incompatible draft choices, and skip groups for Foundation.
- “Not decided yet” is not accepted by the current required attemptKey validation. Implement an explicit tentative setup branch, with later selection required before initializing attempt-specific study records. Never invent a placeholder academic attempt id.
- Support choices are progress tracking, study planning, notes/materials and staying consistent. They are preferences, not permission to grant paid features or change entitlements.

### Accounts and recovery

- Preserve existing identities and linked Google/LinkedIn connections. Account setup updates the same account; no duplicate account or replacement user id.
- Password login and native account setup already exist. The password creation contract is 12–128 characters; the mockup's “at least 8 characters” must change to the real minimum, rather than weakening authentication.
- A dedicated password recovery/reset page or recovery-purpose endpoint was not found in the audited route set. Do not treat ordinary OAuth sign-in or the account-setup endpoint as unrestricted password-reset authorization.
- Recovery needs a short-lived, single-use proof tied to the linked provider and account, server verification, rate limits, neutral error messages, expiry handling and explicit session invalidation. This is a separate implementation gate inside Phase 3.
- Never persist passwords, reset proofs or OAuth credentials in onboarding drafts. Offline UI availability does not mean authentication can be performed without internet.

### Native app and assets

- `apps/mobile/src/main.tsx` owns a local React app with account-scoped offline repositories and native authentication; do not replace it with a remote onboarding webview.
- `apps/mobile/src/account-setup.tsx` supplies username/password setup. It can be restyled while preserving its existing account API.
- `scripts/mobile/build-native-shell.mjs` bundles JavaScript/CSS and copies index.html. It does not currently copy an onboarding illustration/font asset directory. Add an explicit asset manifest/copy stage and verify output inclusion in Phase 6.
- Profile snapshots already contain dailyTargetMinutes. Native profile editing and synchronization must be integrated with the new onboarding draft/completion operations; do not assume the generic sync queue already supports those operations.
- Separate bundled UI/assets, cached academic catalog, local drafts and authenticated server completion. First-run welcome/information/choices must render offline, even before login. Catalog availability must distinguish bundled/cached choices from server validation.
- Persist drafts by installation/guest identity before login, then associate them with the signed-in account only through an explicit controlled handoff. Never show one user's drafts in another account.
- Resuming a completed account should not force the new setup flow or erase progress. Guest onboarding must preserve guest study data and keep account migration separate.

## Phased implementation and acceptance

| Phase | Deliverables | Completion gate |
|---|---|---|
| 0 | Design register, baseline, gaps, rollout boundaries | Reviewed PDF and source; checklist saved in GitHub |
| 1 | Shared responsive UI, isolated editable assets, type/spacing/motion tokens | Visual comparison with primary PDF screens; no fake phone chrome; assets load locally |
| 2 | Book welcome and feature/signup carousel | Tap/drag/keyboard access; mobile/desktop layouts; no artificial delay; existing login destinations preserved |
| 3A | Restyled signup, account setup and existing login | Existing-user data unchanged; username validation; real provider/password errors; app and website |
| 3B | Provider-verified recovery and reset | Expired/replayed/wrong-account proof rejected; minimum password and session rules retained; no secret draft persistence |
| 4A | Versioned setup schema and compatibility | Reuse goal/preparation data; add support preferences and local step keys; migrate legacy 1–4 resumptions safely |
| 4B | New academic/setup screens | Foundation group skip; dynamic valid attempts; undecided branch; preferences and goal choices persist; existing values retained |
| 5 | Editable review and dashboard handoff | Back/Edit works; completion is retry-safe; user sees pending sync honestly; existing completion is respected |
| 6A | Bundled native assets and local draft storage | Install/launch without network; reopen at saved step; no remote font/image requirement; manifest integrity check |
| 6B | Authenticated synchronization and account handoff | Reconnect/retry/idempotency; account isolation; invalid catalog handling; no false server-complete state |
| 7 | Full visual and functional certification, web release, APK | Phone/tablet/desktop; offline/reopen/rotation; fresh/existing/guest accounts; regression checks and installable APK |

## Rollout boundaries

- Phase 0 changes documentation only and does not deploy a runtime change.
- Build on the deployed baseline, preserving ongoing payment work and unrelated scenario-register changes. Use an onboarding branch and fast-forward-safe publication.
- Do not switch production onboarding or block current login until the corresponding phase gate passes. Keep current flow available during foundational implementation.
- For each subsequent phase: implement, verify, commit to Dellybizz/ca-progress-v2 and report the actual release state. A bundled native shell is not an APK; APK delivery requires a separate Android build and installability check.
- Backend completion is authoritative. Local finish should say saved/pending sync while disconnected, rather than pretending the server accepted it.
- APK size allowance is 100–300 MB, but asset quality and offline inclusion determine the build; do not pad files or download the PDF at runtime.

## Phase 0 checklist

- [x] Resolve and visually inspect the 20-page reference.
- [x] Separate 17 implementation-reference pages from three variations/explorations.
- [x] Map current website and native account entry points.
- [x] Identify existing fields, missing preferences and legacy step compatibility.
- [x] Identify undecided-attempt and password-recovery gates.
- [x] Identify bundled-asset and local-draft/sync gaps.
- [x] Define acceptance gates without changing existing data or authentication rules.
- [x] Targeted baseline: 17 tests passed, 0 failed. Command: `node --test tests/phase2-onboarding.test.mjs tests/product-phase2-today-onboarding.test.mjs tests/mobile-phase15-native-auth.test.mjs`.
- [x] Publication target: `onboarding-design-phase0` in `Dellybizz/ca-progress-v2`.
