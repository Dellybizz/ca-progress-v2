# Phase 1 — shared onboarding foundation

Built from the Phase 0 audit on branch `onboarding-design-phase0`.

## Implemented

- Portable React components in `components/auth/onboarding/design-system.tsx`: frame, desktop aside, progress/back control, mascot prompt, headings, native radio/checkbox choice cards, form fields, feedback and sticky actions.
- Scoped CSS with blue/white design tokens, local serif/sans-serif font stacks, safe-area padding, small-phone and desktop layouts, keyboard focus and reduced-motion support.
- Separate editable SVG foundations in `public/onboarding`: blue stationery background and yellow book mascot. These are code-authored interpretations of the PDF's visual system, not the original rendered illustration layers or full screenshot copies. Detailed illustration fidelity remains a visual review item when composing Phase 2 screens.
- Isolated interactive preview in `apps/onboarding-preview`; all JavaScript, CSS and SVG assets are embedded in one HTML file. It makes no account or authentication requests.
- Preview builder produces an asset SHA-256/size manifest and copies the same assets into a native-compatible `assets/onboarding` directory for packaging checks. Production native-shell integration remains Phase 6.

## Use

Import the components directly; no Next router, server-only imports or network APIs are required. Web assets default to `/onboarding/*.svg`; native consumers supply explicit local asset paths through `OnboardingAssets`.

Choice lists use fieldsets and native radio/checkbox inputs. Provide one consistent `name` for each single-select group. Account-specific draft state, server validation and submission belong to later phases, not the design components. Mark the heading with an id if the consuming flow needs section labelling.

Build the standalone preview with `node scripts/onboarding/build-preview.mjs`. Open `deployment-evidence/onboarding-phase1/CA-Progress-Onboarding-Phase1.html` in a browser; select a level, advance and go back. The preview only demonstrates shared component behavior and has no persisted onboarding state.

## Verification

- Component regression tests: native input types, selected state, bounded progress values, disabled busy action, local asset references, reduced motion and safe-area rules.
- TypeScript and scoped ESLint checks passed.
- The preview bundles for Chrome 120 and Safari 17 with zero remote asset/font/script dependencies. Both SVGs were rendered and visually inspected.
- Browser interaction/viewport visual QA could not run: the available cloud browser rejects local-file URLs. No alternative URL or browser-policy bypass was attempted. The self-contained preview is supplied for review; phone/desktop visual acceptance remains open until an allowed preview environment is available.
- Production login/onboarding routes and the live native entry point are unchanged. No APK or full onboarding completion is claimed in this phase.

## Next

Phase 2 composes the approved mobile/desktop book welcome and feature/signup carousel using this foundation. Continue preserving the account identity, password minimum, excluded steps and offline requirements from Phase 0.
