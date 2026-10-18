# Register layout corrective release

18 October 2026. This corrects the defects reported after phase 2; earlier phase 2 certification did not cover these layouts adequately. Phase 3 remains separate.

| Defect | Correction |
| --- | --- |
| Resizing shrinks controls and leaves wide tables | Unscaled contextual dock outside the document; independent saved content scale and width; percentage column geometry |
| Authoring gutters and oversized column controls consume paper | Controls no longer participate in table layout; thin column boundaries; paired account sides remain joined |
| Visible paper has inaccessible placement regions | Full A4 coordinate system, including margins; legacy positions retain their appearance |
| Blank paper cannot accept content or a new working | Double-click creates editable positioned text; dragging into a facing placeholder creates its page |
| New page ignores existing positioned workings | Add page appends after the actual last sheet, with single-step undo |
| Hierarchy resize clips nodes and creates scroll boxes | Fit the entire graph in the saved frame; reserve control space; keep editing controls outside scaled paper |
| Selection frames ignore captions or continued tables | Captions travel and scale with their working; bounds follow actual fragments; grips attach to actual edges |
| Long positioned tables revert to flow or lose pages | Retain placement and continue rows into subsequent sheets; count actual fragments |
| Printing clips margin content | Whole-paper crops and matching saved coordinates, scale and continuation |
| Numeric values wrap and alter editing | Keep figures together; fit text to available cell width without changing stored values |
| Layout writes interfere with editing | Flush pending input, suspend DOM observation only during presentation writes, then resume; preserve focused graph nodes |
| Snap targets include table-cell paragraphs | Snap to peer objects, excluding descendants of financial workings |

Compatibility: object-placement-v2 capability guards writes from older clients. Existing version 1 positions are interpreted with their original margin reference. Content scale is explicit and independently validated. Positioned paragraph attributes are validated and exported.

Local validation: 1,494 unit tests; TypeScript and lint; Chromium browser suites covering general editing, certification, accounting, financial tools, hierarchy, object manipulation and touch manipulation. Register tests cover desktop, phone and tablet. New layout repair suite covers 1916×1000, 1440×1000, 390×1000 and 844×390, full-page edge placement, mobile pointer drag, undo, blank text, placeholder drops, 121-row continuation and print coordinates. Screenshots inspected for desktop table and phone hierarchy. Twenty-table performance fixture: 6.2 ms p95 editing latency. Final release requires CI Chromium/WebKit, certification and live deployment verification.

Physical-device and offline APK parity remain outside these browser checks.
