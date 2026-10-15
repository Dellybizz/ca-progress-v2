# File manager polish checkpoint

Next Resources feature phases are paused at the user's request. The professional typed-notes editor has not been released. This package researches and specifies the file-manager work to complete first; it does not claim the proposed redesign is already implemented.

- [Research and implementation plan](RESEARCH_AND_IMPLEMENTATION_PLAN.md): current-code audit, competitor comparison, layouts, navigation, selection, action rules, complete popup/panel inventory, transfer architecture, search/previews, recovery, accessibility, performance budgets, nine dependent work packages and release gates.
- [104 interaction acceptance cases](INTERACTION_ACCEPTANCE_MATRIX.md): a concrete test inventory covering normal, failure, permission, mobile, keyboard and large-library cases.
- [Source register](SOURCE_REGISTER.md): official Google help, MEGA's published web-client implementation and its historical desktop-transfer article, plus accessibility/performance standards. Evidence limitations and product/platform differences are explicit.
- [Completed upload foundation and live evidence](../phase2/UPLOAD_DATABASE_AND_SIDEBAR_REPAIR.md): simple untagged private upload picker, separate real-progress sidebar, database/receipt repair and signed-download fix.

FMP-00 is complete: [baseline, live reliability evidence and next-package gate](phase0/PHASE_0_STATUS.md).

Recommended implementation order is FMP-00 reliability closure, FMP-01 shared interaction/state specification, FMP-02 shell/navigation/layout, FMP-03 selection/menus, FMP-04 dialogs/inspector/organization, FMP-05 app-level transfer management, FMP-06 search/preview/recovery, FMP-07 measured accessibility/performance polish, and FMP-08 end-to-end certification. These work-package names do not renumber the existing eight-phase roadmap.

Phase 1 implementation: [interaction foundation and drag contract](phase1/PHASE_1_STATUS.md). Drag upload and internal move are mandatory acceptance journeys; UI integration follows the navigation and selection phases.

Phase 2 implementation: [navigation, history and scoped layouts](phase2/PHASE_2_STATUS.md).

Phase 3 implementation: [selection, shared action menus and drag](phase3/PHASE_3_STATUS.md).

FMP-03 is complete and deployed: selection, shared action menus, desktop file/folder drag moves, and external file staging passed 1,383 tests, desktop/mobile interaction checks and live storage gates. See the Phase 3 report for exact source/run evidence and supported-capability boundaries. Next: FMP-04 dialogs, inspector and destination picker.

Phase 4 implementation: [inspector, destination picker, dialogs, results and safe undo](phase4/PHASE_4_STATUS.md).

FMP-04 is complete and deployed. Source `e8cdfb7f` passed 1,386 tests, desktop/mobile interaction and upload recovery journeys, and the signed-in live upload/download plus actual D1 move/Trash/stale-undo checks. See the report for exact release, Worker and scoped cleanup evidence. Next: FMP-05 app-shell transfer coordination. The remaining polish packages and the paused typed-note editor have not been started automatically.
