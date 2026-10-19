# File manager research source register

Researched 15 October 2026. This register separates documented product behavior, published source-code evidence, and our own proposed requirements. Google and MEGA change their interfaces by release, device, and account. This is not a claim of an exhaustive signed-in, pixel-by-pixel inspection of either service.

Google's current official web help was accessible. MEGA's current help/blog host was not retrievable through the research service. To avoid inventing behavior, MEGA findings use its first-party published web-client source and its own clearly dated desktop-transfer article. Desktop claims are not presented as current MEGA web behavior. No private Drive or MEGA account was accessed.

## Google Drive: official product documentation

| ID | Source | Verified finding and scope |
|---|---|---|
| G01 | [How to use Google Drive](https://support.google.com/drive/answer/2424384?hl=en) | New is an entry point for creating/uploading. Home and My Drive have different purposes. Selected files expose contextual actions. Details includes file context. |
| G02 | [View and reorder files](https://support.google.com/drive/answer/2375177?hl=en) | Web list/grid layouts; list-column sorting; grid sorting menu; reverse direction; folders-on-top preference. The documentation says Home/Recent do not offer the same sorting behavior as My Drive. |
| G03 | [Organize files](https://support.google.com/drive/answer/2375091?hl=en) | Folder creation, a move destination picker, drag/drop, stars, descriptions, copying, and shortcuts. Some clipboard shortcuts are Chrome-specific. |
| G04 | [Search files](https://support.google.com/drive/answer/2375114?hl=en) | Search text combines with removable filter chips. Type, people and modified-date filters and advanced operators are documented. Search relevance and explicit sorting are distinct. |
| G05 | [Web keyboard shortcuts](https://support.google.com/drive/answer/2563044?hl=en) | Directional selection/navigation, extending selection, Escape clearing, shortcut help, and navigation to details/upload status. Key combinations vary by OS. |
| G06 | [Upload files and folders](https://support.google.com/drive/answer/2424368?hl=en) | New → file/folder upload and drag/drop are entry points. Uploading into a shared folder still uses the uploader's storage. These are product-specific quota semantics, not automatically ours. |
| G07 | [Activity and versions](https://support.google.com/drive/answer/2409045?hl=en) | Activity and binary-file versions are separate concepts. Google-native document history differs from PDF/image/binary versions. |
| G08 | [Delete files](https://support.google.com/drive/answer/2375102?hl=en) | Ownership affects delete versus remove. Trash and permanent deletion differ. Trash counts toward storage; the documented automatic deletion interval is 30 days. Drive's documented shared-access behavior while trashed must not be copied blindly. |
| G09 | [Share files](https://support.google.com/drive/answer/2494822?hl=en-IN) | Viewer/commenter/editor/owner roles, general access and inherited folder permissions are explicit. Features vary by account. This app does not currently implement that full ACL model. |
| G10 | [Screen-reader use](https://support.google.com/drive/answer/12169158?hl=en) | Documentation distinguishes navigation areas, item layouts, keyboard operation and details/activity. Accessibility is part of the interaction model. |
| G11 | [Shortcuts](https://support.google.com/drive/answer/9700156?hl=en) | A shortcut references an original; deleting the shortcut does not delete the target. A shortcut does not grant target access automatically. |

## MEGA: first-party implementation evidence

Files were read from the public `meganz/webclient` repository through GitHub on the research date. Blob SHAs pin the specific file content reviewed; they are not claims about the deployed MEGA release. No source code is copied into our product.

| ID | Source | Reviewed evidence |
|---|---|---|
| M01 | [Web client repository](https://github.com/meganz/webclient) | MEGA identifies this as its web client. It is a primary implementation reference, not a substitute for testing the current hosted interface. |
| M02 | [File manager](https://github.com/meganz/webclient/blob/master/js/fm/filemanager.js), blob `cb00aeb7cbbaddf90455e594a0b727286d2d6e68` | Column widths, visible/hidden column preferences, context-specific restrictions, and context-menu dispatch. Default and optional columns are treated differently. |
| M03 | [Selection manager](https://github.com/meganz/webclient/blob/master/js/fm/selectionManager2.js), blob `c45b3c5ba34fbd8c9307403a34d24b3ae8ce5853` | Ordered selected IDs, a current/anchor item, clear/reset, select-all, directional navigation, and shift-range handling. Selection changes also update the information panel. |
| M04 | [Information panel](https://github.com/meganz/webclient/blob/master/js/ui/info-panel.js), blob `4844282579732726b835c7a8fe46a9a515cd0666` | A persistent information-panel state; single/multiple-item statistics, aggregate type/icon handling and version-size statistics. |
| M05 | [Context menus](https://github.com/meganz/webclient/blob/master/js/fm/megadata/menus.js), blob `6f3863efc6f256bcffccad81a69ac07f9b90e323` | Action availability checks node rights, root/collection context and share state. Rename and version-related entries are conditional. |
| M06 | [Transfer integration](https://github.com/meganz/webclient/blob/master/js/fm/megadata/transfers.js), blob `47ea2b18dfb9efafc47caab613c848825975a06d` | Downloads integrate with a transfer widget; pause state and transfer/error status have explicit handling. Upload conflict handling distinguishes operations. |
| M07 | [Conflict handling](https://github.com/meganz/webclient/blob/master/js/fm/fileconflict.js), blob `6375a12642b5c57d3b90d526708d029cd204652a` | Separate replace, do-not-copy and keep-both decisions; conflict outcomes are operation-specific. |
| M08 | [Transfer queue](https://github.com/meganz/webclient/blob/b8891ce83ad57294996f34b4ebaf21aff5a8aa1b/js/transfers/queue.js) and [transfer utilities](https://github.com/meganz/webclient/blob/b8891ce83ad57294996f34b4ebaf21aff5a8aa1b/js/transfers/utils.js) | Indexed first-party implementation exposes explicit queue pause/resume and transfer-widget updates. This supports separating transfer state from the file-picker component. |
| M09 | [MEGA's desktop transfer-manager article, 22 September 2022](https://medium.com/@mega-blog/mega-desktop-app-gets-a-new-transfer-manager-3d9be6d08877) | Desktop-specific reference: all transfers, category views, per-item/group controls, sorting, prioritization, search and a shared transfer data model. This is historical desktop evidence, not a 2026 web feature guarantee. |

## Standards and engineering references

| ID | Source | Application |
|---|---|---|
| A01 | [WAI-ARIA grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/) | Composite focus management, directional navigation and grid-versus-table semantics. Adding `role=grid` alone does not implement the pattern. |
| A02 | [WAI-ARIA menu button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) | A menu trigger has predictable keyboard opening, focus and expanded state. |
| A03 | [WAI-ARIA modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | Modal focus containment, dismissal and return focus; applicable to actual blocking decisions, not a non-modal inspector. |
| A04 | [Web Vitals](https://web.dev/articles/vitals) | Current good-experience thresholds: LCP ≤2.5 seconds, INP ≤200 milliseconds, CLS ≤0.1, assessed at the 75th percentile. Our API/transfer targets in the plan are proposed engineering budgets, not competitor measurements. |
| A05 | [AWS canonical signing](https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sig-v4-header-based-auth.html) | URI-encode then sort signing parameters. This informed the R2 download-signature correction discovered by live testing. |

## Boundaries of this research

- Exact competitor spacing, animation durations, experiment-specific UI, current MEGA mobile-web parity, and every hover/long-press variant remain visual-validation items; no invented screenshots or measurements are used.
- Google help and MEGA source establish interaction principles. All proposed sizes, priorities, state contracts and performance budgets in our plan are our design decisions.
- Our current-app audit is source-based plus existing automated browser and API evidence. It is not a fresh comprehensive manual accessibility or penetration audit.
- Before implementation sign-off, perform a targeted visual walkthrough on the actual supported devices and check the unresolved items listed in the plan. That verification does not require access to anyone's private competitor files.
