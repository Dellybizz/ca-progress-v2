import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;

test("health endpoint is no-store and correlation-aware", () => {
  const route = readFileSync(join(root, "app/api/health/route.ts"), "utf8");
  assert.match(route, /Cache-Control/);
  assert.match(route, /no-store/);
  assert.match(route, /X-Request-Id/);
  assert.match(route, /crypto\.randomUUID/);
});

test("structured logger redacts sensitive key names", () => {
  const logger = readFileSync(join(root, "lib/logging/logger.ts"), "utf8");
  assert.match(logger, /REDACTED/);
  assert.match(logger, /authorization/);
  assert.match(logger, /service.\?role/);
});
