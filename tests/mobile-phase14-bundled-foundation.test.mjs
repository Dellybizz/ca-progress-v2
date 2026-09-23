import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");

test("Phase 14 release config loads only the installed bundle", () => {
  const config = read("capacitor.config.ts");
  assert.match(config, /webDir: "native-shell"/);
  assert.match(config, /CAPACITOR_LIVE_RELOAD_URL/);
  assert.doesNotMatch(config, /url: "https:\/\/caprogress\.zanisheluxe\.in"/);
  assert.match(read("config/app-release.ts"), /updateMode: "store"/);
  assert.match(read("config/app-release.ts"), /bundleBuild: 2/);
});

test("bundled React shell includes every initial route frame", () => {
  const source = read("apps/mobile/src/main.tsx");
  for (const route of ["today", "progress", "planner", "focus", "community", "settings"]) assert.match(source, new RegExp(`"${route}"`));
  assert.match(source, /createRoot/);
  assert.match(source, /readLocalAccount/);
  assert.match(source, /function Bootstrap/);
  assert.match(source, /Continue on this device/);
  assert.match(source, /requestAnimationFrame\(\(\) => document\.documentElement\.dataset\.shellReady/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});

test("built shell is self-contained and available before native sync", () => {
  for (const path of ["native-shell/index.html", "native-shell/assets/app.js", "native-shell/assets/app.css"]) {
    assert.ok(existsSync(join(process.cwd(), path)), `${path} must be generated`);
    assert.ok(read(path).length > 100, `${path} must not be an empty placeholder`);
  }
  const html = read("native-shell/index.html");
  assert.match(html, /\.\/assets\/app\.js/);
  assert.match(html, /\.\/assets\/app\.css/);
  assert.doesNotMatch(html, /https:\/\/caprogress\.zanisheluxe\.in/);
});

test("native runtime constrains deep links and external navigation", () => {
  const runtime = read("apps/mobile/src/runtime.ts");
  assert.match(runtime, /SAFE_DEEP_LINK/);
  assert.match(runtime, /CANONICAL_ORIGINS/);
  assert.match(runtime, /appUrlOpen/);
  assert.match(runtime, /backButton/);
  assert.match(runtime, /protocol !== "https:"/);
  assert.match(runtime, /"_system", "noopener,noreferrer"/);
});

test("adaptive shell covers safe areas, keyboard-sized viewports and reduced motion", () => {
  const css = read("apps/mobile/src/styles.css");
  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /100dvh/);
  assert.match(css, /orientation:landscape/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /max-width:760px/);
});

test("Phase 14 workflow builds the bundle and certifies the phase", () => {
  const workflow = read(".github/workflows/mobile-release.yml");
  const packageJson = read("package.json");
  assert.match(workflow, /apps\/mobile\/\*\*/);
  assert.match(workflow, /test:mobile:phase14/);
  assert.match(packageJson, /native:bundle/);
  assert.match(packageJson, /native:sync:android.*native:bundle/);
  assert.match(read("docs/mobile-local-first/PHASE_14_STATUS.md"), /Status: Complete/);
});
