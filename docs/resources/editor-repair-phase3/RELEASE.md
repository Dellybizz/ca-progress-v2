# Phase 3 verification and release tracking

Release branch: `onboarding-design-phase7`.

## Local checks

- 1,442 repository tests passed, including identity/value pairing, graph cycle/parent guards, branch clamping, safe styles/collapse behavior and bounded 40-node layout.
- TypeScript, ESLint and Next.js production build passed.
- The dedicated on-page object browser suite covers chart grid/styles/type conversion, invalid pie input, category IDs, hierarchy insertion/parenting, connector creation/reconnection/deletion/styling, branch collapse/drag/cancel, keyboard movement and undo, structured save, local recovery and A4 exports across 320, 390, 768, 820, 1024 and 1440px.
- Existing full Notes browser regression and Phase 2 inline-format checks passed at all six widths; legacy import, RTL, merged cells, save boundaries and anchored ink remain covered.
- The 20-table/60-edit performance check passed with one document snapshot, one continuous checkpoint and exact hidden-page draft flush. Local command timings: 1.2 ms median and 6.5 ms 95th percentile under concurrent verification load. These are headless command timings, not hardware input-to-paint measurements.
- Portrait and landscape A4 PDF pages were visually reviewed for chart/graph labels, colours, connectors and absence of authoring controls. Landscape places the graph on the following page, keeping it intact.

## Production boundary

The release workflow repeats repository and complete Resources/Notes browser checks, including the new six-width inline-object suite, before deployment. The isolated authenticated production fixture asserts exact structured JSON in D1, safe stored HTML and editor reopening, now including category IDs, node colours and elbow/dashed connector attributes. Production completion requires that workflow and its post-deploy checks to succeed; a local build or commit alone is insufficient.
