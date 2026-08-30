import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("shared-shell preview routes use the dynamic Worker render path", () => {
  for (const route of [
    "app/(student)/settings/page.tsx",
    "app/(student)/tests/page.tsx",
    "app/(admin)/admin/page.tsx",
  ]) {
    assert.match(read(route), /export const dynamic = ["']force-dynamic["']/);
  }
});
