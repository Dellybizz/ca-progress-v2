import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const source = readFileSync(join(root, "app/(public)/privacy/page.tsx"), "utf8");

test("public privacy policy documents active identity providers and guest mode", () => {
  assert.match(source, /Privacy Policy/);
  assert.match(source, /Google/);
  assert.match(source, /LinkedIn/);
  assert.match(source, /Guest mode/);
  assert.match(source, /Supabase/);
  assert.match(source, /Cloudflare/);
  assert.match(source, /does not sell your personal information/);
});
