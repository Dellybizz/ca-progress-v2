import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const shell = read("components/shell/app-shell.tsx");
const desktopNav = read("components/shell/navigation.tsx");
const mobileNav = read("components/shell/mobile-nav-placeholder.tsx");
const shellCss = read("app/styles/shell.css");
const mobileScroll = read("app/styles/mobile-scroll-fix.css");
const environmentBanner = read("components/shell/environment-banner.tsx");
const globals = read("app/globals.css");

test("Phase 2 uses shell.css as the single application-chrome authority", () => {
  assert.equal(existsSync(join(root, "app/styles/shell-phase2.css")), false, "temporary Phase 2 override must not return");
  assert.doesNotMatch(globals, /shell-phase2\.css/);
  const shellIndex = globals.indexOf('@import "./styles/shell.css";');
  const mobileScrollIndex = globals.indexOf('@import "./styles/mobile-scroll-fix.css";');
  assert.ok(shellIndex > mobileScrollIndex, "shell.css must load after route-era/mobile patch styles");
  assert.match(shellCss, /\/\* Canonical application shell and navigation \*\//);
});

test("Phase 2 removes fake production chrome and decorative shell treatments", () => {
  assert.doesNotMatch(shell, /Workspace ready/);
  assert.doesNotMatch(shell, /Focused\. Clear\. Consistent\./);
  assert.match(shell, /Student workspace/);
  assert.match(shell, /Admin workspace/);
  assert.match(environmentBanner, /if \(appEnv === "production"\) return null;/);
  assert.doesNotMatch(shellCss, /backdrop-filter/);
  assert.match(shellCss, /\.sidebar-brand__mark\s*\{[\s\S]*?background:\s*var\(--color-brand\);/);
});

test("Phase 2 desktop navigation keeps the primary study flow visible and every secondary area reachable", () => {
  assert.match(desktopNav, /studentPrimaryNavigation/);
  for (const label of ["Dashboard", "Today Plan", "Study", "Progress", "Planner", "Study tools", "Library", "Community", "Account", "Analytics", "Study Buddy"]) {
    assert.ok(desktopNav.includes(label), `Missing desktop navigation contract: ${label}`);
  }
  assert.match(desktopNav, /pathname\.startsWith\("\/dashboard\/"\)/);
  assert.match(desktopNav, /aria-controls=\{regionId\}/);
});

test("Phase 2 mobile navigation exposes the core flow and keeps secondary pages under More", () => {
  for (const label of ["Home", "Today", "Study", "Progress", "More"]) {
    assert.ok(mobileNav.includes(`<span>${label}</span>`), `Missing primary mobile item: ${label}`);
  }
  for (const label of ["Analytics", "Forecast", "Goals", "Tests", "Study Buddy", "Settings"]) {
    assert.ok(mobileNav.includes(`label: "${label}"`), `Missing secondary mobile item: ${label}`);
  }
  assert.match(mobileNav, /progressRouteMatches/);
  assert.match(mobileNav, /const moreActive = secondaryActive/);
  assert.match(mobileNav, /aria-expanded=\{moreOpen\}/);
});

test("Phase 2 mobile chrome is flat, edge-to-edge and respects fixed-nav clearance", () => {
  assert.match(shellCss, /\.mobile-bottom-nav\s*\{[\s\S]*?left:\s*0;/);
  assert.match(shellCss, /\.mobile-bottom-nav\s*\{[\s\S]*?right:\s*0;/);
  assert.match(shellCss, /\.mobile-bottom-nav\s*\{[\s\S]*?border-top:\s*1px solid var\(--color-border\);/);
  assert.match(shellCss, /\.mobile-bottom-nav\s*\{[\s\S]*?box-shadow:\s*none;/);
  assert.match(mobileScroll, /padding-bottom:\s*calc\(var\(--bottom-nav-height\)/);
  assert.match(mobileScroll, /left:\s*0 !important;/);
  assert.match(mobileScroll, /bottom:\s*0 !important;/);
});
