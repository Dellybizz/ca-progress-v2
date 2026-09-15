import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("direct R2 flow never buffers multipart data through the Worker", () => {
  const upload = read("app/api/resources/upload/route.ts");
  const issue = read("app/api/resources/upload-url/route.ts");
  const complete = read("app/api/resources/upload-complete/route.ts");
  assert.match(upload, /DIRECT_UPLOAD_REQUIRED/);
  assert.doesNotMatch(upload, /formData|arrayBuffer|bucket\.put/);
  assert.match(issue, /createR2PresignedUrl/);
  assert.match(issue, /expected_size_bytes/);
  assert.match(complete, /bucket\.head/);
  assert.match(complete, /OBJECT_SIZE_MISMATCH/);
  assert.match(complete, /STORAGE_LIMIT_REACHED/);
});

test("signed access preserves ownership, visibility and moderation checks", () => {
  const access = read("app/api/resources/[id]/access/route.ts");
  assert.match(access, /owner_user_id === identity\.id/);
  assert.match(access, /visibility === "shared" && row\.moderation_status === "approved"/);
  assert.match(access, /createR2PresignedUrl/);
  assert.match(access, /NextResponse\.redirect/);
});

test("abandoned direct uploads have bounded cleanup", () => {
  const migration = read("d1/migrations/0011_phase12_r2_upload_intents.sql");
  const cleanup = read("lib/jobs/execute.ts");
  assert.match(migration, /r2_upload_intents/);
  assert.match(migration, /expires_at/);
  assert.match(cleanup, /status='issued' AND expires_at < CURRENT_TIMESTAMP/);
  assert.match(cleanup, /bucket\.delete/);
  assert.match(cleanup, /status='abandoned'/);
});

test("browser resource uploader uses signed PUT then metadata completion", () => {
  const component = read("components/resources/resource-library.tsx");
  assert.match(component, /\/api\/resources\/upload-url/);
  assert.match(component, /method: "PUT"/);
  assert.match(component, /\/api\/resources\/upload-complete/);
  assert.doesNotMatch(component, /fetch\("\/api\/resources\/upload",/);
});
