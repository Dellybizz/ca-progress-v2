import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname; const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 7 validates descriptors server-side and uses direct private R2 URLs", () => {
  const validation = read("lib/resources/validation.ts");
  const issue = read("app/api/resources/upload-url/route.ts");
  const complete = read("app/api/resources/upload-complete/route.ts");
  assert.match(validation, /RESOURCE_MAX_BYTES = 10 * 1024 * 1024/);
  assert.match(validation, /MIME_BY_EXTENSION/);
  assert.match(validation, /magicMatches/);
  assert.match(validation, /%PDF|0x25, 0x50, 0x44, 0x46/);
  assert.match(validation, /0xff, 0xd8, 0xff/);
  assert.match(validation, /0xd0, 0xcf, 0x11, 0xe0/);
  assert.match(issue, /getResourceStorageAccess/);
  assert.match(issue, /createR2PresignedUrl/);
  assert.match(issue, /RESOURCE_MAX_BYTES/);
  assert.match(issue, /crypto\.randomUUID\(\)/);
  assert.match(complete, /bucket\.head/);
  assert.match(complete, /OBJECT_SIZE_MISMATCH/);
  assert.match(complete, /OBJECT_MIME_MISMATCH/);
  assert.doesNotMatch(issue + complete, /\.storage\.from\(|admin\.storage/);
});

test("Phase 7 R2 upload persists metadata through the server-only D1 quota service", () => {
  const route = read("app/api/resources/upload-complete/route.ts");
  const billingService = read("lib/billing/service.ts");
  assert.match(route, /getSupabaseAdminRuntimeConfig\(\)/);
  assert.match(route, /createResourceMetadataWithinQuota/);
  assert.match(billingService, /import "server-only"/);
  assert.match(billingService, /createD1AdminCompatClient/);
  assert.match(billingService, /client\.from\("uploaded_resources"\)/);
  assert.match(route, /METADATA_SERVICE_NOT_CONFIGURED/);
  assert.doesNotMatch(route, /getSupabaseAdminConfig\(\)/);
});

test("Phase 7 upload API returns stable JSON errors and checks direct-upload readiness", () => {
  const route = read("app/api/resources/upload-url/route.ts");
  assert.match(route, /function error/);
  assert.match(route, /R2_NOT_CONFIGURED|R2_SIGNING_NOT_CONFIGURED/);
  assert.match(route, /UPLOAD_DESCRIPTOR_INVALID/);
  assert.match(route, /try \{[\s\S]*optionalUser\(\)/);
});

test("Phase 7 upload drawer tolerates empty or non-JSON proxy responses", () => {
  const library = read("components/resources/resource-library.tsx");
  assert.match(library, /await response\.text\(\)/);
  assert.match(library, /if \(!body\.trim\(\)\) return \{\}/);
  assert.match(library, /JSON\.parse\(body\)/);
  assert.doesNotMatch(library, /await response\.json\(\)/);
  assert.match(library, /CLIENT_UPLOAD_MAX_BYTES = 10 \* 1024 \* 1024/);
  assert.match(library, /uploadFallbackMessage\(response\.status\)/);
  assert.match(library, /stored in Cloudflare R2/);
});

test("Phase 7 sanitizes filenames and rich note content server-side", () => {
  const validation = read("lib/resources/validation.ts");
  const notes = read("app/api/notes/route.ts");
  assert.match(validation, /normalizeFilename/);
  assert.match(validation, /sanitizeRichTextHtml/);
  assert.match(validation, /script\|style\|iframe\|object\|embed/);
  assert.match(notes, /sanitizeRichTextHtml\(rawHtml\)/);
  assert.match(notes, /richTextToPlainText\(bodyHtml\)/);
});
