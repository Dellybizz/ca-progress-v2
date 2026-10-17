# Notes workspace redesign — Phase 1

Scope: compact authoring shell and SVG writing controls; continuous working widths; persistent paper orientation; selection/caret access and deliberate Apply/Cancel page setup. Chart/diagram resizing and ink editing remain subsequent phases from the 17 October audit.

## Delivered behaviour

- Notes routes load a scoped 56px desktop shell and omit the redundant route trail before editor hydration. The loading skeleton uses the authoring layout rather than a library grid.
- A 44px document header and compact tool row give space back to writing. Older wrapper and duplicate trailing padding are removed. New documents default to Wide; Readable and Full width are available independently of paper layout.
- SVG undo/redo, lists, checklist, highlight, insertion and layout icons use the existing app icon system. Mobile retains essential writing/insertion controls and opens additional formatting in a bounded panel. Outline opens as a modal on mobile.
- Blank document guidance is non-interactive; clicking canvas whitespace focuses the end of the document. Ctrl/Cmd+S and Ctrl/Cmd+F work from editor controls as well as document content.
- A4 portrait is 210×297mm; landscape is 297×210mm. Letter and custom sizes use the same pure geometry helpers. Orientation and working width are stored in the structured layout; old documents without those fields remain valid.
- Page setup is a draft: Apply validates and commits; Cancel/close discard it. Print preview can inspect the draft without changing the saved layout.
- Page-width display fits physical paper geometry within the viewport; native browser pinch/trackpad zoom remains available. This is not a claim of a new automatic pagination engine.

## Schema direction for later phases

Existing stable block identities and versioned structured documents remain the foundation. Future object size/placement and vector ink require their own validated node attributes and stable object IDs. Ink must use explicit page/object anchoring and orientation transforms; no raster flattening or unbounded per-pointer-event cloud snapshots are introduced here.

## Verification

1,420 tests pass locally. TypeScript and ESLint pass. Browser checks exercise six widths (320/390/768/820/1024/1440), cancelled orientation edits, saved landscape layout, working widths, mobile formatting access, existing tables/charts/images/equations, recovery after reload and legacy RTL/merged-table import. Generated portrait and landscape PDFs were inspected; page sizes match A4 orientations. Existing file-manager cached navigation checks pass.

CI repeats browser and production checks. The isolated authenticated live fixture verifies exact structured JSON and changing landscape to portrait against deployed D1 before release completion. Physical Android keyboard/stylus certification is outside Phase 1.

Released and verified: see [RELEASE.md](RELEASE.md). Mobile formatting preserves keyboard focus within its panel until Done/close restores document focus.
