import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
function collect(dir) { const out = []; for (const entry of readdirSync(dir)) { const path = join(dir, entry); if (statSync(path).isDirectory()) { if (!["node_modules", ".git"].includes(entry)) out.push(...collect(path)); } else if (/\.(ts|tsx|sql)$/.test(entry)) out.push(readFileSync(path, "utf8")); } return out; }
test("Phase 1 does not silently implement Phase 2 or Phase 3 feature logic", () => { const source = collect(root).join("\n"); for (const forbidden of ["signInWithOAuth", "signInWithOtp", "verifyOtp", "course_levels", "syllabus_versions", "chapter_progress"]) assert.equal(source.includes(forbidden), false, forbidden); });
test("analytics remains a provider-neutral interface placeholder", () => { const analytics = readFileSync(join(root, "lib/analytics/events.ts"), "utf8"); assert.match(analytics, /AnalyticsSink/); assert.match(analytics, /noopAnalyticsSink/); assert.equal(/posthog|mixpanel|segment|google-analytics/i.test(analytics), false); });
