import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 5 is the current V2 staging label", () => {
  assert.match(read("wrangler.jsonc"), /NEXT_PUBLIC_APP_VERSION\": \"phase-5\"/);
  assert.match(read(".env.example"), /NEXT_PUBLIC_APP_VERSION=phase-5/);
  assert.match(read("lib/env.ts"), /\|\| \"phase-5\"/);
});
