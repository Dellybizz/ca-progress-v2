import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 8 opens supported private resources inside the adaptive app shell", () => {
  const page = read("app/(student)/resources/[id]/view/page.tsx");
  const viewer = read("components/resources/resource-viewer.tsx");
  assert.match(page, /getResourceDetailModel/);
  assert.match(viewer, /application\/pdf/);
  assert.match(viewer, /mimeType\.startsWith\("image\/"\)/);
  assert.match(viewer, /Preview is not available for this file type/);
});

test("Phase 8 keeps document access signed, authorized and disposition-safe", () => {
  const access = read("app/api/resources/[id]/access/route.ts");
  const presign = read("lib/resources/r2-presign.ts");
  assert.match(access, /owner_user_id === identity\.id/);
  assert.match(access, /responseContentDisposition/);
  assert.match(access, /replace\(\/\["\\\\\\r\\n\]\//);
  assert.match(presign, /response-content-disposition/);
  assert.match(presign, /response-content-type/);
});

test("Phase 8 opens saved files only from the active offline account", () => {
  const viewer = read("components/resources/resource-viewer.tsx");
  const database = read("lib/offline/database.ts");
  assert.match(viewer, /getOfflineFile\(context\.userId, id\)/);
  assert.match(database, /ownerKey\(ownerId, id\)/);
  assert.doesNotMatch(viewer, /signedUrl|localStorage/);
});

test("Phase 8 uploads directly to R2 with progress and cancellation", () => {
  const library = read("components/resources/resource-library.tsx");
  assert.match(library, /new XMLHttpRequest\(\)/);
  assert.match(library, /request\.open\("PUT", url\)/);
  assert.match(library, /request\.upload\.onprogress/);
  assert.match(library, /uploadRequest\.current\?\.abort\(\)/);
  assert.match(library, /upload-complete/);
});

test("Phase 8 routes official resources through verification and publishes its boundary", () => {
  const service = read("lib/resources/service.ts");
  const capabilities = read("config/mobile-feature-parity.ts");
  const status = read("docs/mobile/PHASE_8_RESOURCES_AND_DOCUMENTS.md");
  assert.match(service, /\/resources\/\$\{encodeURIComponent\(resource\.id\)\}\/open/);
  assert.match(capabilities, /id: "resources"/);
  assert.match(capabilities, /offline: "partial"/);
  assert.match(status, /Phase 9/);
});
