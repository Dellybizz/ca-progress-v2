import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const shell = read("components/shell/app-shell.tsx");
const desktopNav = read("components/shell/navigation.tsx");
const mobileNav = read("components/shell/mobile-nav-placeholder.tsx");
const shellCss = read("app/styles/shell-phase2.css");
const mobileScroll = read("app/styles/mobile-scroll-fix.css");
const globals = read("app/globals.css");

test("Phase 2 shell removes fake readiness chrome and marketing-like shell copy", () => {
  assert.doesNotMatch(shell, /Workspace ready/);
  assert.doesNotMatch(shell, /Focused\. Clear\. Consistent\./);
  assert.doesNotMatch(shell, />Staging</);
  assert.match(shell, /Student workspace/);
  assert.match(shell, /Admin workspace/);
});

test("Phase 2 desktop navigation keeps primary study actions visible and secondary tools grouped", () => {
  assert.match(desktopNav, /studentPrimaryNavigation/);
  assert.match(desktopNav, /Today Plan/);
  assert.match(desktopNav, /Study tools/);
  assert.match(desktopNav, /Library/);
  assert.match(desktopNav, /Study Buddy/);
  assert.match(desktopNav, /sidebar-nav-primary/);
});

test("Phase 2 mobile navigation exposes the core flow directly and retains secondary destinations", () => {
  assert.match(mobileNav, />Home<\/span>/);
  assert.match(mobileNav, />Today<\/span>/);
  assert.match(mobileNav, />Study<\/span>/);
  assert.match(mobileNav, />Progress<\/span>/);
  assert.match(mobileNav, /Open more navigation/);
  assert.match(mobileNav, /Study Buddy/);
  assert.match(mobileNav, /Settings/);
});

test("Phase 2 chrome is flat, edge-to-edge on mobile and loaded after legacy page styles", () => {
  assert.match(shellCss, /\.sidebar-brand__mark\s*\{[\s\S]*?background:\s*var\(--color-brand\);/);
  assert.match(shellCss, /\.mobile-bottom-nav\s*\{[\s\S]*?border-radius:\s*0;/);
  assert.match(shellCss, /\.mobile-bottom-nav\s*\{[\s\S]*?box-shadow:\s*none;/);
  assert.match(shellCss, /backdrop-filter:\s*none;/);
  assert.match(mobileScroll, /left:\s*0 !important;/);
  assert.match(mobileScroll, /bottom:\s*0 !important;/);
  const shellPhase2Index = globals.indexOf('@import "./styles/shell-phase2.css";');
  const legacyMobileIndex = globals.indexOf('@import "./styles/mobile-scroll-fix.css";');
  assert.ok(shellPhase2Index > legacyMobileIndex, "Phase 2 shell must remain the final application-chrome authority");
});
