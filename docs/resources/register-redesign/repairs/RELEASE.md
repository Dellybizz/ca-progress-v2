# Register layout corrective release — 19 October 2026 (UTC)

Source: `c19bad40d19b590a5f0d3293821c02d39fa89945` on `onboarding-design-phase7`.

Release run: https://github.com/Dellybizz/ca-progress-v2/actions/runs/39177727754

- Editor certification job `117824065312`: passed. Chromium and WebKit both passed general certification at six desktop/mobile widths, register checks at three widths, manipulation checks at three widths, and layout repair checks at four sizes (1916×1000, 1440×1000, 390×1000, 844×390).
- Full local suite: 1,494 tests passed; TypeScript and lint passed. Register, accounting, catalogue and complete student workflows passed. Twenty-table editing fixture: 6.2 ms p95.
- Inspected actual desktop table, phone hierarchy, and WebKit page-two table/title and resized hierarchy screenshots.
- Corrections found during certification: defer layout writes from resize observers, retain native touch clicks on row/column actions, and clamp oversized printed hierarchy frames while preserving smaller saved sizes. Hierarchy refitting preserves existing interactive SVG nodes and is regression-tested. Geometry assertions measure the same browser frame and validate actual visible node dimensions.

Deployment and live verification passed on 19 October 2026 UTC:

- Full verification job `117824065575`: success, including all 1,494 tests, production build, lint/type checks, accounting, catalogue, chart/hierarchy, ink and complete student workflows. CI 20-table editing p95: 2.1 ms.
- Deployment job `117826028131`: success. Backup restoration, additive migration checks, Worker validation and authentication boundaries passed.
- Web Worker version: `544c9f49-8568-47fb-9bf0-87959eef34b6`; compressed size 3.723 MiB under the 3.75 MiB gate.
- Preview processor version: `7e2b2629-3412-42a6-91ee-326548f4a6ed`.
- Signed-in live verification confirmed exact D1 data, safe HTML and editor reload for full-paper v2 placement, independent format scale and size lock; version 1 placement clients cannot overwrite the new data. Structured CA table/tree/ink roundtrip, orientation updates, stale-save refusal and private exports passed.

Live editor: https://ca-progress-v2.habeebaasif622.workers.dev/notes/new

The source SHA above is the deployed application. Any following documentation commit does not change the deployed build.

Physical Android/iOS and offline APK editing parity are not certified by these browser results.
