# Register redesign — Phase 1

Scope: page layout and paper controls, following the October 18 register-editor request. This is a new redesign sequence; it does not replace the earlier direct-manipulation Phase 5 certification record.

## Delivered

- New notes start in A4 register view. Existing structured notes preserve their saved view; legacy HTML notes preserve the continuous editing path.
- Portrait shows two facing sheets when the available editor width is at least 1,000px. Smaller widths focus one sheet. Landscape focuses one selected sheet.
- A single ProseMirror document flows across fixed-height CSS columns. No pagination nodes, duplicated editor instances, or DOM reparenting are written into the note. Explicit page breaks remain canonical content.
- Page selection, previous/next spread, append page, active-page outline, paper thumbnails, fit width, fit page, and 50–150% zoom. Navigation and zoom do not mutate the note. Automatic phone/tablet zoom preserves readable text; horizontal panning stays inside the page viewport.
- Plain, ruled, narrow ruled, squared, and dotted paper. Spacing, colour, opacity, register margin, and a separate print inclusion setting.
- Paper applies to every page or the selected page number. Page overrides follow page numbers as text reflows. Applying all-page paper deliberately replaces overrides; merely changing orientation preserves them.
- Headers, footers and page numbers stay in page margins. Landscape/portrait dimensions use the same geometry for screen and print.
- Register print creates one clipped column per physical sheet with paper backgrounds and per-page overrides. Typography, math and loaded attachments are prepared before print. Financial exports retain semantic table headers.
- Closing a panel restores editor focus synchronously, preventing a delayed WebKit focus request from redirecting title input into the document. Paper and table headings retain readable contrast in dark app themes.
- Fixed graph menus mount outside zoomed paper to preserve viewport positioning. Coarse-pointer account insertion targets remain at least 44 physical pixels when zoomed.

## Compatibility and verification

Paper settings are optional validated layout fields; old notes need no migration. Content JSON, stable financial IDs, formulas, branch settings, original HTML, and persistence payload structure remain unchanged.

New model tests cover paper roundtrip, old layouts, invalid settings/CSS injection, page geometry, and ruling generation. The register browser suite covers desktop, phone and tablet; page creation/undo, long text and tables, explicit breaks, typing/undo, paper scopes, orientation/cancellation, save payloads, zoom and print. Both Chromium and WebKit are mandatory release gates. Existing editor and live-save regressions remain mandatory.

Local verification: 1,486 model/repository tests passed; TypeScript and ESLint passed. Chromium existing editor certification passed all six sizes; the full existing Notes editor browser suite passed desktop/mobile/tablet and legacy import. The new register suite passed 1,440px, 390px and 820px, including long-table column flow. The 20-table/60-edit local benchmark retained one snapshot and one continuous checkpoint (median 2.2ms, p95 3.6ms; headless command timing). A generated two-page landscape PDF was rendered and inspected; A4 dimensions and page count were verified.

Release verification is recorded after CI and deployment finish. Physical Android/iOS validation and offline APK rich-editor integration remain separate open gates from the earlier certification work. New resize/move controls, context menus, complete branch copying, joined account sides and appearance presets belong to subsequent redesign phases.

## Implementation boundaries

Browser pagination measures actual font/image layout; changing orientation or font can change page count. The page switcher is a visual paper thumbnail, not a second rendered editor. Very large single rows or nested unbreakable content require shorter rows or continuous view. Browser-specific fragmentation and physical print settings must be validated on target hardware; no physical-device certification is claimed.
