import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 4 uses a route-aware app bar without removing canonical navigation", () => {
  const shell = read("components/shell/app-shell.tsx");
  const bar = read("components/shell/mobile-app-bar.tsx");
  const navigation = read("components/shell/navigation-contract.ts");
  assert.match(shell, /MobileAppBar/);
  assert.match(bar, /usePathname/);
  assert.match(bar, /router\.back\(\)/);
  for (const label of ["Dashboard", "Today", "Focus", "Progress"]) assert.match(navigation, new RegExp(`label: "${label}"`));
});

test("Phase 4 handles safe areas, software keyboards, landscape and tablets", () => {
  const css = read("app/styles/shell.css");
  const runtime = read("components/shell/adaptive-shell-runtime.tsx");
  const layout = read("app/layout.tsx");
  assert.match(layout, /viewportFit: "cover"/);
  assert.match(layout, /interactiveWidget: "resizes-content"/);
  assert.match(runtime, /window\.visualViewport/);
  assert.match(runtime, /keyboardInset > 120/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /min-width: 720px\) and \(max-width: 899px/);
  assert.match(css, /orientation: landscape/);
  assert.match(css, /html\[data-keyboard="open"\] \.mobile-bottom-nav/);
});

test("Phase 4 gives mobile, tablet and desktop distinct shell compositions", () => {
  const css = read("app/styles/shell.css");
  assert.match(css, /--mobile-rail-width: 76px/);
  assert.match(css, /grid-template-columns: 1fr/);
  assert.match(css, /@media \(min-width: 900px\)/);
  assert.match(css, /grid-template-columns: var\(--sidebar-width\)/);
});

test("Phase 4 overlays retain accessible focus, scroll and back behavior", () => {
  const overlay = read("components/ui/overlay.tsx");
  assert.match(overlay, /aria-modal="true"/);
  assert.match(overlay, /event\.key === "Escape"/);
  assert.match(overlay, /document\.body\.style\.overflow = "hidden"/);
  assert.match(overlay, /addEventListener\("popstate", onBack\)/);
  assert.match(overlay, /previous\?\.focus\(\)/);
});

test("Phase 4 reports connectivity while preserving offline ownership isolation", () => {
  const runtime = read("components/shell/adaptive-shell-runtime.tsx");
  const offline = read("components/offline/offline-runtime.tsx");
  assert.match(runtime, /addEventListener\("offline", offline\)/);
  assert.match(runtime, /Back online — synchronizing changes/);
  assert.match(offline, /identity\?\.userId !== context\.userId/);
  assert.match(offline, /flushPendingMutations/);
});

test("Phase 4 preserves zoom accessibility, reduced motion and touch targets", () => {
  const layout = read("app/layout.tsx");
  const tokens = read("app/styles/tokens.css");
  const css = read("app/styles/shell.css");
  assert.doesNotMatch(layout, /maximumScale|userScalable/);
  assert.match(tokens, /--touch-target: 44px/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /touch-action: manipulation/);
});
