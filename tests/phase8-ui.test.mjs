import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 8 student and admin surfaces include loading/error states", () => {
  for (const base of ["app/(student)/resources/icai", "app/(student)/updates", "app/(admin)/admin/icai-sync"]) {
    for (const file of ["page.tsx", "loading.tsx", "error.tsx"]) assert.equal(existsSync(join(root, base, file)), true, `${base}/${file}`);
  }
});

test("ICAI resource browser exposes all required filters and provenance", () => {
  const browser = read("components/icai/resource-browser.tsx");
  for (const name of ["level", "attempt", "subject", "type"]) assert.match(browser, new RegExp(`name=\\"${name}\\"`));
  assert.match(browser, /First seen/);
  assert.match(browser, /Last verified/);
  assert.match(browser, /Open official resource/);
  assert.match(browser, /Official-source verified/);
});

test("updates page has attempt-aware notification preview and subject filtering", () => {
  const feed = read("components/icai/updates-feed.tsx");
  const page = read("app/(student)/updates/page.tsx");
  assert.match(feed, /Student notification preview/);
  assert.match(feed, /name="subject"/);
  assert.match(page, /viewerAttemptKey/);
  assert.match(page, /subject: param\(params\.subject\)/);
});

test("admin monitor enforces server authorization and exposes sync/review/source health", () => {
  const page = read("app/(admin)/admin/icai-sync/page.tsx");
  const actions = read("app/(admin)/admin/icai-sync/actions.ts");
  const monitor = read("components/icai/admin-sync-monitor.tsx");
  assert.match(page, /getAdminOperator/);
  assert.match(page, /Access denied/);
  assert.match(actions, /requireAdminOperator/);
  assert.match(monitor, /Run Sync now/);
  assert.match(monitor, /Review queue/);
  assert.match(monitor, /Content hash/);
  assert.match(monitor, /Parser/);
});

test("Phase 8 navigation and responsive stylesheet are wired into both shells", () => {
  const nav = read("components/shell/navigation.tsx");
  const mobile = read("components/shell/mobile-nav-placeholder.tsx");
  const globals = read("app/globals.css");
  const css = read("app/styles/icai.css");
  assert.match(nav, /\/updates/);
  assert.match(nav, /\/resources\/icai/);
  assert.match(nav, /\/admin\/icai-sync/);
  assert.match(mobile, /import \{ adminNavigation, studentNavigation \} from "\.\/navigation"/);
  assert.match(mobile, /adminNavigation\.filter/);
  assert.match(globals, /styles\/icai\.css/);
  assert.match(css, /@media \(max-width: 760px\)/);
});
