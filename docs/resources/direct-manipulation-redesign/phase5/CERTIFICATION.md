# Phase 5 — editor certification and hardening

Status: automated verification/release in progress. Full physical-device and bundled-APK rich-editor certification is not complete.

## Audit findings and fixes

1. **Pasted total figures could be replaced by assisted arithmetic.** Spreadsheet paste cleared the cell formula but left the row's calculation definition. Refresh then regenerated it. Pasting a numeric total now makes the complete total row manual and clears its live formulas, retaining unpasted figures. Pasting a label retains calculation intent. Invalid numeric paste remains atomic; undo restores the previous definition and figures.
2. **Phone boundary buttons were too small.** Coarse-pointer row/column controls now have 44-pixel targets with reserved gutters. Gutters follow actual wrapper padding. Row/column limits disable their controls visibly. Reference headers wrap within narrow columns.
3. **Financial controls could remain available in read-only mode.** A primitive editable-state subscription immediately removes controls on mode changes. Mutation and clipboard handlers also check the live editable state. Read-only paired accounts hide authoring placeholders and reserved gutters.
4. **Native table deletion could invalidate an account side.** A transaction filter refuses changes that leave an `account` without its two configured tables. The UI disables destructive all-row/all-column selection actions and deletion of the last side column. Removing the complete account block remains possible.
5. **The bundled APK still has a plain-text notes editor.** Its local repository now identifies rich content from the retained canonical HTML and refuses a plaintext overwrite before changing SQLite or queuing a mutation. The screen shows a read-only text preview, labels formatted notes and offers the full web editor. Existing server capability guards remain the final protection, including older pending clients. Plain local notes remain writable offline. This safety measure is not a port of the full editor into the APK.
6. **Android emulator startup was intermittently failing before tests.** The package workflow retries `adb root` up to five times, while retaining failure on a persistent error and the existing post-startup package/storage tests.

## Automated evidence

- Five new model/repository tests cover pasted figures and precision, label/blank behavior, atomic failure, rich/plain detection and refusal before native note/outbox writes.
- `scripts/notes/certification-check.mjs` exercises source typing and scoped totals, numeric paste/undo/manual retention, live read-only changes, clipboard refusal, independent-side deletion refusal, maximum row/column controls, node-local add/edit/width/move/undo, working-note links, save capabilities and safe export.
- Runs in Chromium and WebKit at 1440×1000, 390×844, 320×740, 820×1180, 844×390 and 1024×768. Touch contexts check 44-pixel controls. Engine-specific JSON reports explicitly record `physicalDevice:false`.
- A separate `editor-certification` release job runs both engines. Deployment requires that job and the complete existing verification job. The full existing hierarchy/touch, chart, financial, catalogue, paste/reuse/print, performance and resource suites remain required.
- Local Chromium certification and 1,482 tests passed. Local production build passed using Webpack because this isolated checkout uses a dependency symlink unsupported by Turbopack. The release runner must pass the ordinary default build. Local WebKit libraries were unavailable under container package-install restrictions; WebKit must pass on the release runner, not be silently skipped.

## Remaining certification gates

| Gate | Status / exact work needed |
|---|---|
| Web Chromium desktop and simulated touch | Automated checks; final release evidence belongs in RELEASE.md |
| WebKit engine, including simulated phone/tablet | Release-runner check; not physical Safari certification |
| Android APK package/storage installation | Emulator workflow; does not certify full editor gestures |
| Full rich editor bundled in offline APK | Pending implementation: replace plain-text notes with the rich model/editor, persist document JSON and capabilities in SQLite/outbox, resolve protected attachment access, then exercise editing/recovery in an installed WebView |
| Physical Android Chrome/WebView | Pending connected device: keyboard/IME, long press versus drag, pinch/resize, background recovery, offline replay, rotation and export |
| Physical iOS Safari | Pending device: keyboard viewport, selection, gestures, background/foreground recovery, orientation and print/share |
| Representative student task validation | Pending observed Foundation/Intermediate/Final tasks; catalogue breadth alone does not establish usability or ICAI compliance |

No physical device is connected to this execution environment. No physical-device result or bundled rich-editor parity is claimed. The automated hardening release can ship independently, but Phase 5 overall sign-off remains conditional on the outstanding gates.
