# Notes workspace Phase 1 — verified release

17 October 2026. Verified/deployed source: `fcd247f379607c2ca4e88d97276e78349d6ddf76`.

- Web Worker version: `4228275c-c4f4-47ef-8637-29988afb3e92`.
- Release: https://github.com/Dellybizz/ca-progress-v2/actions/runs/39039622475 — verification `117416308332` and deployment `117417759838` succeeded.
- Independent browser check: https://github.com/Dellybizz/ca-progress-v2/actions/runs/39039622511 — job `117416262152` succeeded.
- Artifacts: `12103307726` (independent) and `12103299718` (release), 89 screenshots/PDF files per set.
- All 1,420 tests passed. TypeScript, ESLint, production build, retained migrations, backup restore, foreign-key checks and runtime smoke passed.
- Web Worker compressed size: 3.692 MiB, within the existing 3.75 MiB guard.

The six-width browser suite passed at 320/390/768/820/1024/1440px. It checks cancelled page-setup edits, saved landscape layout, working widths, keyboard focus inside mobile formatting, existing rich content/CA formats, save while typing, recovery after reload, and legacy RTL/merged-table import. Portrait and landscape A4 PDFs were generated and inspected: approximately 594.96×841.92pt and 841.92×594.96pt respectively.

The isolated authenticated live fixture verified exact structured JSON, editor reload and Resources discovery, landscape-to-portrait persistence, stale-save refusal and anonymous export rejection. Existing multipart upload, private download, folder operations, Community submission and fixture cleanup also passed. `/api/app-config` confirmed the deployed source above.

A read-only inspection of the actual signed-in desktop page confirmed the compact navigation, omitted route trail, Wide default, SVG toolbar and Apply/Cancel orientation controls. The paper begins at approximately 161px from the top at the audited desktop viewport, compared with the earlier 297px. No content was entered or saved in the user's note during inspection.

Phase 1 provides the workspace/paper foundation. Object/chart resizing, direct diagram editing and ink tools remain later phases of the audit plan. This release does not claim an automatic pagination engine or physical Android/stylus certification.
