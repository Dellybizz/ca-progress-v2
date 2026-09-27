# Phase 4 implementation status — 28 September 2026 (India)

Branch: `mobile-phase7-student-parity`. Phase 4 is **partially implemented**; it has not passed the installed app performance definition of done.

## Delivered in this increment

- Resources shows account scoped offline storage bytes, file count, pinned count, and whether an offline copy is current or older than the server checksum. A user can pin a downloaded file, unpin it, remove its native vault bytes, and update an outdated copy. Removing a file no longer clears only SQLite metadata. iOS removal now propagates actual filesystem failures.
- Retrying a paused or failed download reuses its existing transfer record. The network transfer still starts over; range based byte resume is not implemented. Replacing an outdated copy attempts to remove the old vault file and its index after the new checksum is verified. Account scoped recovery retries removal of unreferenced vault files, including while offline.
- The repository cleanup path now requires a native file removal callback before evicting an index entry. Its metadata and index change together after deletion. No automatic eviction is invoked by this increment.
- Global offline search includes locally saved note titles and text, plus saved resource titles alongside existing subjects and chapters. Selecting a saved note or resource opens its local detail. This scans account scoped in-memory records; it is not a full text index of PDF contents.
- A reproducible measurement command, `node scripts/mobile/measure-artifacts.mjs`, records bundle bytes and SHA-256. The built shell contains its HTML, JS and CSS before network access.

## Measured bundle baseline

| Artifact | Size (bytes) |
| --- | ---: |
| `native-shell/index.html` | 420 |
| `native-shell/assets/app.js` | 427,030 |
| `native-shell/assets/app.css` | 61,521 |
| **Bundled web shell total** | **488,971** |

The preceding local commit (`dda01b5`) had 422,452 bytes of JS and 61,157 bytes of CSS; the new JS/CSS increase is 4,942 bytes. These are uncompressed file sizes, not APK download or installed size.

## Required before Phase 4 is complete

- A versioned public academic catalogue is still downloaded from the server after sign in; no verified per-level/attempt content pack is bundled. PDF rights, checksums, version manifests, storage budgets, and per-subject pack controls need source review and implementation.
- Large downloads pass through JavaScript byte arrays and base64 before the native vault. True native streaming and range based resume are needed before offering large subject packs safely. Local PDF text extraction and indexed document search are not implemented.
- The Android SDK and Gradle distribution are absent in this workspace. APK/AAB and iOS installed size, cold/warm start, transition/edit latency, initial download, battery and network comparisons cannot be measured here. No APK from this increment exists.
- Phase 2's complete account download and offline attempt switching, plus Phase 3's full website journal coverage, remain prerequisites for a complete offline first experience.

Verification: TypeScript typecheck, native bundle generation, the resource SQLite integration test, and all 892 repository tests pass. Real Android/iOS file deletion, pin persistence and storage pressure still require device testing.
