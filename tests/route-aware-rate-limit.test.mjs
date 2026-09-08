import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const worker = readFileSync(new URL("../custom-worker.ts", import.meta.url), "utf8");

test("page navigation is not charged to the API rate limiter", () => {
  assert.match(worker, /const isApi = pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /isApi && pathname !== "\/api\/health"/);
});

test("read and write APIs use independent limits and buckets", () => {
  assert.match(worker, /READ_API_RATE_LIMIT = 300/);
  assert.match(worker, /WRITE_API_RATE_LIMIT = 60/);
  assert.match(worker, /isRead \? "read" : "write"/);
});
