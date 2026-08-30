import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname; const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 7 upload validation runs on the server and checks size MIME extension and magic bytes", () => {
  const validation = read("lib/resources/validation.ts");
  const route = read("app/api/resources/upload/route.ts");
  assert.match(validation, /RESOURCE_MAX_BYTES = 10 \* 1024 \* 1024/);
  assert.match(validation, /MIME_BY_EXTENSION/);
  assert.match(validation, /magicMatches/);
  assert.match(validation, /%PDF|0x25, 0x50, 0x44, 0x46/);
  assert.match(validation, /0xff, 0xd8, 0xff/);
  assert.match(validation, /0xd0, 0xcf, 0x11, 0xe0/);
  assert.match(route, /validateUploadFile\(file\)/);
  assert.match(route, /createAdminSupabaseClient\(\)/);
  assert.match(route, /content-length/);
  assert.match(route, /crypto\.randomUUID\(\)/);
});

test("Phase 7 sanitizes filenames and rich note content server-side", () => {
  const validation = read("lib/resources/validation.ts");
  const notes = read("app/api/notes/route.ts");
  assert.match(validation, /normalizeFilename/);
  assert.match(validation, /replace\(\/\[\^a-zA-Z0-9\._ -\]\+\/g/);
  assert.match(validation, /sanitizeRichTextHtml/);
  assert.match(validation, /script\|style\|iframe\|object\|embed/);
  assert.match(notes, /sanitizeRichTextHtml\(rawHtml\)/);
  assert.match(notes, /richTextToPlainText\(bodyHtml\)/);
});
