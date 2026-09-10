import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { designBaseline, designBaselineRoutes, designPrinciples, globalDesignOwners } from "../config/design-visual-baseline.mjs";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const globals = read("app/globals.css");
const designDoc = read("docs/CA_PROGRESS_DESIGN_SYSTEM.md");

const expectedRoutes = [
  "/dashboard",
  "/study",
  "/planner",
  "/progress",
  "/chapters/[chapterId]",
  "/community",
  "/settings",
  "/admin",
];

test("Design Phase 0 preserves a historical comparison baseline and fixed viewports", () => {
  assert.equal(designBaseline.baselineSha, "9e991b08c413240e070119c42ec18aeefa8d041b");
  assert.deepEqual(designBaseline.viewports.desktop, { width: 1440, height: 1000 });
  assert.deepEqual(designBaseline.viewports.mobile, { width: 390, height: 844 });
  assert.match(designBaseline.note, /historical visual baseline/i);
});

test("Design Phase 0 keeps the representative route baseline complete", () => {
  assert.deepEqual(designBaselineRoutes.map((item) => item.pathname), expectedRoutes);
  for (const item of designBaselineRoutes) {
    assert.ok(existsSync(join(root, item.page)), `${item.pathname} page source is missing: ${item.page}`);
    assert.ok(item.purpose.length > 24, `${item.pathname} needs an explicit page responsibility`);
    assert.ok(item.focus.length >= 3, `${item.pathname} needs a meaningful visual focus contract`);
    for (const css of item.cssOwners) {
      assert.ok(existsSync(join(root, css)), `${item.pathname} CSS owner is missing: ${css}`);
      if (css.startsWith("app/styles/")) {
        const importPath = `@import \"./styles/${css.split("/").pop()}\";`;
        assert.ok(globals.includes(importPath), `${css} must remain globally imported until its route is deliberately migrated`);
      }
    }
  }
});

test("Design Phase 0 points to the canonical shared foundation and cascade", () => {
  assert.deepEqual(globalDesignOwners, [
    "app/styles/tokens.css",
    "app/styles/components.css",
    "app/styles/shell.css",
  ]);
  for (const owner of globalDesignOwners) assert.ok(existsSync(join(root, owner)), `Missing canonical design owner: ${owner}`);
  assert.equal(existsSync(join(root, "app/styles/shell-phase2.css")), false);

  const tokensIndex = globals.indexOf('@import "./styles/tokens.css";');
  const componentsIndex = globals.indexOf('@import "./styles/components.css";');
  const mobileScrollIndex = globals.indexOf('@import "./styles/mobile-scroll-fix.css";');
  const shellIndex = globals.indexOf('@import "./styles/shell.css";');
  assert.ok(tokensIndex >= 0 && componentsIndex > tokensIndex, "tokens must load before shared components");
  assert.ok(shellIndex > componentsIndex, "shell must load after shared components");
  assert.ok(shellIndex > mobileScrollIndex, "canonical shell must load after legacy route/mobile patch styles");
});

test("Design Phase 0 locks the anti-slop design intent in executable and written form", () => {
  assert.ok(designPrinciples.length >= 10);
  const joined = designPrinciples.join(" ");
  assert.match(joined, /avoid card soup/i);
  assert.match(joined, /No glassmorphism/i);
  assert.match(joined, /Mobile is intentionally composed/i);
  assert.match(designDoc, /Amie-level restraint/);
  assert.match(designDoc, /Quizlet-level educational clarity/);
  assert.match(designDoc, /Dub-level density/);
  assert.match(designDoc, /Cal\.com-style scheduling clarity/);
  assert.match(designDoc, /There is no late Phase 2 override stylesheet/);
});

test("Design Phase 0 explicitly records current route-level legacy risks", () => {
  const dashboard = designBaselineRoutes.find((item) => item.id === "dashboard");
  const admin = designBaselineRoutes.find((item) => item.id === "admin");
  const settings = designBaselineRoutes.find((item) => item.id === "settings");
  assert.ok(dashboard.cssOwners.length >= 6);
  assert.match(dashboard.risks.join(" "), /Multiple generations of dashboard CSS/);
  assert.match(admin.risks.join(" "), /inline React styles/);
  assert.match(settings.risks.join(" "), /ProductPreviewPage/);
});
