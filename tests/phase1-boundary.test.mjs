import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("preferences and analytics stay provider-neutral", () => {
  const source = ["lib/preferences/contract.ts", "lib/analytics/events.ts"].map(read).join("\n");
  assert.doesNotMatch(source, /@supabase\/|SUPABASE_|lib\/supabase/);
});

test("analytics remains a provider-neutral interface placeholder", () => {
  const analytics = read("lib/analytics/events.ts");
  assert.match(analytics, /AnalyticsSink/);
  assert.match(analytics, /noopAnalyticsSink/);
  assert.equal(/posthog|mixpanel|segment|google-analytics/i.test(analytics), false);
});
